// Poetry_Reference (pyproject spec, requirement 11.3). An independent evaluator of Poetry semantics. It reads a
// structured constraint (terms with a kind and numeric parts), not text, and imports nothing from /core and no range
// package. Caret, tilde, wildcard and `~=` terms are prefix equality plus a lower bound; comparisons use zero-padded
// tuple comparison. `evaluatePep440Text` is a separate evaluator for translated PEP 440 text.

/** Numeric release parts, most significant first. */
export type Parts = readonly number[];

export type ComparisonOperator = '>=' | '>' | '<=' | '<' | '==' | '!=';

export type PoetryTerm =
  | { readonly kind: 'caret'; readonly parts: Parts }
  | { readonly kind: 'tilde'; readonly parts: Parts }
  /** `X.*` (prefix match, `parts` are the parts before `.*`); `negated` is the `!=X.*` form. */
  | { readonly kind: 'wildcard'; readonly parts: Parts; readonly negated: boolean }
  | { readonly kind: 'bare'; readonly parts: Parts }
  | { readonly kind: 'comparison'; readonly op: ComparisonOperator; readonly parts: Parts }
  | { readonly kind: 'compatible'; readonly parts: Parts };

export type PoetryConstraint = readonly PoetryTerm[];

// ---------------------------------------------------------------------------
// Tuple helpers
// ---------------------------------------------------------------------------

function at(parts: Parts, index: number): number {
  return index < parts.length ? parts[index] : 0;
}

/** Zero-padded tuple comparison: negative, zero or positive. */
export function compareParts(a: Parts, b: Parts): number {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const diff = at(a, i) - at(b, i);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** True when the first `count` parts of `a` and `b` agree (zero padded). */
function samePrefix(a: Parts, b: Parts, count: number): boolean {
  for (let i = 0; i < count; i++) {
    if (at(a, i) !== at(b, i)) return false;
  }
  return true;
}

/** Reads a plain release text (digits separated by single dots). Anything else is null. */
export function parseReleaseParts(text: string): Parts | null {
  if (!/^[0-9]+(\.[0-9]+)*$/.test(text)) return null;
  return text.split('.').map((p) => Number(p));
}

// ---------------------------------------------------------------------------
// Poetry semantics
// ---------------------------------------------------------------------------

export function poetryTermAccepts(term: PoetryTerm, version: Parts): boolean {
  const x = term.parts;
  switch (term.kind) {
    case 'caret': {
      // The leftmost non-zero part is fixed; when every part is zero the last given part is fixed.
      let fixed = x.findIndex((p) => p !== 0);
      if (fixed < 0) fixed = x.length - 1;
      return compareParts(version, x) >= 0 && samePrefix(version, x, fixed + 1);
    }
    case 'tilde': {
      // One part fixes the major; two or three parts fix major.minor.
      const fixedCount = x.length === 1 ? 1 : 2;
      return compareParts(version, x) >= 0 && samePrefix(version, x, fixedCount);
    }
    case 'wildcard': {
      const match = samePrefix(version, x, x.length);
      return term.negated ? !match : match;
    }
    case 'bare':
      return compareParts(version, x) === 0;
    case 'comparison': {
      const c = compareParts(version, x);
      switch (term.op) {
        case '>=':
          return c >= 0;
        case '>':
          return c > 0;
        case '<=':
          return c <= 0;
        case '<':
          return c < 0;
        case '==':
          return c === 0;
        case '!=':
          return c !== 0;
      }
      return false;
    }
    case 'compatible':
      // `~=X` means `>=X` and the same release up to the last given part.
      return compareParts(version, x) >= 0 && samePrefix(version, x, x.length - 1);
  }
}

/** A constraint accepts a release version when every term does. */
export function poetryReferenceAccepts(constraint: PoetryConstraint, version: Parts): boolean {
  return constraint.every((term) => poetryTermAccepts(term, version));
}

/**
 * The highest listed stable release (plain digits and dots) that the constraint accepts, or undefined.
 * Prereleases and junk entries are ignored. Ties (`1.0` and `1.0.0`) keep the first listed one.
 */
export function poetryReferenceHighest(
  constraint: PoetryConstraint,
  versions: readonly string[],
): string | undefined {
  let best: { readonly text: string; readonly parts: Parts } | undefined;
  for (const text of versions) {
    const parts = parseReleaseParts(text);
    if (parts === null || !poetryReferenceAccepts(constraint, parts)) continue;
    if (best === undefined || compareParts(parts, best.parts) > 0) best = { text, parts };
  }
  return best?.text;
}

// ---------------------------------------------------------------------------
// Independent PEP 440 term evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluates PEP 440 text (terms joined by `,`, no spaces) against a release version. Supports `>=`, `>`, `<=`, `<`,
 * `==`, `==V.*`, `!=`, `!=V.*` and `~=`. An empty text accepts everything. Text it cannot read throws.
 */
export function evaluatePep440Text(text: string, version: Parts): boolean {
  if (text.trim() === '') return true;
  return text.split(',').every((raw) => evaluatePep440Term(raw.trim(), version));
}

function evaluatePep440Term(term: string, version: Parts): boolean {
  const match = /^(~=|>=|<=|==|!=|>|<)(.+)$/.exec(term);
  if (match === null) throw new Error(`Unreadable PEP 440 term: "${term}"`);
  const [, op, rest] = match;
  const isPrefix = rest.endsWith('.*');
  const parts = parseReleaseParts(isPrefix ? rest.slice(0, -2) : rest);
  if (parts === null) throw new Error(`Unreadable PEP 440 version: "${rest}"`);
  if (isPrefix) {
    if (op !== '==' && op !== '!=') throw new Error(`Prefix match needs == or !=: "${term}"`);
    const same = samePrefix(version, parts, parts.length);
    return op === '==' ? same : !same;
  }
  const c = compareParts(version, parts);
  switch (op) {
    case '>=':
      return c >= 0;
    case '>':
      return c > 0;
    case '<=':
      return c <= 0;
    case '<':
      return c < 0;
    case '==':
      return c === 0;
    case '!=':
      return c !== 0;
    default:
      // `~=`: at least the given version and the same release without its last part.
      return c >= 0 && samePrefix(version, parts, parts.length - 1);
  }
}
