import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  ABANDONMENT_POINTS_CAP,
  MAINTAINER_POINTS_CAP,
  SEVERITIES,
  VULNERABILITY_POINTS_CAP,
} from '../../../core/model';
import { normalizeFacts } from '../../../core/facts/normalize';
import { computeScore, scoreComponents } from '../../../core/scoring';
import { arbAnyFactsInput } from '../../support/arbitraries/facts';
import {
  arbAbandonmentRaise,
  arbFlagRaise,
  arbReleasePair,
  arbSeverityRaise,
  arbVulnIncrement,
} from '../../support/arbitraries/facts-metamorphic';
import { cfg } from '../../support/fc-config';
import { oracleAbandoned, oracleVulnerable } from '../../support/oracles/facts-oracle';

const scoreOf = (raw: unknown): number => computeScore(normalizeFacts(raw));

describe('scoring properties', () => {
  // Feature: dependency-graveyard-core, Property 21: Score equals the sum of the components, clamp is a no-op
  // Validates: Requirements 10.22, 10.1, 10.17
  it('Property 21: score is the component sum, components within caps, 0 <= sum <= 100', () => {
    fc.assert(
      fc.property(arbAnyFactsInput, (raw) => {
        const facts = normalizeFacts(raw);
        const c = scoreComponents(facts);
        const sum = c.vulnerability + c.abandonment + c.maintainer;
        expect(Number.isInteger(sum)).toBe(true);
        expect(c.vulnerability).toBeGreaterThanOrEqual(0);
        expect(c.abandonment).toBeGreaterThanOrEqual(0);
        expect(c.maintainer).toBeGreaterThanOrEqual(0);
        expect(c.vulnerability).toBeLessThanOrEqual(VULNERABILITY_POINTS_CAP);
        expect(c.abandonment).toBeLessThanOrEqual(ABANDONMENT_POINTS_CAP);
        expect(c.maintainer).toBeLessThanOrEqual(MAINTAINER_POINTS_CAP);
        expect(sum).toBeGreaterThanOrEqual(0);
        expect(sum).toBeLessThanOrEqual(100);
        expect(computeScore(facts)).toBe(sum);
        // The vulnerability component is zero exactly when the oracle says the facts are not vulnerable.
        expect(c.vulnerability > 0).toBe(oracleVulnerable(raw));
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 22: Adding a vulnerability never lowers the score
  // Validates: Requirements 10.11
  it('Property 22: increasing a valid openVulnerabilityCount by 1 never lowers the score', () => {
    fc.assert(
      fc.property(arbVulnIncrement, ({ before, after }) => {
        expect(scoreOf(after)).toBeGreaterThanOrEqual(scoreOf(before));
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 23: Raising a known severity never lowers the score
  // Validates: Requirements 10.12
  it('Property 23: raising a known severity never lowers the score', () => {
    fc.assert(
      fc.property(arbSeverityRaise, ({ before, after, from, to }) => {
        expect(SEVERITIES.indexOf(to)).toBeGreaterThan(SEVERITIES.indexOf(from));
        expect(scoreOf(after)).toBeGreaterThanOrEqual(scoreOf(before));
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 25: Larger release age never lowers the score (changed by scan-accuracy: straddle pairs include COMMIT_ABANDONMENT_DAYS)
  // Validates: Requirements 10.13, 10.20
  it('Property 25: a larger daysSinceLastRelease never lowers the score', () => {
    fc.assert(
      fc.property(arbReleasePair, ({ before, after, d1, d2 }) => {
        expect(d1).toBeLessThanOrEqual(d2);
        expect(scoreOf(after)).toBeGreaterThanOrEqual(scoreOf(before));
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 26: Archived or deprecated never lowers the score
  // Validates: Requirements 10.14
  it('Property 26: setting archived or deprecated to true never lowers the score', () => {
    fc.assert(
      fc.property(arbFlagRaise, ({ before, after }) => {
        expect(scoreOf(after)).toBeGreaterThanOrEqual(scoreOf(before));
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 27: Becoming abandoned never lowers the score (changed by scan-accuracy: commit threshold)
  // Validates: Requirements 10.19
  it('Property 27: becoming abandoned never lowers the score', () => {
    fc.assert(
      fc.property(arbAbandonmentRaise, ({ before, after }) => {
        expect(oracleAbandoned(before)).toBe(false);
        expect(oracleAbandoned(after)).toBe(true);
        expect(scoreOf(after)).toBeGreaterThanOrEqual(scoreOf(before));
      }),
      cfg(),
    );
  });
});
