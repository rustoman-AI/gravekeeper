import ts from 'typescript';
import { findForbiddenApi } from './globals';
import { extractImports, type ImportRef } from './imports';
import {
  LAYER_RULES,
  RANGE_PACKAGE_WRAPPERS,
  RANGE_VERSION_PATTERN,
  SOURCE_PORT_NAMES,
  TOKEN_TEXT,
  exportedInterfaceNames,
  lineOfIndex,
  type RuleId,
} from './rules';
import { isInsideDir, resolveSpecifier, toPosix } from './resolve';

// Requirements 22.2, 22.4, 22.6 to 22.14, 22.17

export interface SourceFileInput {
  path: string;
  text: string;
}

export interface Violation {
  file: string;
  /** 1-based line. */
  line: number;
  rule: RuleId;
}

export interface ImportEdge {
  target: string;
  line: number;
}

/** Import graph over project files: path to the files it imports. */
export type ImportGraph = ReadonlyMap<string, readonly ImportEdge[]>;

function candidates(resolvedPath: string): string[] {
  const p = resolvedPath.replace(/\/+$/, '');
  return [p, `${p}.ts`, `${p}.tsx`, `${p}/index.ts`, `${p}/index.tsx`];
}

/** Builds the import graph. Edges only point at files present in `files`. */
export function buildImportGraph(files: readonly SourceFileInput[]): ImportGraph {
  const known = new Set(files.map((f) => toPosix(f.path)));
  const graph = new Map<string, ImportEdge[]>();
  for (const file of files) {
    const from = toPosix(file.path);
    const edges: ImportEdge[] = graph.get(from) ?? [];
    for (const ref of extractImports(from, file.text)) {
      if (ref.specifier === null) continue;
      const resolved = resolveSpecifier(from, ref.specifier);
      if (resolved.kind !== 'project') continue;
      const target = candidates(resolved.path).find((c) => known.has(c));
      if (target !== undefined) edges.push({ target, line: ref.line });
    }
    graph.set(from, edges);
  }
  return graph;
}

/** True when the file starts with the `'use client'` directive. */
function hasUseClientDirective(filePath: string, text: string): boolean {
  const kind = /\.tsx$/i.test(filePath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, false, kind);
  for (const statement of sf.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    if (statement.expression.text === 'use client') return true;
  }
  return false;
}

function importViolations(
  file: string,
  refs: readonly ImportRef[],
  out: Violation[],
): void {
  for (const ref of refs) {
    if (ref.specifier === null) {
      out.push({ file, line: ref.line, rule: 'non-literal-specifier' });
      continue;
    }
    const resolved = resolveSpecifier(file, ref.specifier);
    for (const rule of LAYER_RULES) {
      if (rule.kind === 'import' && rule.appliesTo(file) && rule.forbids(resolved, file)) {
        out.push({ file, line: ref.line, rule: rule.id });
      } else if (rule.kind === 'api' && rule.appliesTo(file) && resolved.kind === 'package') {
        const name = resolved.name.replace(/^node:/, '').split('/')[0];
        if (rule.forbiddenPackages.includes(name)) out.push({ file, line: ref.line, rule: rule.id });
      }
    }
  }
}

function checkTokenRules(files: readonly SourceFileInput[], out: Violation[]): void {
  const tokenLine = new Map<string, number>();
  for (const f of files) {
    const index = f.text.indexOf(TOKEN_TEXT);
    if (index >= 0) tokenLine.set(toPosix(f.path), lineOfIndex(f.text, index));
  }
  if (tokenLine.size > 1) {
    for (const [file, line] of tokenLine) out.push({ file, line, rule: 'token-reference-count' });
  }
  if (tokenLine.size === 0) return;

  const graph = buildImportGraph(files);
  const reaches = new Map<string, boolean>();
  const reachesToken = (start: string): boolean => {
    const cached = reaches.get(start);
    if (cached !== undefined) return cached;
    const seen = new Set<string>();
    const stack = [start];
    while (stack.length > 0) {
      const current = stack.pop() as string;
      if (seen.has(current)) continue;
      seen.add(current);
      if (tokenLine.has(current)) {
        reaches.set(start, true);
        return true;
      }
      for (const edge of graph.get(current) ?? []) stack.push(edge.target);
    }
    reaches.set(start, false);
    return false;
  };

  for (const f of files) {
    const file = toPosix(f.path);
    if (!hasUseClientDirective(file, f.text)) continue;
    const own = tokenLine.get(file);
    if (own !== undefined) out.push({ file, line: own, rule: 'token-client-reachability' });
    for (const edge of graph.get(file) ?? []) {
      if (reachesToken(edge.target)) {
        out.push({ file, line: edge.line, rule: 'token-client-reachability' });
      }
    }
  }
}

// Requirement 22.11
function checkPortsInterfaces(files: readonly SourceFileInput[], out: Violation[]): void {
  const ports = files
    .map((f) => ({ path: toPosix(f.path), text: f.text }))
    .filter((f) => isInsideDir(f.path, 'pipeline/ports'))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  if (ports.length === 0) return;
  const exported = new Set<string>();
  for (const f of ports) for (const name of exportedInterfaceNames(f.path, f.text)) exported.add(name);
  const anchor = ports.find((f) => f.path === 'pipeline/ports/index.ts') ?? ports[0];
  for (const name of SOURCE_PORT_NAMES) {
    if (!exported.has(name)) out.push({ file: anchor.path, line: 1, rule: 'ports-missing-interface' });
  }
}

/**
 * Reports range packages declared with a range instead of an exact version.
 * Absent packages and unparsable JSON give no violation. Pure; the CLI reads the file.
 */
export function checkRangePackageVersions(packageJsonText: string, file = 'package.json'): Violation[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(packageJsonText);
  } catch {
    return [];
  }
  if (typeof parsed !== 'object' || parsed === null) return [];
  const out: Violation[] = [];
  const lines = packageJsonText.split('\n');
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    const deps = (parsed as Record<string, unknown>)[section];
    if (typeof deps !== 'object' || deps === null) continue;
    for (const name of Object.keys(RANGE_PACKAGE_WRAPPERS)) {
      if (!Object.prototype.hasOwnProperty.call(deps, name)) continue;
      const version = (deps as Record<string, unknown>)[name];
      if (typeof version !== 'string' || !RANGE_VERSION_PATTERN.test(version.trim())) continue;
      const index = lines.findIndex((l) => l.includes(`\"${name}\"`));
      out.push({ file, line: index < 0 ? 1 : index + 1, rule: 'range-package-version-exact' });
    }
  }
  return out;
}

function compareViolations(a: Violation, b: Violation): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  if (a.line !== b.line) return a.line - b.line;
  return a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0;
}

/**
 * Checks the architecture rules over a set of files (project-root-relative paths).
 * Pure and deterministic: parses text only, never throws on syntax errors,
 * returns violations sorted by file, line and rule without duplicates.
 */
export function checkArchitecture(files: readonly SourceFileInput[]): Violation[] {
  const out: Violation[] = [];
  for (const input of files) {
    const file = toPosix(input.path);
    importViolations(file, extractImports(file, input.text), out);
    for (const rule of LAYER_RULES) {
      if (rule.kind === 'api' && rule.appliesTo(file)) {
        for (const use of findForbiddenApi(input.text, rule.names)) {
          out.push({ file, line: use.line, rule: rule.id });
        }
      } else if (rule.kind === 'file' && rule.appliesTo(file)) {
        for (const line of rule.lines(file, input.text)) out.push({ file, line, rule: rule.id });
      }
    }
  }
  checkPortsInterfaces(files, out);
  checkTokenRules(files, out);

  out.sort(compareViolations);
  return out.filter((v, i) => i === 0 || compareViolations(out[i - 1], v) !== 0);
}
