// Feature: graveyard-ui, Property 11: Glow level is monotone in severity
// Validates: Requirements 7.7, 7.14
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Severity } from '../../../core';
import { DEFAULT_SEVERITY, GLOW_LEVELS, glowOf } from '../../../view-model/glow';
import { cfg } from '../../support/fc-config';

const ORDER: readonly Severity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const severity = fc.constantFrom(...ORDER);
const severityList = fc.array(fc.option(severity, { nil: null }), { maxLength: 8 });

function highest(list: readonly (Severity | null)[]): Severity | null {
  let best: Severity | null = null;
  for (const s of list) {
    if (s !== null && (best === null || ORDER.indexOf(s) > ORDER.indexOf(best))) best = s;
  }
  return best;
}

describe('P11: Glow level is monotone in severity', () => {
  it('GLOW_LEVELS[a] <= GLOW_LEVELS[b] whenever a is not higher than b', () => {
    fc.assert(
      fc.property(severity, severity, (a, b) => {
        if (ORDER.indexOf(a) <= ORDER.indexOf(b)) expect(GLOW_LEVELS[a]).toBeLessThanOrEqual(GLOW_LEVELS[b]);
      }),
      cfg(),
    );
  });

  it('equals the level of the highest advisory severity, then fact severity, then MEDIUM', () => {
    fc.assert(
      fc.property(severityList, severityList, (advisories, facts) => {
        const expected = highest(advisories) ?? highest(facts) ?? 'MEDIUM';
        expect(glowOf(advisories, facts)).toBe(GLOW_LEVELS[expected]);
      }),
      cfg(),
    );
  });

  it('defaults to MEDIUM', () => {
    expect(DEFAULT_SEVERITY).toBe('MEDIUM');
    expect(glowOf([], [])).toBe(GLOW_LEVELS.MEDIUM);
    expect(glowOf([null], [null])).toBe(GLOW_LEVELS.MEDIUM);
  });
});
