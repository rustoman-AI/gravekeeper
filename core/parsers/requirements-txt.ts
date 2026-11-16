// requirements.txt parser (design: "requirements.txt parser").
//
// A hand-written line scanner. Every step is a linear scan or a prefix check; there is no regex with nested
// quantifiers, so a manifest of 1,000,000 characters cannot cause catastrophic backtracking.
import { directReferenceKind, isNameToken, isRegistryRest, normalizePypiName } from '../formats/requirements-lexical';
import type { Dependency, SourceKind } from '../model';
import type { Candidate, RawParse } from './finish';

const MAX_QUOTED_LENGTH = 60;
const EGG_MARKER = '#egg=';

interface Group {
  /** 1-based number of the first physical line of the group. */
  readonly line: number;
  readonly text: string;
}

function isWhitespace(ch: string): boolean {
  return /\s/.test(ch);
}

function isNameChar(c: number): boolean {
  return (
    (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c === 0x2e || c === 0x5f || c === 0x2d
  );
}

// Requirement 2.6, 2.9
/** Splits on CRLF, LF and CR, then joins backslash continuations. A final backslash without successor is dropped. */
function joinLines(text: string): Group[] {
  const physical = text.split(/\r\n|\n|\r/);
  const groups: Group[] = [];
  let i = 0;
  while (i < physical.length) {
    const first = i;
    let joined = physical[i] as string;
    while (joined.endsWith('\\')) {
      joined = joined.slice(0, -1);
      if (i + 1 >= physical.length) break;
      i += 1;
      joined += physical[i] as string;
    }
    groups.push({ line: first + 1, text: joined });
    i += 1;
  }
  return groups;
}

// Requirement 2.5
/** Removes the first `#` at index 0 or after whitespace, and everything after it. */
function stripComment(text: string): string {
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '#' && (i === 0 || isWhitespace(text[i - 1] as string))) return text.slice(0, i);
  }
  return text;
}

/** Cuts at the first whitespace character that is directly followed by `;` (an environment marker). */
function cutMarkerAfterWhitespace(text: string): string {
  for (let i = 1; i < text.length; i++) {
    if (text[i] === ';' && isWhitespace(text[i - 1] as string)) return text.slice(0, i);
  }
  return text;
}

function quoted(text: string): string {
  const points = Array.from(text);
  return points.length <= MAX_QUOTED_LENGTH ? text : `${points.slice(0, MAX_QUOTED_LENGTH - 1).join('')}\u2026`;
}

// Requirement 2.2, 2.14
function makeCandidate(line: number, rawName: string, versionSpec: string, sourceKind: SourceKind): Candidate {
  const dependency: Dependency = {
    name: normalizePypiName(rawName),
    rawName,
    ecosystem: 'pypi',
    versionSpec,
    scope: 'runtime',
    sourceKind,
  };
  // Requirement 2.1
  return { dependency, rank: [line], where: `requirements.txt line ${line}` };
}

/** Value of an `#egg=` fragment (up to the next `&`), or null when there is none. */
function eggName(text: string): string | null {
  const at = text.indexOf(EGG_MARKER);
  if (at < 0) return null;
  const start = at + EGG_MARKER.length;
  const amp = text.indexOf('&', start);
  return text.slice(start, amp < 0 ? text.length : amp);
}

/** Parses requirements.txt text into ranked candidates and warnings. Never throws. */
export function parseRequirementsTxt(text: string): RawParse {
  const candidates: Candidate[] = [];
  const warnings: string[] = [];

  for (const group of joinLines(text)) {
    const { line } = group;
    const trimmed = stripComment(group.text).trim();
    // Requirement 2.7
    if (trimmed === '' || trimmed.startsWith('-')) continue;

    // Requirement 2.8
    const cannotParse = (): void => {
      warnings.push(`requirements.txt line ${line}: cannot parse requirement "${quoted(trimmed)}".`);
    };
    // Requirement 2.13
    const backslashSkipped = (): void => {
      warnings.push(
        `requirements.txt line ${line}: requirement contains a backslash and was skipped: "${quoted(trimmed)}".`,
      );
    };

    // Requirement 2.10, 2.11: bare reference with an `#egg=<name>` fragment
    if (directReferenceKind(trimmed) !== null) {
      const kind = directReferenceKind(trimmed) as 'git' | 'path';
      const egg = eggName(trimmed);
      if (egg === null || !isNameToken(egg)) {
        cannotParse();
      } else if (trimmed.includes('\\')) {
        backslashSkipped();
      } else {
        candidates.push(makeCandidate(line, egg, trimmed, kind));
      }
      continue;
    }

    // Requirement 2.8: Name_Token
    let pos = 0;
    while (pos < trimmed.length && isNameChar(trimmed.charCodeAt(pos))) pos += 1;
    const written = trimmed.slice(0, pos);
    if (!isNameToken(written)) {
      cannotParse();
      continue;
    }

    // Requirement 2.4: extras are skipped up to the first `]`
    while (pos < trimmed.length && isWhitespace(trimmed[pos] as string)) pos += 1;
    if (trimmed[pos] === '[') {
      const close = trimmed.indexOf(']', pos);
      if (close < 0) {
        cannotParse();
        continue;
      }
      pos = close + 1;
    }
    while (pos < trimmed.length && isWhitespace(trimmed[pos] as string)) pos += 1;
    const rest = trimmed.slice(pos);

    // Requirement 2.10, 2.11: direct reference `<name> @ <target>`
    if (rest.startsWith('@')) {
      const target = cutMarkerAfterWhitespace(rest.slice(1).trim()).trim();
      const kind = directReferenceKind(target);
      if (kind === null) {
        cannotParse();
      } else if (target.includes('\\')) {
        backslashSkipped();
      } else {
        candidates.push(makeCandidate(line, written, target, kind));
      }
      continue;
    }

    // Requirement 2.3, 2.8, 2.12: registry line, environment marker cut at the first `;`
    const semicolon = rest.indexOf(';');
    const spec = (semicolon < 0 ? rest : rest.slice(0, semicolon)).trim();
    if (!isRegistryRest(spec)) {
      cannotParse();
    } else if (spec.includes('\\')) {
      backslashSkipped();
    } else {
      candidates.push(makeCandidate(line, written, spec === '' ? '*' : spec, 'registry'));
    }
  }

  return { candidates, warnings };
}
