import { SCAN_STAGES, SCAN_STAGE_START_MS } from './constants';
import type { StageState } from './types';

/**
 * Index (0..3) of the current stage: the last stage whose start time is at most `elapsedMs`.
 * The elapsed time is passed in; no clock is read (Requirement 4.12).
 * Invalid input (NaN, negative) selects stage 0; Infinity selects the last stage.
 */
export function stageAt(elapsedMs: number): number {
  if (Number.isNaN(elapsedMs)) return 0;
  let index = 0;
  for (let i = 0; i < SCAN_STAGE_START_MS.length; i++) {
    if (SCAN_STAGE_START_MS[i]! <= elapsedMs) index = i;
  }
  return index;
}

/** Text state of every stage at `elapsedMs`: earlier "done", current "in progress", later "waiting". */
export function stageStates(elapsedMs: number): readonly StageState[] {
  const current = stageAt(elapsedMs);
  return SCAN_STAGES.map((stage, i) => ({
    id: stage.id,
    label: stage.label,
    state: i < current ? 'done' : i === current ? 'in progress' : 'waiting',
  }));
}
