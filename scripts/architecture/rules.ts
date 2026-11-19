import ts from 'typescript';
import { ZERO_ARGUMENT_DATE } from './globals';
import { isInsideDir, toPosix, type ResolvedSpecifier } from './resolve';

// Requirements 22.2, 22.4, 22.6 to 22.12, 22.17, 20.1, 20.10, 15.10

export type RuleId =
  | 'mapping-import-not-allowed'
  | 'mapping-forbidden-api'
  | 'range-package-not-allowed'
  | 'range-package-version-exact'
  | 'core-imports-upper-layer'
  | 'adapters-import-not-allowed'
  | 'layer-imports-adapters'
  | 'ports-missing-interface'
  | 'ports-import-not-allowed'
  | 'pipeline-forbidden-api'
  | 'file-name-style'
  | 'no-default-export'
  | 'token-reference-count'
  | 'token-client-reachability'
  | 'token-next-public'
  | 'adapters-forbidden-time-api'
  | 'non-literal-specifier';

interface RuleBase {
  id: RuleId;
  /** The requirement criteria the rule implements. */
  requirement: string;
  message: string;
}

/** Reports every import whose resolved target the predicate forbids. */
export interface ImportRule extends RuleBase {
  kind: 'import';
  appliesTo: (filePath: string) => boolean;
  forbids: (resolved: ResolvedSpecifier, filePath: string) => boolean;
}

/** Reports every use of a listed API, and every import of a listed package. */
export interface ApiRule extends RuleBase {
  kind: 'api';
  appliesTo: (filePath: string) => boolean;
  names: readonly string[];
  forbiddenPackages: readonly string[];
}

/** Reports lines found by a per-file check. */
export interface FileRule extends RuleBase {
  kind: 'file';
  appliesTo: (filePath: string) => boolean;
  lines: (filePath: string, text: string) => number[];
}

/** Rules that need the whole file set; `check.ts` evaluates them. */
export interface ProjectRule extends RuleBase {
  kind: 'project';
}

export type LayerRule = ImportRule | ApiRule | FileRule | ProjectRule;

export const SOURCE_PORT_NAMES: readonly string[] = [
  'GithubSource',
  'DepsDevSource',
  'OsvSource',
  'NpmSource',
  'CratesIoSource',
  'PypiSource',
];

/** Range packages and the one file allowed to import each (scan-accuracy Requirement 5.3). */
export const RANGE_PACKAGE_WRAPPERS: Readonly<Record<string, string>> = {
  semver: 'pipeline/mapping/range-semver.ts',
  '@renovatebot/pep440': 'pipeline/mapping/range-pep440.ts',
};

/** A package.json version that is a range, not an exact version. */
export const RANGE_VERSION_PATTERN = /^[~^<>=*]|(^|\.)[xX](\.|$)/;

export const TOKEN_TEXT = 'process.env.GITHUB_TOKEN';
export const SCAN_ROUTE_FILE = 'app/api/scan/route.ts';

const NETWORK_PACKAGES = ['http', 'https', 'http2', 'net', 'tls', 'dns', 'dgram'];
const TIME_APIS = [
  'Date.now',
  'performance.now',
  'Math.random',
  'setTimeout',
  'setInterval',
  ZERO_ARGUMENT_DATE,
];
const FILE_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*\.tsx?$/;

function inAny(filePath: string, dirs: readonly string[]): boolean {
  return dirs.some((dir) => isInsideDir(filePath, dir));
}

function isProjectPath(resolved: ResolvedSpecifier, dirs: readonly string[]): boolean {
  return resolved.kind === 'project' && inAny(resolved.path, dirs);
}

function isConstantsFile(p: string): boolean {
  return p === 'pipeline/constants' || p === 'pipeline/constants.ts';
}

/** 1-based line of a character index. */
export function lineOfIndex(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function parse(filePath: string, text: string): ts.SourceFile {
  const kind = /\.tsx$/i.test(filePath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, kind);
}

function lineOfNode(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

// Requirement 22.8
function defaultExportLines(filePath: string, text: string): number[] {
  const sf = parse(filePath, text);
  const lines: number[] = [];
  for (const statement of sf.statements) {
    let found = false;
    if (ts.isExportAssignment(statement)) {
      found = true;
    } else if (ts.isExportDeclaration(statement) && statement.exportClause) {
      if (ts.isNamedExports(statement.exportClause)) {
        found = statement.exportClause.elements.some((e) => e.name.text === 'default');
      }
    } else {
      const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
      found =
        modifiers !== undefined &&
        modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
        modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
    }
    if (found) lines.push(lineOfNode(sf, statement));
  }
  return lines;
}

// Requirement 22.8
function fileNameLines(filePath: string): number[] {
  const base = toPosix(filePath).split('/').pop() ?? '';
  return FILE_NAME_PATTERN.test(base) ? [] : [1];
}

// Requirement 22.17
function nextPublicLines(_filePath: string, text: string): number[] {
  if (!text.includes('GITHUB_TOKEN')) return [];
  const index = text.indexOf('NEXT_PUBLIC_');
  return index < 0 ? [] : [lineOfIndex(text, index)];
}

/** Names of the interfaces a file exports (Requirement 22.11). */
export function exportedInterfaceNames(filePath: string, text: string): string[] {
  const sf = parse(filePath, text);
  const names: string[] = [];
  for (const statement of sf.statements) {
    if (
      ts.isInterfaceDeclaration(statement) &&
      ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      names.push(statement.name.text);
    }
  }
  return names;
}

export const LAYER_RULES: readonly LayerRule[] = [
  {
    kind: 'import',
    id: 'mapping-import-not-allowed',
    requirement: '22.2, 13.1',
    message:
      'pipeline/mapping may import only core, pipeline/mapping and pipeline/constants.ts, and no package',
    appliesTo: (f) => isInsideDir(f, 'pipeline/mapping'),
    forbids: (r, f) =>
      (r.kind === 'package' && RANGE_PACKAGE_WRAPPERS[r.name] !== toPosix(f)) ||
      (r.kind === 'project' && !(
        inAny(r.path, ['core', 'pipeline/mapping']) ||
        isConstantsFile(r.path)
      )),
  },
  {
    kind: 'import',
    id: 'range-package-not-allowed',
    requirement: '5.3',
    message: 'semver and @renovatebot/pep440 may be imported only by their wrapper file in pipeline/mapping',
    appliesTo: () => true,
    forbids: (r, f) =>
      r.kind === 'package' &&
      Object.prototype.hasOwnProperty.call(RANGE_PACKAGE_WRAPPERS, r.name) &&
      RANGE_PACKAGE_WRAPPERS[r.name] !== toPosix(f),
  },
  {
    kind: 'project',
    id: 'range-package-version-exact',
    requirement: '5.4',
    message: 'semver and @renovatebot/pep440 must be pinned to an exact version in package.json',
  },
  {
    kind: 'api',
    id: 'mapping-forbidden-api',
    requirement: '22.6, 13.2',
    message: 'pipeline/mapping must not use fetch, fs, Date.now, Math.random, process.env, performance.now or Date()',
    appliesTo: (f) => isInsideDir(f, 'pipeline/mapping'),
    names: [
      'fetch',
      'fs',
      'Date.now',
      'Math.random',
      'process.env',
      'performance.now',
      ZERO_ARGUMENT_DATE,
    ],
    forbiddenPackages: [],
  },
  {
    kind: 'import',
    id: 'core-imports-upper-layer',
    requirement: '22.4, 22.7',
    message: 'core must not import pipeline, adapters, app or components',
    appliesTo: (f) => isInsideDir(f, 'core'),
    forbids: (r) => isProjectPath(r, ['pipeline', 'adapters', 'app', 'components']),
  },
  {
    kind: 'import',
    id: 'adapters-import-not-allowed',
    requirement: '22.9',
    message:
      'adapters may import only core, adapters, pipeline/ports and pipeline/constants.ts among project files',
    appliesTo: (f) => isInsideDir(f, 'adapters'),
    forbids: (r) =>
      r.kind === 'project' &&
      (isInsideDir(r.path, 'app') ||
        isInsideDir(r.path, 'components') ||
        (isInsideDir(r.path, 'pipeline') &&
          !isInsideDir(r.path, 'pipeline/ports') &&
          !isConstantsFile(r.path))),
  },
  {
    kind: 'import',
    id: 'layer-imports-adapters',
    requirement: '22.10',
    message: 'only the Scan_Route file may import adapters',
    appliesTo: (f) =>
      inAny(f, ['core', 'pipeline', 'app', 'components']) && toPosix(f) !== SCAN_ROUTE_FILE,
    forbids: (r) => isProjectPath(r, ['adapters']),
  },
  {
    kind: 'project',
    id: 'ports-missing-interface',
    requirement: '22.11',
    message: 'pipeline/ports must export an interface for each Source_Port name',
  },
  {
    kind: 'import',
    id: 'ports-import-not-allowed',
    requirement: '22.11',
    message: 'pipeline/ports may import only core, pipeline/ports and pipeline/constants.ts',
    appliesTo: (f) => isInsideDir(f, 'pipeline/ports'),
    forbids: (r) =>
      r.kind === 'package' ||
      !(inAny(r.path, ['core', 'pipeline/ports']) || isConstantsFile(r.path)),
  },
  {
    kind: 'api',
    id: 'pipeline-forbidden-api',
    requirement: '22.12',
    message:
      'pipeline must not use fetch, XMLHttpRequest, clock, random or timer APIs, or import network modules',
    appliesTo: (f) => isInsideDir(f, 'pipeline'),
    names: ['fetch', 'XMLHttpRequest', ...TIME_APIS],
    forbiddenPackages: NETWORK_PACKAGES,
  },
  {
    kind: 'file',
    id: 'file-name-style',
    requirement: '22.8',
    message: 'file names are lowercase letters and digits joined by single hyphens',
    appliesTo: (f) => inAny(f, ['pipeline', 'adapters']) && /\.tsx?$/.test(f),
    lines: (f) => fileNameLines(f),
  },
  {
    kind: 'file',
    id: 'no-default-export',
    requirement: '22.8',
    message: 'pipeline and adapters files must not use export default or export =',
    appliesTo: (f) =>
      inAny(f, ['pipeline', 'adapters']) && /\.tsx?$/.test(f) && toPosix(f) !== SCAN_ROUTE_FILE,
    lines: defaultExportLines,
  },
  {
    kind: 'project',
    id: 'token-reference-count',
    requirement: '22.17',
    message: 'at most one source file may contain process.env.GITHUB_TOKEN',
  },
  {
    kind: 'project',
    id: 'token-client-reachability',
    requirement: '22.17, 20.1',
    message: "a 'use client' file must not reach the file that reads GITHUB_TOKEN",
  },
  {
    kind: 'file',
    id: 'token-next-public',
    requirement: '22.17, 20.10',
    message: 'a file that references GITHUB_TOKEN must not contain NEXT_PUBLIC_',
    appliesTo: () => true,
    lines: nextPublicLines,
  },
  {
    kind: 'api',
    id: 'adapters-forbidden-time-api',
    requirement: '15.10',
    message: 'adapters must take the clock, timer and random source as arguments',
    appliesTo: (f) =>
      isInsideDir(f, 'adapters') && !/^adapters\/runtime\/system-[^/]*$/.test(toPosix(f)),
    names: TIME_APIS,
    forbiddenPackages: [],
  },
];

export const NON_LITERAL_SPECIFIER_MESSAGE = 'module specifier is not a string literal';

/** Message of a rule id, for the CLI. */
export function ruleMessage(id: RuleId): string {
  if (id === 'non-literal-specifier') return NON_LITERAL_SPECIFIER_MESSAGE;
  return LAYER_RULES.find((r) => r.id === id)?.message ?? id;
}
