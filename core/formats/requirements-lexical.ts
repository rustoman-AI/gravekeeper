// Lexical knowledge of requirements.txt shared by the parser and the serializer.
// Everything here is a linear scan or prefix check. No regex with nested quantifiers (ReDoS).
import type { SourceKind } from '../model';

/** Comparison operators, longest first so that prefix checks pick the longest match. */
export const COMPARISON_OPERATORS = ['===', '==', '!=', '<=', '>=', '~=', '<', '>'] as const;

const GIT_PREFIX = 'git+';
const PATH_PREFIXES = ['file:', './', '../', '/'] as const;

const WHITESPACE = /\s/;

function isWhitespaceChar(ch: string): boolean {
  return WHITESPACE.test(ch);
}

function isAsciiAlnum(c: number): boolean {
  return (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
}

// Requirement 2.14
/** PEP503_Normalization: ASCII A-Z to lower case, runs of `-`, `_` and `.` to one `-`. Other characters unchanged. */
export function normalizePypiName(s: string): string {
  let out = '';
  let inSeparatorRun = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x2d || c === 0x5f || c === 0x2e) {
      if (!inSeparatorRun) out += '-';
      inSeparatorRun = true;
      continue;
    }
    inSeparatorRun = false;
    out += c >= 0x41 && c <= 0x5a ? String.fromCharCode(c + 0x20) : s[i];
  }
  return out;
}

// Requirement 2.8
/** Name_Token: `[A-Za-z0-9][A-Za-z0-9._-]*`, checked by a single scan. */
export function isNameToken(s: string): boolean {
  if (s.length === 0 || !isAsciiAlnum(s.charCodeAt(0))) return false;
  for (let i = 1; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (!isAsciiAlnum(c) && c !== 0x2e && c !== 0x5f && c !== 0x2d) return false;
  }
  return true;
}

// Requirement 5.11
/** Written_Name: `rawName` when its normalization equals `name`, otherwise `name`. */
export function writtenName(dep: { readonly name: string; readonly rawName?: string }): string {
  const { rawName } = dep;
  return rawName !== undefined && normalizePypiName(rawName) === dep.name ? rawName : dep.name;
}

// Requirement 2.8
/** True when `text` starts with one of the comparison operators. */
export function startsWithComparisonOperator(text: string): boolean {
  for (const op of COMPARISON_OPERATORS) {
    if (text.startsWith(op)) return true;
  }
  return false;
}

// Requirement 2.8
/** True for the text after name and extras of a registry line: empty, `*`, or starting with a comparison operator. */
export function isRegistryRest(rest: string): boolean {
  return rest === '' || rest === '*' || startsWithComparisonOperator(rest);
}

// Requirement 2.10
/** True when the text starts with `git+`. */
export function isGitReference(text: string): boolean {
  return text.startsWith(GIT_PREFIX);
}

// Requirement 2.11
/** True when the text starts with `file:`, `./`, `../` or `/`. */
export function isPathReference(text: string): boolean {
  for (const prefix of PATH_PREFIXES) {
    if (text.startsWith(prefix)) return true;
  }
  return false;
}

// Requirement 2.10, 2.11
/** Source kind of a direct-reference target, or null when it is neither a VCS URL nor a local path. */
export function directReferenceKind(target: string): 'git' | 'path' | null {
  if (isGitReference(target)) return 'git';
  if (isPathReference(target)) return 'path';
  return null;
}

// True when a whitespace character is directly followed by one of the given characters.
function hasWhitespaceThen(text: string, chars: string): boolean {
  for (let i = 1; i < text.length; i++) {
    if (chars.includes(text[i]) && isWhitespaceChar(text[i - 1])) return true;
  }
  return false;
}

// Requirement 5.13
/**
 * Canonical-spec predicate for requirements.txt: true when `versionSpec` can be written and parsed back
 * unchanged for the given `sourceKind` (no newline, no backslash, no outer whitespace, source prefix matches the kind,
 * registry specs are `*` or start with a comparison operator and carry no `;` or whitespace-led `#`, git and path specs
 * carry no whitespace followed by `;` or `#`).
 */
export function isCanonicalRequirementsSpec(versionSpec: string, sourceKind: SourceKind): boolean {
  if (versionSpec.includes('\n') || versionSpec.includes('\r') || versionSpec.includes('\\')) return false;
  if (versionSpec.length > 0) {
    if (isWhitespaceChar(versionSpec[0]) || isWhitespaceChar(versionSpec[versionSpec.length - 1])) return false;
  }
  if (isGitReference(versionSpec) !== (sourceKind === 'git')) return false;
  if (isPathReference(versionSpec) !== (sourceKind === 'path')) return false;
  if (sourceKind === 'registry') {
    if (versionSpec !== '*' && !startsWithComparisonOperator(versionSpec)) return false;
    return !versionSpec.includes(';') && !hasWhitespaceThen(versionSpec, '#');
  }
  return !hasWhitespaceThen(versionSpec, ';#');
}
