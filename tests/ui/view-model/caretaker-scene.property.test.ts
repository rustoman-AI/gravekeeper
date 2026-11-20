// Feature: graveyard-art, Property GA-P11
// Validates: Requirements 10.2, 10.3, 10.5
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { caretakerScene } from '../../../view-model/caretaker-scene';
import { SCAN_STONE_COUNT } from '../../../view-model/constants';
import { stageAt, stageStates } from '../../../view-model/stages';
import { cfg } from '../../support/fc-config';

const arbElapsed = fc.integer({ min: 0, max: 1_000_000 });

const litIndexes = (elapsed: number): number[] =>
  caretakerScene(stageStates(elapsed), false)
    .stones.filter((s) => s.lit)
    .map((s) => s.index);

describe('GA-P11 Lit stones grow as a prefix and the lantern follows the last lit stone', () => {
  it('GA-P11 lit stones are a prefix of the four stones and of the lit stones at a later time', () => {
    fc.assert(
      fc.property(arbElapsed, arbElapsed, (x, y) => {
        const t1 = Math.min(x, y);
        const t2 = Math.max(x, y);
        const a = litIndexes(t1);
        const b = litIndexes(t2);
        expect(a).toEqual(Array.from({ length: a.length }, (_, i) => i));
        expect(a.length).toBeLessThanOrEqual(SCAN_STONE_COUNT);
        expect(b.slice(0, a.length)).toEqual(a);
      }),
      cfg(),
    );
  });

  it('GA-P11 the lit count equals stageAt + 1 and the lantern is at the last lit stone', () => {
    fc.assert(
      fc.property(arbElapsed, (t) => {
        const scene = caretakerScene(stageStates(t), false);
        const count = scene.stones.filter((s) => s.lit).length;
        expect(count).toBe(stageAt(t) + 1);
        expect(scene.lanternIndex).toBe(count - 1);
        expect(scene.lanternX).toBe(scene.stones[count - 1]!.x);
      }),
      cfg(),
    );
  });

  it('GA-P11 still lights every stone and puts the lantern at the last one', () => {
    fc.assert(
      fc.property(arbElapsed, (t) => {
        for (const states of [stageStates(t), []]) {
          const scene = caretakerScene(states, true);
          expect(scene.stones).toHaveLength(SCAN_STONE_COUNT);
          expect(scene.stones.every((s) => s.lit)).toBe(true);
          expect(scene.lanternIndex).toBe(SCAN_STONE_COUNT - 1);
          expect(scene.lanternX).toBe(scene.stones[SCAN_STONE_COUNT - 1]!.x);
        }
      }),
      cfg(),
    );
  });
});
