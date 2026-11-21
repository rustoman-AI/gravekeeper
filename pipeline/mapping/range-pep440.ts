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

/** Number of release parts of the version at the start of a clause body (operator already removed), 0 when none. */
function releaseLength(body: string): number {
  let i = 0;
  if (body[i] === 'v' || body[i] === 'V') i++;
  const bang = body.indexOf('!');
  if (bang >= 0 && isDigits(body.slice(i, bang))) i = bang + 1;
  let count = 0;
  let inPart = false;
  for (; i < body.length; i++) {
    const c = body.charCodeAt(i);
    if (c >= 48 && c <= 57) {
      if (!inPart) count++;
      inPart = true;
    } else if (c === 46 && inPart) {
      inPart = false;
    } else break;
  }
  return count;
}

/** Longest release length among the clause versions, or -1 when the specifier contains `===`. */
function longestClauseRelease(range: string): number {
  let longest = 0;
  for (const clause of range.split(',')) {
    let body = clause.trim();
    if (body.startsWith('===')) return -1;
    let k = 0;
    while (k < body.length && '=!~<> '.includes(body[k] as string)) k++;
    body = body.slice(k);
    longest = Math.max(longest, releaseLength(body));
  }
  return longest;
}

/**
 * The candidate with its release segment zero-padded to `length` parts. The
 * epoch and the pre, post, dev and local parts stay as written. Returns the
 * input unchanged when it is already long enough or has no release segment.
 */
function padRelease(v: string, length: number): string {
  let i = 0;
  while (i < v.length && (v[i] === ' ' || v[i] === 'v' || v[i] === 'V')) i++;
  const bang = v.indexOf('!');
  if (bang >= 0 && isDigits(v.slice(i, bang))) i = bang + 1;
  const start = i;
  while (i < v.length && ((v.charCodeAt(i) >= 48 && v.charCodeAt(i) <= 57) || v[i] === '.')) i++;
  let end = i;
  while (end > start && v[end - 1] === '.') end--;
  const have = releaseLength(v.slice(start, end));
  if (have === 0 || have >= length) return v;
  return v.slice(0, end) + '.0'.repeat(length - have) + v.slice(end);
}

/**
 * True when the version satisfies the specifier. False on any error.
 *
 * Requirement 10.9: `@renovatebot/pep440` does not zero-pad the candidate for
 * prefix matches (`1` against `==1.0.*` is false). Prefix clauses are
 * evaluated here with PEP 440 zero padding, the other clauses by the library,
 * and the results are combined with AND.
 *
 * Requirement 10.10: the library also fails `2.0` against `~=2.0.0.0`. For the
 * clauses the library evaluates, the candidate's release is zero-padded to the
 * longest clause release, except when the specifier contains `===`. The padded
 * string is used only for the check.
 */
export function pepSatisfies(v: string, range: string): boolean {
  try {
    if (typeof range !== 'string' || typeof v !== 'string') return false;
    const longest = longestClauseRelease(range);
    const padded = longest > 0 ? padRelease(v, longest) : v;
    if (!range.includes('.*')) {
      return pep440.satisfies(padded, range) === true;
    }
    const clauses = range.split(',');
    const prefixes: PrefixClause[] = [];
    const others: string[] = [];
    for (const clause of clauses) {
      const trimmed = clause.trim();
      if (trimmed.endsWith('.*') && (trimmed.startsWith('==') || trimmed.startsWith('!='))) {
        const parsed = parsePrefixClause(trimmed);
        if (parsed === null) return pep440.satisfies(padded, range) === true;
        prefixes.push(parsed);
      } else {
        others.push(clause);
      }
    }
    if (prefixes.length === 0) return pep440.satisfies(padded, range) === true;
    const candidate = pep440.parse(v);
    if (candidate === null || candidate === undefined) return false;
    for (const prefix of prefixes) {
      if (matchesPrefix(candidate, prefix) === prefix.negate) return false;
    }
    if (others.length === 0) return true;
    return pep440.satisfies(padded, others.join(',')) === true;
  } catch {
    return false;
  }
}