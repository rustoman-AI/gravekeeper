import { compareDependencies } from '../formats/order';
import { dependencyKey } from '../formats/key';
import type { Dependency, ParseResult } from '../model';

/** A dependency found by a format parser, with its First_Occurrence rank and a location label for warnings. */
export interface Candidate {
  readonly dependency: Dependency;
  /** First_Occurrence order: `[]` (package.json), `[firstLine]` (requirements.txt), `[tableOrdinal, enumIndex]` (Cargo.toml). */
  readonly rank: readonly number[];
  /** Location text used in duplicate warnings, e.g. `requirements.txt line 7`. */
  readonly where: string;
}

/** Output of a format parser before deduplication and sorting. */
export interface RawParse {
  readonly candidates: readonly Candidate[];
  readonly warnings: readonly string[];
}

const MAX_WHERE_LENGTH = 80;

// Requirement 4.6
/** Truncates `where` to 80 characters (code points), ending in an ellipsis when it was cut. */
function boundWhere(where: string): string {
  const points = Array.from(where);
  if (points.length <= MAX_WHERE_LENGTH) return where;
  return `${points.slice(0, MAX_WHERE_LENGTH - 1).join('')}\u2026`;
}

// Requirement 4.6
/** Lexicographic comparison of rank arrays; a proper prefix sorts first. */
function compareRank(a: readonly number[], b: readonly number[]): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const x = a[i] as number;
    const y = b[i] as number;
    if (x !== y) return x < y ? -1 : 1;
  }
  return a.length - b.length;
}

// Requirement 4.6, 4.7, 4.8
/**
 * Ranks candidates, keeps the first occurrence per Dependency_Key (normalized name and scope),
 * adds one warning per discarded candidate, and sorts the result in Dependency_Order.
 * Warnings: the parser's own warnings first, then duplicate warnings in rank order.
 * Pure and deterministic. Does not mutate its input.
 */
export function finish(raw: RawParse): ParseResult {
  // Requirement 4.6 (Array.prototype.sort is stable)
  const ranked = [...raw.candidates].sort((a, b) => compareRank(a.rank, b.rank));

  const seen = new Set<string>();
  const kept: Dependency[] = [];
  const duplicateWarnings: string[] = [];
  for (const candidate of ranked) {
    const { dependency } = candidate;
    const key = dependencyKey(dependency.name, dependency.scope);
    if (seen.has(key)) {
      duplicateWarnings.push(
        `${boundWhere(candidate.where)}: duplicate dependency "${dependency.name}" in scope "${dependency.scope}"; the first occurrence was kept.`,
      );
    } else {
      seen.add(key);
      kept.push(dependency);
    }
  }

  // Requirement 4.8
  kept.sort(compareDependencies);

  // Requirement 4.7
  return { dependencies: kept, warnings: [...raw.warnings, ...duplicateWarnings] };
}
