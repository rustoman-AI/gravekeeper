import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { backoffDelayMs } from '../../adapters/http/retry-policy';
import {
  RETRY_BASE_DELAY_MS,
  RETRY_JITTER_RATIO,
  RETRY_MAX_DELAY_MS,
} from '../../pipeline/constants';
import { cfg } from '../support/fc-config';

// Attempt numbers: small values cover the doubling range, large values cover
// the cap and 2 ** (n - 1) overflowing to Infinity.
const arbAttempt = fc.oneof(
  fc.integer({ min: 1, max: 12 }),
  fc.integer({ min: 1, max: 5000 }),
  fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
);

const arbRandom = fc.oneof(
  fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }),
  fc.constantFrom(0, Number.EPSILON, 0.5, 1 - Number.EPSILON / 2),
);

describe('backoffDelayMs properties', () => {
  // Feature: scan-pipeline, Property 44: Backoff delay is within bounds
  // Validates: Requirements 15.13
  it('P44 backoff delay is within bounds', () => {
    fc.assert(
      fc.property(arbAttempt, arbRandom, (n, r) => {
        const b = Math.min(RETRY_BASE_DELAY_MS * 2 ** (n - 1), RETRY_MAX_DELAY_MS);
        const d = backoffDelayMs(n, r);
        expect(Number.isInteger(d)).toBe(true);
        expect(d).toBeGreaterThanOrEqual(b);
        expect(d).toBeLessThanOrEqual(b * (1 + RETRY_JITTER_RATIO));
        expect(d).toBeLessThanOrEqual(RETRY_MAX_DELAY_MS * (1 + RETRY_JITTER_RATIO));
      }),
      cfg(),
    );
  });
});
