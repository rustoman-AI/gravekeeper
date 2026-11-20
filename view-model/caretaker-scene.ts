import { SCAN_STONE_COUNT, SCAN_STONE_X } from './constants';
import type { StageState } from './types';

export interface CaretakerSceneStone {
  readonly index: number;
  readonly x: number;
  readonly lit: boolean;
}

export interface CaretakerSceneModel {
  readonly stones: readonly CaretakerSceneStone[];
  /** x of the last lit stone (the first stone when none is lit). */
  readonly lanternX: number;
  readonly lanternIndex: number;
}

/**
 * Pure model of the scanning scene. A stone is lit when its stage is "in progress" or "done"
 * (a missing state counts as not lit). With `still` all stones are lit and the lantern is at the last one.
 */
export function caretakerScene(states: readonly StageState[], still: boolean): CaretakerSceneModel {
  const stones: CaretakerSceneStone[] = [];
  let lanternIndex = 0;
  for (let i = 0; i < SCAN_STONE_COUNT; i++) {
    const state = states[i]?.state;
    const lit = still || state === 'in progress' || state === 'done';
    stones.push({ index: i, x: SCAN_STONE_X[i]!, lit });
    if (lit && !still) lanternIndex = i;
  }
  if (still) lanternIndex = SCAN_STONE_COUNT - 1;
  return { stones, lanternX: SCAN_STONE_X[lanternIndex]!, lanternIndex };
}
