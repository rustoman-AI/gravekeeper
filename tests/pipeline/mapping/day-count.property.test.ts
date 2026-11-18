import * as fc from 'fast-check';
import { describe, it } from 'vitest';
import { DAY_MS } from '../../../pipeline/constants';
import { dayCount } from '../../../pipeline/mapping/day-count';
import { arbJson } from '../../support/arbitraries/json';
import { cfg } from '../../support/fc-config';

// Year 0001-01-01T00:00:00Z to 9999-12-31T23:59:59.999Z, the range a 4-digit year can express.
const MIN_MS = -62135596800000;
const MAX_MS = 253402300799999;
const MAX_K = 100000;

const arbInstantMs = fc.integer({ min: MIN_MS, max: MAX_MS });
const iso = (ms: number): string => new Date(ms).toISOString();

const STRICT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;

// Valid timestamps, strings near the valid form, and arbitrary strings.
const arbAsOf: fc.Arbitrary<string> = fc.oneof(
  arbInstantMs.map(iso),
  arbInstantMs.map((ms) => iso(ms).replace('Z', '')),
  arbInstantMs.map((ms) => iso(ms).replace(/^(\d{4})-(\d{2})/, '$1-13')),
  arbInstantMs.map((ms) => iso(ms).replace(/-(\d{2})T/, '-32T')),
  arbInstantMs.map((ms) => iso(ms).replace('T', ' ')),
  fc.string(),
  fc.string({ unit: 'binary' }),
);

describe('dayCount properties', () => {
  // Feature: scan-pipeline, Property 11: Day_Count is total, non-negative and deterministic
  // Validates: Requirements 6.6, 6.9
  it('P11 is null or an integer at least 0, null for an invalid asOf, deterministic, and never throws', () => {
    fc.assert(
      fc.property(fc.oneof(arbJson, arbAsOf), arbAsOf, (date, asOf) => {
        const first = dayCount(date, asOf);
        const second = dayCount(date, asOf);
        if (!Object.is(first, second)) return false;
        if (!STRICT.test(asOf) && first !== null) return false;
        return first === null || (Number.isInteger(first) && first >= 0);
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 12: Day_Count is monotonic
  // Validates: Requirements 6.7
  it('P12 gives the earlier date a Day_Count at least as large as the later date', () => {
    fc.assert(
      fc.property(arbInstantMs, arbInstantMs, arbInstantMs, (a, b, c) => {
        const [x, y, z] = [a, b, c].sort((p, q) => p - q) as [number, number, number];
        // x <= y <= z, with asOf = z, so both dates are at most asOf.
        const asOf = iso(z);
        const earlier = dayCount(iso(x), asOf);
        const later = dayCount(iso(y), asOf);
        return earlier !== null && later !== null && earlier >= later;
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 13: Day_Count is the exact floor
  // Validates: Requirements 6.10
  it('P13 returns k for a date k * DAY_MS + r milliseconds before asOf', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MIN_MS + (MAX_K + 1) * DAY_MS, max: MAX_MS }),
        fc.integer({ min: 0, max: MAX_K }),
        fc.integer({ min: 0, max: DAY_MS - 1 }),
        (asOfMs, k, r) => dayCount(iso(asOfMs - (k * DAY_MS + r)), iso(asOfMs)) === k,
      ),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 11: Day_Count is total, non-negative and deterministic
  // Validates: Requirements 6.4, 6.6
  it('P11 gives 0 for a date after asOf', () => {
    fc.assert(
      fc.property(arbInstantMs, arbInstantMs, (a, b) => {
        const [asOfMs, dateMs] = a <= b ? [a, b] : [b, a];
        return dayCount(iso(dateMs), iso(asOfMs)) === 0;
      }),
      cfg(),
    );
  });
});
