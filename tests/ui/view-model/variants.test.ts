import { describe, expect, it } from 'vitest';
import { OVERGROWN_VARIANTS, TILT_MAX_DEG, TOMBSTONE_VARIANTS } from '../../../view-model/constants';
import { SPRITE_VARIANTS, symbolIdOf, tiltOf, variantOf } from '../../../view-model/variants';

// graveyard-art Requirements 3.5, 3.8
describe('variants', () => {
  it('is deterministic and stays inside the kind table', () => {
    const key = 'npm:left-pad:registry';
    expect(variantOf('tombstone', key)).toBe(variantOf('tombstone', key));
    expect(TOMBSTONE_VARIANTS).toContain(variantOf('tombstone', key));
    expect(OVERGROWN_VARIANTS).toContain(variantOf('overgrown', key));
    expect(variantOf('ghost', key)).toBe('wisp');
    expect(variantOf('lantern', key)).toBe('iron');
    expect(variantOf('unmarked', key)).toBe('mound');
  });

  it('gives a restless plot the variant of a tombstone with the same key', () => {
    for (let i = 0; i < 50; i += 1) {
      const key = `npm:name-${i}:registry`;
      expect(variantOf('restless', key)).toBe(variantOf('tombstone', key));
      expect(tiltOf('restless', key)).toBe(tiltOf('tombstone', key));
    }
  });

  it('tilts only stones, within the range', () => {
    for (let i = 0; i < 200; i += 1) {
      const key = `npm:name-${i}:registry`;
      expect(tiltOf('ghost', key)).toBe(0);
      expect(tiltOf('lantern', key)).toBe(0);
      expect(tiltOf('unmarked', key)).toBe(0);
      const t = tiltOf('tombstone', key);
      expect(Number.isInteger(t)).toBe(true);
      expect(Math.abs(t)).toBeLessThanOrEqual(TILT_MAX_DEG);
    }
  });

  it('builds symbol ids from kind and variant', () => {
    expect(symbolIdOf('tombstone', 'cross', false)).toBe('plot-tombstone-cross');
    expect(symbolIdOf('overgrown', 'ivy-heavy', true)).toBe('plot-overgrown-ivy-heavy-flat');
    expect(SPRITE_VARIANTS.restless).toEqual(SPRITE_VARIANTS.tombstone);
  });

  it('reaches every variant of both lists for at least 5 percent of 1000 keys', () => {
    const keys = Array.from({ length: 1000 }, (_, i) => `npm:name-${i}:registry`);
    for (const [kind, list] of [
      ['tombstone', TOMBSTONE_VARIANTS],
      ['overgrown', OVERGROWN_VARIANTS],
    ] as const) {
      const counts = new Map<string, number>();
      for (const key of keys) {
        const v = variantOf(kind, key);
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      for (const v of list) expect(counts.get(v) ?? 0).toBeGreaterThanOrEqual(50);
    }
  });
});
