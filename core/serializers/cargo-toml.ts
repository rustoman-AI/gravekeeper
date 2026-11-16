import { SCOPE_ORDER } from '../model';
import type { Scope, SerializableDependency } from '../model';

const HEADER_BY_SCOPE: Readonly<Partial<Record<Scope, string>>> = {
  runtime: '[dependencies]',
  dev: '[dev-dependencies]',
  build: '[build-dependencies]',
};

/** Tables in the order they are written: SCOPE_ORDER restricted to the scopes Cargo.toml supports. */
const TABLES: readonly (readonly [Scope, string])[] = SCOPE_ORDER.flatMap((scope): [Scope, string][] => {
  const header = HEADER_BY_SCOPE[scope];
  return header === undefined ? [] : [[scope, header]];
});

const SHORT_ESCAPES: Readonly<Record<number, string>> = {
  0x08: '\\b',
  0x09: '\\t',
  0x0a: '\\n',
  0x0c: '\\f',
  0x0d: '\\r',
  0x22: '\\"',
  0x5c: '\\\\',
};

/** TOML basic string: quoted, with escapes for `\`, `"`, control characters and DEL. Other text is literal. */
function basicString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const short = SHORT_ESCAPES[c];
    if (short !== undefined) out += short;
    else if (c < 0x20 || c === 0x7f) out += `\\u${c.toString(16).toUpperCase().padStart(4, '0')}`;
    else out += s[i];
  }
  return `${out}"`;
}

function entryLine(d: SerializableDependency): string {
  const key = basicString(d.name);
  const spec = basicString(d.versionSpec);
  if (d.sourceKind === 'git') return `${key} = { git = ${spec} }`;
  if (d.sourceKind === 'path') return `${key} = { path = ${spec} }`;
  return `${key} = ${spec}`;
}

// Requirement 5.3, 5.5, 5.11, 5.12, 5.14, 5.15, 5.16
/**
 * Writes `Cargo.toml` text from a list already filtered, sorted and deduplicated (Dependency_Order).
 * Tables are written as `[dependencies]`, `[dev-dependencies]`, `[build-dependencies]` (SCOPE_ORDER), only when non-empty,
 * separated by one blank line. Every entry is one line with a quoted key. `rawName` is ignored.
 * Empty input gives the empty string.
 */
export function writeCargoToml(sorted: readonly SerializableDependency[]): string {
  const blocks: string[] = [];
  for (const [scope, header] of TABLES) {
    const lines: string[] = [];
    for (const d of sorted) {
      if (d.scope === scope) lines.push(entryLine(d));
    }
    if (lines.length > 0) blocks.push(`${header}\n${lines.join('\n')}\n`);
  }
  return blocks.join('\n');
}
