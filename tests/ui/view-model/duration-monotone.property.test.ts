// Feature: graveyard-art, Property GA-P6: Duration formatting is monotone with exact unit boundaries
// Validates: Requirements 6.3, 6.4
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DURATION_DAYS_MAX_EXCLUSIVE,
  DURATION_MONTHS_MAX_EXCLUSIVE,
} from '../../../view-model/constants';
import { durationParts, type DurationUnit } from '../../../view-model/duration';
import { cfg } from '../../support/fc-config';

const RANK: Record<DurationUnit, number> = {
  none: -1,
  lessThanDay: 0,
  days: 1,
  months: 2,
  years: 3,
};

const arbDays = fc.oneof(
  fc.double({ min: 0, max: 1e6, noNaN: true }),
  fc.integer({ min: 0, max: 5000 }),
  fc.constantFrom(
    0,
    0.999,
    1,
    DURATION_DAYS_MAX_EXCLUSIVE - 1,
    DURATION_DAYS_MAX_EXCLUSIVE - 0.001,
    DURATION_DAYS_MAX_EXCLUSIVE,
    DURATION_MONTHS_MAX_EXCLUSIVE - 1,
    DURATION_MONTHS_MAX_EXCLUSIVE - 0.001,
    DURATION_MONTHS_MAX_EXCLUSIVE,
  ),
);

describe('GA-P6 Duration formatting is monotone with exact unit boundaries', () => {
  it('GA-P6 (rank, count) never decreases when the day count grows', () => {
    fc.assert(
      fc.property(arbDays, arbDays, (x, y) => {
        const a = Math.min(x, y);
        const b = Math.max(x, y);
        const pa = durationParts(a);
        const pb = durationParts(b);
        const ra = RANK[pa.unit];
        const rb = RANK[pb.unit];
        expect(ra <= rb).toBe(true);
        if (ra === rb) expect(pa.count <= pb.count).toBe(true);
      }),
      cfg(),
    );
  });

  it('GA-P6 the unit follows the exact boundaries', () => {
    fc.assert(
      fc.property(arbDays, (d) => {
        const expected: DurationUnit =
          d < 1
            ? 'lessThanDay'
            : d < DURATION_DAYS_MAX_EXCLUSIVE
              ? 'days'
              : d < DURATION_MONTHS_MAX_EXCLUSIVE
                ? 'months'
                : 'years';
        expect(durationParts(d).unit).toBe(expected);
      }),
      cfg(),
    );
  });
});
