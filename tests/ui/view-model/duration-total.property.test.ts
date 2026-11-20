// Feature: graveyard-art, Property GA-P5: Duration formatting is total
// Validates: Requirements 6.1, 6.2, 6.6
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DURATION_DAYS_MAX_EXCLUSIVE,
  DURATION_MONTHS_MAX_EXCLUSIVE,
} from '../../../view-model/constants';
import { durationParts, humanizeDays } from '../../../view-model/duration';
import { cfg } from '../../support/fc-config';

const GRAMMAR = /^(less than a day|1 day|([2-9]|[1-5]\d) days|([2-9]|[1-9]\d+) months|([2-9]|[1-9]\d+) years)$/;

const arbAnyNumber = fc.oneof(
  fc.double({ noNaN: false }),
  fc.constantFrom(
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    -0,
    0,
    Number.MAX_VALUE,
    -Number.MAX_VALUE,
    Number.MIN_VALUE,
  ),
  fc.double({ min: -1e15, max: 1e15, noNaN: true }),
  fc.integer({ min: -5, max: 1e6 }),
);

const arbFiniteNonNegative = fc.oneof(
  fc.double({ min: 0, max: 1e15, noNaN: true }),
  fc.integer({ min: 0, max: 2000 }),
  fc.constantFrom(
    0,
    0.5,
    1,
    DURATION_DAYS_MAX_EXCLUSIVE - 0.1,
    DURATION_DAYS_MAX_EXCLUSIVE,
    DURATION_MONTHS_MAX_EXCLUSIVE - 1,
    DURATION_MONTHS_MAX_EXCLUSIVE,
    DURATION_MONTHS_MAX_EXCLUSIVE + 1,
    1e15,
  ),
  fc.integer({ min: -3, max: 3 }).chain((delta) =>
    fc
      .constantFrom(1, DURATION_DAYS_MAX_EXCLUSIVE, DURATION_MONTHS_MAX_EXCLUSIVE)
      .map((b) => Math.max(0, b + delta)),
  ),
);

describe('GA-P5 Duration formatting is total', () => {
  it('GA-P5 returns a non-empty string for any number and never throws', () => {
    fc.assert(
      fc.property(arbAnyNumber, (days) => {
        const text = humanizeDays(days);
        expect(typeof text).toBe('string');
        expect(text.length).toBeGreaterThan(0);
        expect(humanizeDays(days)).toBe(text);
        expect(() => durationParts(days)).not.toThrow();
      }),
      cfg(),
    );
  });

  it('GA-P5 finite days of at least 0 match the unit grammar', () => {
    fc.assert(
      fc.property(arbFiniteNonNegative, (days) => {
        expect(humanizeDays(days)).toMatch(GRAMMAR);
      }),
      cfg(),
    );
  });
});
