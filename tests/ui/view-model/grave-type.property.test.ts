// Feature: graveyard-ui, Property 12: Grave type and plot kind are functions of status and rule ids
// Validates: Requirements 7.15, 7.16, 7.17, 7.20
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Classification, RuleId, Status } from '../../../core';
import { graveTypeOf, plotKindOf, statusWordOf } from '../../../view-model/grave-type';
import type { PlotKind } from '../../../view-model/types';
import { cfg } from '../../support/fc-config';

const STATUSES: readonly Status[] = ['DEAD', 'HAUNTED', 'ALIVE'];
const RULE_IDS: readonly RuleId[] = ['7.1', '7.2', '7.3', '7.4', '8.1', '8.2', '8.3', '9.1', '9.2'] as unknown as readonly RuleId[];
const KINDS: readonly PlotKind[] = ['tombstone', 'overgrown', 'ghost', 'restless', 'lantern', 'unmarked'];

function make(status: Status, ids: readonly string[]): Classification {
  return {
    status,
    score: 50,
    reasons: ids.map((id) => ({ ruleId: id as RuleId, message: 'm', facts: [] })),
    vulnerable: false,
    abandoned: false,
    dormant: false,
  };
}

// Any order, duplicates allowed, possibly empty.
const ruleIdList = fc.array(fc.constantFrom(...RULE_IDS), { maxLength: 12 });
const classification = fc.option(fc.tuple(fc.constantFrom(...STATUSES), ruleIdList), { nil: null });

function setKey(ids: readonly string[]): string {
  return [...new Set(ids)].sort().join(',');
}

describe('P12: Grave type and plot kind are functions of status and rule ids', () => {
  it('equals for equal status and equal rule id set, whatever the order and duplicates', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STATUSES),
        ruleIdList,
        fc.context(),
        (status, ids, ctx) => {
          const shuffled = [...ids].reverse();
          const deduped = [...new Set(ids)];
          ctx.log(setKey(ids));
          for (const other of [shuffled, deduped]) {
            const a = make(status, ids);
            const b = make(status, other);
            expect(graveTypeOf(b)).toBe(graveTypeOf(a));
            expect(plotKindOf(b)).toBe(plotKindOf(a));
          }
        },
      ),
      cfg(),
    );
  });

  it('derives grave type and plot kind exactly as specified', () => {
    fc.assert(
      fc.property(classification, (input) => {
        const c = input === null ? null : make(input[0], input[1]);
        const burial = input !== null && (input[1].includes('8.1') || input[1].includes('8.2'));
        const grave = graveTypeOf(c);
        const kind = plotKindOf(c);
        if (input === null) {
          expect(grave).toBeNull();
          expect(kind).toBe('unmarked');
          return;
        }
        const status = input[0];
        expect(grave === null).toBe(status !== 'DEAD');
        if (status === 'DEAD') expect(grave).toBe(burial ? 'buried' : 'forgotten');
        if (status === 'HAUNTED') expect(kind).toBe(burial ? 'restless' : 'ghost');
        if (status === 'ALIVE') expect(kind).toBe('lantern');
        if (status === 'DEAD') expect(kind).toBe(grave === 'buried' ? 'tombstone' : 'overgrown');
      }),
      cfg(),
    );
  });

  it('maps the six kinds to six distinct words', () => {
    expect(new Set(KINDS.map(statusWordOf)).size).toBe(6);
  });
});
