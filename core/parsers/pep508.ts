// PEP 508 entry reader for pyproject.toml (design: "core/parsers/pep508.ts").
//
// Same lexical rules as one requirements.txt line, without comment stripping, line continuation and option lines.
// Every step is a linear scan or a prefix check; there is no regex with nested quantifiers.
import { directReferenceKind, isNameToken, isRegistryRest } from '../formats/requirements-lexical';
import type { SourceKind } from '../model';

export type Pep508Result =
  | { readonly kind: 'ok'; readonly rawName: string; readonly versionSpec: string; readonly sourceKind: SourceKind }
  | { readonly kind: 'cannot-parse' }
  | { readonly kind: 'backslash' };

const CANNOT_PARSE: Pep508Result = { kind: 'cannot-parse' };
const BACKSLASH: Pep508Result = { kind: 'backslash' };

function isWhitespace(ch: string): boolean {
  return /\s/.test(ch);
}

function isNameChar(c: number): boolean {
  return (
    (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c === 0x2e || c === 0x5f || c === 0x2d
  );
}

// Requirement 3.4
/** Cuts at the first whitespace character that is directly followed by `;` (an environment marker). */
function cutMarkerAfterWhitespace(text: string): string {
  for (let i = 1; i < text.length; i++) {
    if (text[i] === ';' && isWhitespace(text[i - 1] as string)) return text.slice(0, i);
  }
  return text;
}

// Requirement 3.4, 3.5, 3.6, 3.8
/** Reads one PEP 508 entry. Total: never throws. */
export function parsePep508(entry: string): Pep508Result {
  const trimmed = entry.trim();

  // Requirement 3.8: `#` is ordinary text. A bare reference (`git+...#egg=name`, `./p#egg=name`) has no `name @`
  // and cannot be parsed.
  if (trimmed === '' || directReferenceKind(trimmed) !== null) return CANNOT_PARSE;

  // Requirement 3.4: Name_Token
  let pos = 0;
  while (pos < trimmed.length && isNameChar(trimmed.charCodeAt(pos))) pos += 1;
  const rawName = trimmed.slice(0, pos);
  if (!isNameToken(rawName)) return CANNOT_PARSE;

  // Requirement 3.4: extras are skipped up to the first `]`
  while (pos < trimmed.length && isWhitespace(trimmed[pos] as string)) pos += 1;
  if (trimmed[pos] === '[') {
    const close = trimmed.indexOf(']', pos);
    if (close < 0) return CANNOT_PARSE;
    pos = close + 1;
  }
  while (pos < trimmed.length && isWhitespace(trimmed[pos] as string)) pos += 1;
  const rest = trimmed.slice(pos);

  // Requirement 3.4, 3.6: direct reference `<name> @ <target>`, marker cut at whitespace followed by `;`
  if (rest.startsWith('@')) {
    const target = cutMarkerAfterWhitespace(rest.slice(1).trim()).trim();
    const sourceKind = directReferenceKind(target);
    if (sourceKind === null) return CANNOT_PARSE;
    if (target.includes('\\')) return BACKSLASH;
    return { kind: 'ok', rawName, versionSpec: target, sourceKind };
  }

  // Requirement 3.4, 3.5, 3.6: registry specifier, environment marker cut at the first `;`
  const semicolon = rest.indexOf(';');
  const spec = (semicolon < 0 ? rest : rest.slice(0, semicolon)).trim();
  if (!isRegistryRest(spec)) return CANNOT_PARSE;
  if (spec.includes('\\')) return BACKSLASH;
  // Requirement 3.5: an empty specifier gives `*`
  return { kind: 'ok', rawName, versionSpec: spec === '' ? '*' : spec, sourceKind: 'registry' };
}
