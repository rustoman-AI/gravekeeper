// Shared rule shape and message helpers for classifier rules.
import type { NormalizedFacts } from '../../facts/normalize';
import type { Reason, RuleId } from '../../model/types';

/** A classifier rule: returns one Reason when it fires, otherwise null. */
export interface Rule {
  readonly ruleId: RuleId;
  evaluate(facts: NormalizedFacts): Reason | null;
}

/** Maximum Reason message length (Requirement 11.4). */
export const MAX_MESSAGE_LENGTH = 200;

/**
 * Builds a one-sentence message: whitespace collapsed, no inner sentence breaks added,
 * ends with a single period, and at most MAX_MESSAGE_LENGTH characters.
 */
export function sentence(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim().replace(/[.]+$/, '');
  const body = flat.length === 0 ? 'No details' : flat;
  const max = MAX_MESSAGE_LENGTH - 1;
  const clipped = body.length > max ? `${body.slice(0, max - 3)}...` : body;
  return `${clipped}.`;
}

/** Joins items as "a, b and c" (single sentence friendly). */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
