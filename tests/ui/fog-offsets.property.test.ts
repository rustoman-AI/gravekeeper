import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { fogRowOffsetPct } from '@/view-model';
import { cfg } from '../support/fc-config';

// Feature: art-polish, Property AP-P2: Fog row offsets alternate deterministically
// Validates: Requirements 4.4, 4.9
describe('AP-P2: Fog row offsets alternate deterministically', () => {
  it('AP-P2 is repeatable, differs by at least 15 from the next row, and equals the row two below', () => {
    fc.assert(
      fc.property(fc.nat({ max: 100000 }), (row) => {
        const offset = fogRowOffsetPct(row);
        expect(fogRowOffsetPct(row)).toBe(offset);
        expect(Math.abs(offset - fogRowOffsetPct(row + 1))).toBeGreaterThanOrEqual(15);
        expect(fogRowOffsetPct(row + 2)).toBe(offset);
      }),
      cfg(),
    );
  });
});
