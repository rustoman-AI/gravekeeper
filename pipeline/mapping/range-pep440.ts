/*
 * The only file that imports `@renovatebot/pep440`. Every function catches
 * every library exception and returns null, false or 0, so the Mappers stay
 * total.
 */
import * as pep440 from '@renovatebot/pep440';

/** The input itself when it is a valid PEP 440 specifier, otherwise null. */
export function pepRange(range: string): string | null {
  try {
    if (typeof range !== 'string') return null;
    return pep440.validRange(range) === true ? range : null;
  } catch {
    return null;
  }
}

/** `{ isPrerelease }` for a valid PEP 440 version, otherwise null. A pre-release or dev-release segment makes it a prerelease. */
export function pepVersion(v: string): { isPrerelease: boolean } | null {
  try {
    if (typeof v !== 'string') return null;
    const parsed = pep440.parse(v);
    if (parsed === null || parsed === undefined) return null;
    return { isPrerelease: parsed.pre != null || parsed.dev != null };
  } catch {
    return null;
  }
}

/** PEP 440 ordering: negative, zero or positive. 0 on any error. */
export function pepCompare(a: string, b: string): number {
  try {
    const result = pep440.compare(a, b);
    return Number.isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}

interface PrefixClause {
  negate: boolean;
  epoch: number;
  release: number[];
}

function isDigits(s: string): boolean {
  if (s.length === 0) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

/** Parses `==V.*` or `!=V.*` (whitespace allowed) by linear scans. Null when the clause is not a well-formed prefix match. */
function parsePrefixClause(clause: string): PrefixClause | null {
  const text = clause.trim();
  let negate: boolean;
  if (text.startsWith('==')) negate = false;
  else if (text.startsWith('!=')) negate = true;
  else return null;
  let body = text.slice(2).trim();
  if (!body.endsWith('.*')) return null;
  body = body.slice(0, -2);
  let epoch = 0;
  const bang = body.indexOf('!');
  if (bang >= 0) {
    const e = body.slice(0, bang);
    if (!isDigits(e)) return null;
    epoch = Number(e);
    body = body.slice(bang + 1);
  }
  const parts = body.split('.');
  const release: number[] = [];
  for (const part of parts) {
    if (!isDigits(part)) return null;
    release.push(Number(part));
  }
  return { negate, epoch, release };
}

function matchesPrefix(candidate: { epoch: number; release: number[] }, clause: PrefixClause): boolean {
  if (candidate.epoch !== clause.epoch) return false;
  // Zero-padded to the prefix length; suffix segments (pre, post, dev) are ignored by a prefix match.
  for (let i = 0; i < clause.release.length; i++) {
    if ((candidate.release[i] ?? 0) !== clause.release[i]) return false;
  }
  return true;
}

/**
 * True when the version satisfies the specifier. False on any error.
 *
 * Requirement 10.9: `@renovatebot/pep440` does not zero-pad the candidate for
 * prefix matches (`1` against `==1.0.*` is false). Prefix clauses are
 * evaluated here with PEP 440 zero padding, the other clauses by the library,
 * and the results are combined with AND.
 */
export function pepSatisfies(v: string, range: string): boolean {
  try {
    if (typeof range !== 'string' || !range.includes('.*')) {
      return pep440.satisfies(v, range) === true;
    }
    const clauses = range.split(',');
    const prefixes: PrefixClause[] = [];
    const others: string[] = [];
    for (const clause of clauses) {
      const trimmed = clause.trim();
      if (trimmed.endsWith('.*') && (trimmed.startsWith('==') || trimmed.startsWith('!='))) {
        const parsed = parsePrefixClause(trimmed);
        if (parsed === null) return pep440.satisfies(v, range) === true;
        prefixes.push(parsed);
      } else {
        others.push(clause);
      }
    }
    if (prefixes.length === 0) return pep440.satisfies(v, range) === true;
    const candidate = pep440.parse(v);
    if (candidate === null || candidate === undefined) return false;
    for (const prefix of prefixes) {
      if (matchesPrefix(candidate, prefix) === prefix.negate) return false;
    }
    if (others.length === 0) return true;
    return pep440.satisfies(v, others.join(',')) === true;
  } catch {
    return false;
  }
}
