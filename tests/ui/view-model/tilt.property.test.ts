// Feature: graveyard-art, Property GA-P2: Tilt stays within the range and only stones lean
// Validates: Requirements 3.6, 3.8
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { TILT_MAX_DEG } from '../../../view-model/constants';
import type { PlotKind } from '../../../view-model/types';
import { STONE_KINDS, tiltOf, variantOf } from '../../../view-model/variants';
import { cfg } from '../../support/fc-config';

const ALL_KINDS: readonly PlotKind[] = [
  'tombstone',
  'overgrown',
  'restless',
  'ghost',
  'lantern',
  'unmarked',
];
const arbKind = fc.constantFrom(...ALL_KINDS);
const arbKey = fc.oneof(fc.string(), fc.string({ unit: 'binary' }), fc.constant(''));

describe('GA-P2 Tilt stays within the range and only stones lean', () => {
  it('GA-P2 the stone kinds are tombstone, overgrown and restless', () => {
    expect([...STONE_KINDS].sort()).toEqual(['overgrown', 'restless', 'tombstone']);
  });

  it('GA-P2 tilt is an integer in range for stones, 0 for the others, and stable', () => {
    fc.assert(
      fc.property(arbKind, arbKey, (kind, key) => {
        const t = tiltOf(kind, key);
        expect(Number.isInteger(t)).toBe(true);
        expect(Object.is(t, -0)).toBe(false);
        if (STONE_KINDS.has(kind)) {
          expect(t).toBeGreaterThanOrEqual(-TILT_MAX_DEG);
          expect(t).toBeLessThanOrEqual(TILT_MAX_DEG);
        } else {
          expect(t).toBe(0);
        }
        expect(tiltOf(kind, key)).toBe(t);
      }),
      cfg(),
    );
  });

  it('GA-P2 restless shares tilt and variant with tombstone for the same key', () => {
    fc.assert(
      fc.property(arbKey, (key) => {
        expect(tiltOf('restless', key)).toBe(tiltOf('tombstone', key));
        expect(variantOf('restless', key)).toBe(variantOf('tombstone', key));
      }),
      cfg(),
    );
  });
});
