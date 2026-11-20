// Feature: graveyard-ui, Property 3: Stage selection is monotone and follows the start times
// Validates: Requirements 4.13
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SCAN_STAGE_START_MS } from '../../../view-model/constants';
import { stageAt } from '../../../view-model/stages';
import { cfg } from '../../support/fc-config';

// Non-negative finite times, biased towards the start times and their neighbours.
const nearStart = fc
  .tuple(fc.constantFrom(...SCAN_STAGE_START_MS), fc.constantFrom(-1, 0, 1))
  .map(([start, d]) => Math.max(0, start + d));
const elapsed = fc.oneof(
  fc.double({ min: 0, max: 60_000, noNaN: true }),
  fc.nat({ max: 60_000 }),
  nearStart,
  fc.double({ min: 0, max: Number.MAX_VALUE, noNaN: true }),
);

function lastStartAtMost(t: number): number {
  let index = -1;
  SCAN_STAGE_START_MS.forEach((start, i) => {
    if (start <= t) index = i;
  });
  return index;
}

describe('P3: Stage selection is monotone and follows the start times', () => {
  it('is an integer in 0..3 equal to the index of the last start time at most t', () => {
    fc.assert(
      fc.property(elapsed, (t) => {
        const stage = stageAt(t);
        expect(Number.isInteger(stage)).toBe(true);
        expect(stage).toBeGreaterThanOrEqual(0);
        expect(stage).toBeLessThanOrEqual(3);
        expect(stage).toBe(lastStartAtMost(t));
      }),
      cfg(),
    );
  });

  it('never decreases as the elapsed time grows', () => {
    fc.assert(
      fc.property(elapsed, elapsed, (x, y) => {
        const a = Math.min(x, y);
        const b = Math.max(x, y);
        expect(stageAt(a)).toBeLessThanOrEqual(stageAt(b));
      }),
      cfg(),
    );
  });
});
