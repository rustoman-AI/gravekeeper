import { compareCodePoints } from '../internal/compare';
import { canonicalKey } from '../internal/deep-equal-key';
import type { Classification, MergedClassification, Status } from '../model/types';

// Requirement 12.22: Status precedence HAUNTED, DEAD, ALIVE.
const STATUS_RANK: Readonly<Record<Status, number>> = { HAUNTED: 0, DEAD: 1, ALIVE: 2 };

/**
 * Classification_Tie_Key: the flags vulnerable, abandoned, dormant (false before true),
 * then the Reason ruleIds joined by ','. Encoded as a string of three flag digits ('0' < '1'),
 * a '|' separator, and the joined ruleIds, so code point comparison orders the tuple correctly.
 */
export function classificationTieKey(c: Classification): string {
  // Requirement 12.22
  const flags = (c.vulnerable ? '1' : '0') + (c.abandoned ? '1' : '0') + (c.dormant ? '1' : '0');
  return flags + '|' + c.reasons.map((r) => r.ruleId).join(',');
}

/**
 * Total order of Requirement 12.22. Negative when `a` is higher risk (sorts first): score descending,
 * status HAUNTED, DEAD, ALIVE, Classification_Tie_Key ascending, Classification_Canonical_Key ascending.
 */
export function compareClassifications(a: Classification, b: Classification): number {
  // Requirement 12.22
  if (a.score !== b.score) return a.score > b.score ? -1 : 1;
  if (a.status !== b.status) return STATUS_RANK[a.status] - STATUS_RANK[b.status];
  const tie = compareCodePoints(classificationTieKey(a), classificationTieKey(b));
  if (tie !== 0) return tie;
  return compareCodePoints(canonicalKey(a), canonicalKey(b));
}

/** Merged_Classification: the highest-risk Classification of the list, or null when empty. Does not mutate the input. */
export function mergeClassifications(list: readonly Classification[]): MergedClassification {
  // Requirements 12.1, 12.2, 12.10, 12.22
  if (list.length === 0) return null;
  let best = list[0];
  for (let i = 1; i < list.length; i++) {
    if (compareClassifications(list[i], best) < 0) best = list[i];
  }
  return best;
}
