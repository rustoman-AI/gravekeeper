// Ordered rule pipeline: evaluates every rule, orders Reasons, adds the 11.2 fallback.
import type { NormalizedFacts } from '../facts/normalize';
import type { Reason } from '../model/types';
import { archivedRule } from './rules/archived';
import { deprecatedRule } from './rules/deprecated';
import { noMaintainersRule } from './rules/no-maintainers';
import { releaseAbandonedRule } from './rules/release-abandoned';
import { releaseDormantRule } from './rules/release-dormant';
import { releaseStaleRule } from './rules/release-stale';
import { singleMaintainerRule } from './rules/single-maintainer';
import { unknownFactsRule } from './rules/unknown-facts';
import { sentence, type Rule } from './rules/types';
import { vulnerabilityRule } from './rules/vulnerability';

// Declared once, in ascending ruleId order (Requirement 11.3).
const RULES: readonly Rule[] = [
  unknownFactsRule, // 6.3
  vulnerabilityRule, // 7.2
  archivedRule, // 8.1
  deprecatedRule, // 8.2
  releaseAbandonedRule, // 8.3
  releaseDormantRule, // 8.4
  releaseStaleRule, // 10.6
  noMaintainersRule, // 10.7
  singleMaintainerRule, // 10.8
];

/** Compares ruleIds "requirement.criterion" as integers. */
function compareRuleIds(a: string, b: string): number {
  const [ar = 0, ac = 0] = a.split('.').map(Number);
  const [br = 0, bc = 0] = b.split('.').map(Number);
  return ar - br || ac - bc;
}

// Requirement 11.2: used only when no other Reason exists
const noSignalsReason = (): Reason => ({
  ruleId: '11.2',
  message: sentence('No risk signals were found'),
  facts: [],
});

// Requirements 11.1, 11.3, 11.5
export function runRules(facts: NormalizedFacts): readonly Reason[] {
  const reasons: Reason[] = [];
  for (const rule of RULES) {
    const reason = rule.evaluate(facts);
    if (reason !== null) reasons.push(reason);
  }
  // Defensive stable sort; the declaration order is already ascending.
  reasons.sort((a, b) => compareRuleIds(a.ruleId, b.ruleId));
  if (reasons.length === 0) reasons.push(noSignalsReason());
  return reasons;
}
