import { compareCodePoints } from '../internal/compare';
import type { RankedPackage, UnassessedItem } from '../model/types';
import { classificationTieKey, compareClassifications } from './merge';

type RankedKey = Pick<RankedPackage, 'name' | 'ecosystem' | 'sourceKind' | 'classification'>;

/**
 * Criterion 12.6 comparator. Negative when `a` ranks first: score descending, status HAUNTED, DEAD, ALIVE,
 * then name, ecosystem, sourceKind, Classification_Tie_Key ascending, all strings by code point.
 */
export function compareRanked(a: RankedKey, b: RankedKey): number {
  // Requirement 12.6
  const ca = a.classification;
  const cb = b.classification;
  if (ca.score !== cb.score) return ca.score > cb.score ? -1 : 1;
  // Status precedence is the second key of compareClassifications; its tie-key stage must come after name/ecosystem/sourceKind.
  if (ca.status !== cb.status) return compareClassifications(ca, cb);
  const byName = compareCodePoints(a.name, b.name);
  if (byName !== 0) return byName;
  const byEcosystem = compareCodePoints(a.ecosystem, b.ecosystem);
  if (byEcosystem !== 0) return byEcosystem;
  const bySource = compareCodePoints(a.sourceKind, b.sourceKind);
  if (bySource !== 0) return bySource;
  return compareCodePoints(classificationTieKey(ca), classificationTieKey(cb));
}

/** Criterion 12.14 comparator: ecosystem, name, sourceKind ascending by code point. */
export function compareUnassessed(a: UnassessedItem, b: UnassessedItem): number {
  // Requirement 12.14
  const byEcosystem = compareCodePoints(a.ecosystem, b.ecosystem);
  if (byEcosystem !== 0) return byEcosystem;
  const byName = compareCodePoints(a.name, b.name);
  if (byName !== 0) return byName;
  return compareCodePoints(a.sourceKind, b.sourceKind);
}

/** Returns a new array in criterion 12.6 order. Does not mutate the input. */
export function sortRanked<T extends RankedKey>(items: readonly T[]): T[] {
  // Requirements 12.6, 12.13
  return [...items].sort(compareRanked);
}

/** Returns a new array in criterion 12.14 order. Does not mutate the input. */
export function sortUnassessed(items: readonly UnassessedItem[]): UnassessedItem[] {
  // Requirement 12.14
  return [...items].sort(compareUnassessed);
}
