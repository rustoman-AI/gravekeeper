// Property 1 of scan-accuracy: abandoned and dormant follow the commit threshold.
import * as fc from 'fast-check';
import { describe, it } from 'vitest';
import { classify } from '../../../core';
import { ABANDONMENT_DAYS, COMMIT_ABANDONMENT_DAYS } from '../../../core/model';
import { arbRawFacts } from '../../support/arbitraries/facts';
import { cfg } from '../../support/fc-config';
import { oracleFactValue, oracleAbandoned, oracleDormant } from '../../support/oracles/facts-oracle';

const BOUNDARY_DAYS: readonly unknown[] = [364, 365, 366, 729, 730, 731, null];
const arbBoundaryDay: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom(...BOUNDARY_DAYS) },
  { weight: 1, arbitrary: fc.integer({ min: 0, max: 1500 }) },
);
const arbBoundaryFacts: fc.Arbitrary<Record<string, unknown>> = fc.record(
  {
    daysSinceLastRelease: arbBoundaryDay,
    daysSinceLastCommit: arbBoundaryDay,
    archived: fc.constantFrom(true, false, null),
    deprecated: fc.constantFrom(true, false, null),
    openVulnerabilityCount: fc.constantFrom(0, 1, null),
    maxSeverity: fc.constantFrom('low', 'high', null),
    maintainerCount: fc.constantFrom(0, 1, 2, null),
  },
  { requiredKeys: ['daysSinceLastRelease', 'daysSinceLastCommit'] },
);

const isValidDay = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

// Independent restatement of the property, written from the design text.
const expectedAbandoned = (facts: unknown): boolean => {
  const release = oracleFactValue(facts, 'daysSinceLastRelease');
  const commit = oracleFactValue(facts, 'daysSinceLastCommit');
  const releaseOld = isValidDay(release) && release >= ABANDONMENT_DAYS;
  const commitOld = commit === null || commit === undefined || (isValidDay(commit) && commit >= COMMIT_ABANDONMENT_DAYS);
  return oracleFactValue(facts, 'archived') === true || oracleFactValue(facts, 'deprecated') === true || (releaseOld && commitOld);
};

const check = (facts: unknown): void => {
  const c = classify(facts as never);
  const ids = c.reasons.map((r) => r.ruleId);
  if (c.abandoned !== oracleAbandoned(facts)) throw new Error(`abandoned ${String(c.abandoned)} != oracle`);
  if (c.dormant !== oracleDormant(facts)) throw new Error(`dormant ${String(c.dormant)} != oracle`);
  if (c.abandoned !== expectedAbandoned(facts)) throw new Error(`abandoned ${String(c.abandoned)} != design formula`);
  if (ids.includes('8.3') && ids.includes('8.4')) throw new Error('Reasons contain 8.3 and 8.4 together');
};

describe('commit threshold properties', () => {
  // Feature: scan-accuracy, Property 1: Abandoned and dormant follow the commit threshold
  it('P1: abandoned and dormant follow the commit threshold for raw facts', () => {
    // **Validates: Requirements 1.2, 1.3, 1.5, 1.8**
    fc.assert(fc.property(arbRawFacts, (facts) => check(facts)), cfg());
  });

  // Feature: scan-accuracy, Property 1: Abandoned and dormant follow the commit threshold
  it('P1: abandoned and dormant follow the commit threshold at the boundary day counts', () => {
    // **Validates: Requirements 1.2, 1.3, 1.5, 1.8**
    fc.assert(fc.property(arbBoundaryFacts, (facts) => check(facts)), cfg());
  });
});
