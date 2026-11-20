import { describe, expect, it } from 'vitest';
import {
  DEPTH_BRIGHTNESS_BACK,
  DEPTH_SCALE_BACK,
  OVERGROWN_VARIANTS,
  SCAN_STAGES,
  SCAN_STONE_COUNT,
  SCAN_STONE_X,
  TOMBSTONE_VARIANTS,
} from '../../../view-model/constants';
import { hashKey } from '../../../view-model/hash';
import { hashKey as hashKeyFromScene } from '../../../view-model/scene';

describe('graveyard-art constants', () => {
  it('has four tombstone and three overgrown variants', () => {
    expect(TOMBSTONE_VARIANTS).toHaveLength(4);
    expect(OVERGROWN_VARIANTS).toHaveLength(3);
  });

  it('keeps the scanning stone count equal to the stages and the x table', () => {
    expect(SCAN_STONE_COUNT).toBe(SCAN_STAGES.length);
    expect(SCAN_STONE_COUNT).toBe(SCAN_STONE_X.length);
  });

  it('keeps the depth constants inside (0, 1)', () => {
    for (const v of [DEPTH_SCALE_BACK, DEPTH_BRIGHTNESS_BACK]) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('hashKey keeps its FNV-1a values after the move', () => {
    const key = 'request:1';
    let h = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    expect(hashKey(key)).toBe(h >>> 0);
    expect(hashKeyFromScene).toBe(hashKey);
  });
});
