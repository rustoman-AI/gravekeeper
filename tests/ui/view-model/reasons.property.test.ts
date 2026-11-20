// Feature: graveyard-ui, Property 9: Strongest reason selection
// Validates: Requirements 7.4, 7.12
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Classification, RuleId, Status } from '../../../core';
import { strongestReason } from '../../../view-model/reasons';
import { cfg } from '../../support/fc-config';

const ALL_IDS = ['7.2', '8.1', '8.2', '8.3', '8.4', '10.6', '10.7', '10.8', '6.3', '11.2'] as unknown as readonly RuleId[];
const DEAD_IDS = ['8.1', '8.2', '8.3'] as unknown as readonly RuleId[];
const WEAK: readonly string[] = ['6.3', '11.2'];

function make(status: Status, ids: readonly RuleId[]): Classification {
  return {
    status,
    score: 50,
    reasons: ids.map((ruleId, i) => ({ ruleId, message: `m${String(i)}`, facts: [] })),
    vulnerable: false,
    abandoned: false,
    dormant: false,
  };
}

const idList = fc.array(fc.constantFrom(...ALL_IDS), { minLength: 1, maxLength: 12 });

// Core status precedence (requirement 9): a vulnerable package is HAUNTED, so a DEAD
// classification never carries 7.2 and always carries at least one of 8.1, 8.2, 8.3.
const classification = fc
  .tuple(fc.constantFrom<Status>('DEAD', 'HAUNTED', 'ALIVE'), idList, fc.constantFrom(...DEAD_IDS), fc.nat(12))
  .map(([status, ids, dead, at]) => {
    if (status !== 'DEAD') return make(status, ids);
    const kept = ids.filter((id) => (id as string) !== '7.2');
    if (!kept.some((id) => DEAD_IDS.includes(id))) kept.splice(at % (kept.length + 1), 0, dead);
    return make(status, kept);
  });

describe('P9: Strongest reason selection', () => {
  it('P9 is an element of reasons, avoids 6.3/11.2 when another exists, and is 8.1-8.3 for DEAD', () => {
    fc.assert(
      fc.property(classification, (c) => {
        const strongest = strongestReason(c);
        expect(strongest).not.toBeNull();
        if (strongest === null) return;
        expect(c.reasons).toContain(strongest);
        if (c.reasons.some((r) => !WEAK.includes(r.ruleId))) {
          expect(WEAK).not.toContain(strongest.ruleId);
        }
        if (c.status === 'DEAD') {
          expect(DEAD_IDS).toContain(strongest.ruleId);
        }
      }),
      cfg(),
    );
  });

  it('P9 returns null for a null classification', () => {
    expect(strongestReason(null)).toBeNull();
  });
});
