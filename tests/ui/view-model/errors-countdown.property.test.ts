// Feature: graveyard-ui, Property 25: Retry countdown
// Validates: Requirements 13.4, 13.14
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { retryRemainingMs } from '../../../view-model/errors';
import { cfg } from '../../support/fc-config';

const seconds = fc.integer({ min: 0, max: 86400 });

// A cooldown and two elapsed times in [0, s * 1000 + 10000], ordered t1 <= t2.
const cooldownAndTimes = seconds.chain((s) =>
  fc
    .tuple(fc.integer({ min: 0, max: s * 1000 + 10000 }), fc.integer({ min: 0, max: s * 1000 + 10000 }))
    .map(([a, b]) => ({ s, t1: Math.min(a, b), t2: Math.max(a, b) })),
);

// Independent oracle: Retry is enabled once the cooldown has fully elapsed.
function retryEnabled(s: number, t: number): boolean {
  return t >= s * 1000;
}

describe('P25: Retry countdown', () => {
  it('is non-increasing in elapsed time and never negative', () => {
    fc.assert(
      fc.property(cooldownAndTimes, ({ s, t1, t2 }) => {
        const r1 = retryRemainingMs(s, t1);
        const r2 = retryRemainingMs(s, t2);
        expect(r1).toBeGreaterThanOrEqual(0);
        expect(r2).toBeGreaterThanOrEqual(0);
        expect(r2).toBeLessThanOrEqual(r1);
      }),
      cfg(),
    );
  });

  it('is s * 1000 - t before the cooldown ends and 0 from s * 1000 on', () => {
    fc.assert(
      fc.property(cooldownAndTimes, ({ s, t2: t }) => {
        const r = retryRemainingMs(s, t);
        if (t >= s * 1000) {
          expect(r).toBe(0);
        } else {
          expect(r).toBe(s * 1000 - t);
          expect(r).toBeGreaterThan(0);
        }
      }),
      cfg(),
    );
  });

  it('enables Retry exactly when the remaining time is 0', () => {
    fc.assert(
      fc.property(cooldownAndTimes, ({ s, t2: t }) => {
        expect(retryRemainingMs(s, t) === 0).toBe(retryEnabled(s, t));
      }),
      cfg(),
    );
  });

  it('starts at the full cooldown at elapsed 0', () => {
    fc.assert(
      fc.property(seconds, (s) => {
        expect(retryRemainingMs(s, 0)).toBe(s * 1000);
      }),
      cfg(),
    );
  });
});
