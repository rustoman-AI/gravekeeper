// Test-only pyproject.toml writer (requirements R11.2, design: Round trip).
// Two styles: PEP 621 (+ PEP 735 for dev) and Poetry. The layout is fixed: sections in a set order, one entry
// per line in input order, two-space indent, LF line endings, one trailing newline, no comments.
// Input is a Dependency list with no repeated (name, scope), scopes in runtime | dev | optional, and versionSpec
// text that both styles can carry (`*`, or comma-joined comparison terms; git and path targets without
// whitespace followed by `;` or `#`). The name written is `rawName` when present, else `name`.
import type { Dependency, SerializableDependency } from '../../../core/model';

export type PyprojectStyle = 'pep621' | 'poetry';

/** The extra name that `optional` entries are written under (PEP 621 style). */
export const WRITER_EXTRA = 'extra';
/** The group name that `dev` entries are written under (both styles). */
export const WRITER_GROUP = 'dev';

/** A TOML basic string: escapes `"`, `\`, control characters and DEL; every other code unit is kept. */
export function tomlBasicString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) out += '\\"';
    else if (c === 0x5c) out += '\\\\';
    else if (c < 0x20 || c === 0x7f) out += `\\u${c.toString(16).padStart(4, '0')}`;
    else out += s.charAt(i);
  }
  return `${out}"`;
}

type Dep = SerializableDependency | Dependency;

const writtenName = (d: Dep): string => d.rawName ?? d.name;

/** PEP 508 text of one entry: `name`, `name<spec>`, or `name @ target`. */
function pep508(d: Dep): string {
  const name = writtenName(d);
  if (d.sourceKind !== 'registry') return `${name} @ ${d.versionSpec}`;
  return d.versionSpec === '*' ? name : `${name}${d.versionSpec}`;
}

/** Poetry value of one entry (a string or an inline table). */
function poetryValue(d: Dep): string {
  const optional = d.scope === 'optional' ? ', optional = true' : '';
  if (d.sourceKind === 'git') return `{ git = ${tomlBasicString(d.versionSpec)}${optional} }`;
  if (d.sourceKind === 'path') return `{ path = ${tomlBasicString(d.versionSpec)}${optional} }`;
  if (d.scope === 'optional') return `{ version = ${tomlBasicString(d.versionSpec)}${optional} }`;
  return tomlBasicString(d.versionSpec);
}

function arrayLines(key: string, items: readonly string[]): string[] {
  return [`${key} = [`, ...items.map((i) => `  ${tomlBasicString(i)},`), ']'];
}

function writePep621(deps: readonly Dep[]): string {
  const of = (scope: Dep['scope']): string[] => deps.filter((d) => d.scope === scope).map(pep508);
  const runtime = of('runtime');
  const optional = of('optional');
  const dev = of('dev');
  const sections: string[][] = [];
  if (runtime.length > 0) sections.push(['[project]', ...arrayLines('dependencies', runtime)]);
  if (optional.length > 0) {
    sections.push(['[project.optional-dependencies]', ...arrayLines(WRITER_EXTRA, optional)]);
  }
  if (dev.length > 0) sections.push(['[dependency-groups]', ...arrayLines(WRITER_GROUP, dev)]);
  return sections.map((s) => s.join('\n')).join('\n\n');
}

function writePoetry(deps: readonly Dep[]): string {
  const entry = (d: Dep): string => `${tomlBasicString(writtenName(d))} = ${poetryValue(d)}`;
  // runtime and optional share one table, so one key cannot carry both scopes (TOML forbids a repeated key).
  const mainDeps = deps.filter((d) => d.scope === 'runtime' || d.scope === 'optional');
  const seen = new Set<string>();
  for (const d of mainDeps) {
    const key = writtenName(d);
    if (seen.has(key)) throw new Error(`Poetry style cannot write "${key}" twice in [tool.poetry.dependencies]`);
    seen.add(key);
  }
  const main = mainDeps.map(entry);
  const dev = deps.filter((d) => d.scope === 'dev').map(entry);
  const sections: string[][] = [];
  if (main.length > 0) sections.push(['[tool.poetry.dependencies]', ...main]);
  if (dev.length > 0) sections.push([`[tool.poetry.group.${WRITER_GROUP}.dependencies]`, ...dev]);
  return sections.map((s) => s.join('\n')).join('\n\n');
}

/** Serializes `deps` to Pyproject_Text in the given style. Same input, same text. An empty list gives ''. */
export function writePyproject(deps: readonly Dep[], style: PyprojectStyle): string {
  const body = style === 'pep621' ? writePep621(deps) : writePoetry(deps);
  return body === '' ? '' : `${body}\n`;
}
