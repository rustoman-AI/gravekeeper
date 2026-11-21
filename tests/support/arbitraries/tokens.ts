// Token dictionaries, noise strings and mutation operators shared by the manifest arbitraries
// (design: Generator strategy: manifests). Per-format renderers and arbitraries live in their own files.
import * as fc from 'fast-check';
import type { ManifestFormat } from '../../../core/model';

export const HUGE_LENGTH = 100_000;

export const PACKAGE_JSON_TOKENS: readonly string[] = [
  '{', '}', '[', ']',
  '"dependencies"', '"devDependencies"', '"optionalDependencies"', '"peerDependencies"',
  ':', ',', 'null', 'true', '1e999', '"\\u0000"', '"__proto__"', '"constructor"',
  '"file:"', '"git+https://x"', '"github:a/b"', '"a/b#c"', '"workspace:*"',
  '"a":"1","a":"2"', // duplicated key
];

export const REQUIREMENTS_TOKENS: readonly string[] = [
  '\\', '\r\n', '\r', ' #', '#egg=', '[extras]', ';', ' ; python_version<"3"', '@', ' @ git+https://h/r',
  '-r ', '--index-url ', '==', '>=', '~=', '!=', '*', './', '../', '/', 'file:', 'git+', '_', '.', '--',
  'Django', 'PyYAML', '\u212A', '\u0130', // uppercase and non-ASCII look-alike letters
];

export const CARGO_TOKENS: readonly string[] = [
  '[dependencies]', '[dev-dependencies]', '[build-dependencies]', "[target.'cfg(unix)'.dependencies]",
  '[dependencies.foo]', '{', '}', '=', '"""', "'''", 'version', 'package', 'git', 'path',
  'workspace = true', '__proto__', '1979-05-27T07:32:00Z', '0x1F', 'inf', 'nan', '\\u0000',
  '[dependencies]\n[dependencies]', // duplicate table header
  'a = "unterminated', // unterminated string
];

export const PYPROJECT_TOKENS: readonly string[] = [
  '[project]', '[project.optional-dependencies]', '[dependency-groups]', '[build-system]', '[tool.poetry.dependencies]',
  '[tool.poetry.group.dev.dependencies]', 'dependencies = [', ']', '[', '{', '}', '=', '"""', "'''", 'python = "^3.9"',
  'requires = [', 'name = "x"', '{ include-group = "dev" }', '"requests>=2.0"', '"Django[argon2]>=4 ; python_version<\"3.12\""',
  '"pkg @ git+https://h/r"', '"a==1.*"', '"a~=1.4.2"', '"a===1.0"', '"__proto__"', 'a = { git = "https://h/r" }', 'a = { path = "../a" }',
  '1979-05-27T07:32:00Z', 'inf', 'nan', '\\u0000', 'x = "unterminated',
];

export const TOKENS_BY_FORMAT: Readonly<Record<ManifestFormat, readonly string[]>> = {
  'package.json': PACKAGE_JSON_TOKENS,
  'requirements.txt': REQUIREMENTS_TOKENS,
  'pyproject.toml': PYPROJECT_TOKENS,
  'Cargo.toml': CARGO_TOKENS,
};

/** Dictionary tokens mixed with random strings, joined as they are. */
export const arbTokenNoise = (format: ManifestFormat, maxItems = 40): fc.Arbitrary<string> =>
  fc
    .array(fc.oneof(fc.constantFrom(...TOKENS_BY_FORMAT[format]), fc.string({ maxLength: 12 })), { maxLength: maxItems })
    .map((parts) => parts.join(''));

const arbLoremLines = fc
  .array(fc.stringMatching(/^[a-z]{1,8}( [a-z]{1,8}){0,4}$/), { maxLength: 20 })
  .map((lines) => lines.join('\n'));

/** Pure noise: arbitrary text, lone surrogates and control characters, valid-but-unexpected JSON shapes. */
export const arbPureNoise: fc.Arbitrary<string> = fc.oneof(
  fc.string({ maxLength: 2000 }),
  fc.string({ unit: 'grapheme', maxLength: 500 }),
  fc.string({ unit: 'binary', maxLength: 2000 }),
  fc.json(),
  fc.jsonValue().map((v) => JSON.stringify(v)),
  arbLoremLines,
);

/** Noise for one format: pure noise and token noise. */
export const arbNoise = (format: ManifestFormat): fc.Arbitrary<string> =>
  fc.oneof({ weight: 2, arbitrary: arbPureNoise }, { weight: 3, arbitrary: arbTokenNoise(format) });

// ---------------------------------------------------------------------------
// Mutation operators. Mutations are plain data (readable in a shrunk counterexample);
// positions are reduced modulo the text length when applied, so they work on any text.
// ---------------------------------------------------------------------------

export const DELIMITERS: readonly string[] = ['"', ',', '{', '}', '[', ']', '=', '\\'];

export type TextMutation =
  | { readonly kind: 'truncate'; readonly at: number }
  | { readonly kind: 'insert'; readonly at: number; readonly text: string }
  | { readonly kind: 'delete'; readonly at: number; readonly length: number }
  | { readonly kind: 'duplicateSlice'; readonly at: number; readonly length: number }
  | { readonly kind: 'duplicateLine'; readonly line: number }
  | { readonly kind: 'swapDelimiter'; readonly nth: number; readonly to: string }
  | { readonly kind: 'lineEndings'; readonly style: 'crlf' | 'cr' }
  | { readonly kind: 'bom' }
  | { readonly kind: 'hugeValue'; readonly at: number; readonly char: string }
  | { readonly kind: 'protoName'; readonly at: number }
  | { readonly kind: 'badChar'; readonly at: number; readonly char: '\uD800' | '\uDC00' | '\u0000' }
  | { readonly kind: 'repeatHeader'; readonly nth: number };

const arbPos = fc.nat({ max: 1_000_000 });

export const arbMutation: fc.Arbitrary<TextMutation> = fc.oneof(
  fc.record({ kind: fc.constant('truncate' as const), at: arbPos }),
  fc.record({ kind: fc.constant('insert' as const), at: arbPos, text: fc.string({ maxLength: 8 }) }),
  fc.record({ kind: fc.constant('delete' as const), at: arbPos, length: fc.nat({ max: 50 }) }),
  fc.record({ kind: fc.constant('duplicateSlice' as const), at: arbPos, length: fc.nat({ max: 50 }) }),
  fc.record({ kind: fc.constant('duplicateLine' as const), line: arbPos }),
  fc.record({ kind: fc.constant('swapDelimiter' as const), nth: arbPos, to: fc.constantFrom(...DELIMITERS) }),
  fc.record({ kind: fc.constant('lineEndings' as const), style: fc.constantFrom('crlf' as const, 'cr' as const) }),
  fc.constant({ kind: 'bom' as const }),
  fc.record({ kind: fc.constant('hugeValue' as const), at: arbPos, char: fc.constantFrom('a', 'Z', '0', '-') }),
  fc.record({ kind: fc.constant('protoName' as const), at: arbPos }),
  fc.record({
    kind: fc.constant('badChar' as const),
    at: arbPos,
    char: fc.constantFrom('\uD800' as const, '\uDC00' as const, '\u0000' as const),
  }),
  fc.record({ kind: fc.constant('repeatHeader' as const), nth: arbPos }),
);

/** One to three mutations. */
export const arbMutations: fc.Arbitrary<TextMutation[]> = fc.array(arbMutation, { minLength: 1, maxLength: 3 });

const HEADER_LINE = /^\s*(\[|"(dependencies|devDependencies|optionalDependencies|peerDependencies)"\s*:)/;

/** Applies one mutation. Never throws; an inapplicable mutation (for example repeatHeader without a header) returns the text. */
export function applyMutation(text: string, m: TextMutation): string {
  const at = (p: number) => p % (text.length + 1);
  switch (m.kind) {
    case 'truncate':
      return text.slice(0, at(m.at));
    case 'insert': {
      const i = at(m.at);
      return text.slice(0, i) + m.text + text.slice(i);
    }
    case 'delete': {
      const i = at(m.at);
      return text.slice(0, i) + text.slice(i + m.length);
    }
    case 'duplicateSlice': {
      const i = at(m.at);
      return text.slice(0, i + m.length) + text.slice(i, i + m.length) + text.slice(i + m.length);
    }
    case 'duplicateLine': {
      const lines = text.split('\n');
      const i = m.line % lines.length;
      lines.splice(i, 0, lines[i]);
      return lines.join('\n');
    }
    case 'swapDelimiter': {
      const positions: number[] = [];
      for (let i = 0; i < text.length; i++) if (DELIMITERS.includes(text.charAt(i))) positions.push(i);
      if (positions.length === 0) return text;
      const p = positions[m.nth % positions.length];
      return text.slice(0, p) + m.to + text.slice(p + 1);
    }
    case 'lineEndings':
      return text.replace(/\r\n|\r|\n/g, m.style === 'crlf' ? '\r\n' : '\r');
    case 'bom':
      return '\uFEFF' + text;
    case 'hugeValue': {
      const i = at(m.at);
      return text.slice(0, i) + m.char.repeat(HUGE_LENGTH) + text.slice(i);
    }
    case 'protoName': {
      const i = at(m.at);
      return text.slice(0, i) + '__proto__' + text.slice(i);
    }
    case 'badChar': {
      if (text.length === 0) return m.char;
      const i = m.at % text.length;
      return text.slice(0, i) + m.char + text.slice(i + 1);
    }
    case 'repeatHeader': {
      const lines = text.split('\n');
      const headers = lines.flatMap((l, i) => (HEADER_LINE.test(l) ? [i] : []));
      if (headers.length === 0) return text;
      const i = headers[m.nth % headers.length];
      lines.splice(i, 0, lines[i]);
      return lines.join('\n');
    }
  }
}

export function applyMutations(text: string, ms: readonly TextMutation[]): string {
  return ms.reduce(applyMutation, text);
}

/** Corruption path: a valid text (or fixture) with one to three mutations applied. */
export const arbMutatedText = (base: fc.Arbitrary<string>): fc.Arbitrary<string> =>
  fc.tuple(base, arbMutations).map(([text, ms]) => applyMutations(text, ms));
