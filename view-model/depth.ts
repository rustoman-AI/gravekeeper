import { DEPTH_BRIGHTNESS_BACK, DEPTH_SCALE_BACK } from './constants';

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * graveyard-art Requirements 2.6, 2.7: depth of a plot from its row index and the row count.
 * The back row (row 0) gets the BACK values, the front row and a one-row Scene get 1.
 * Invalid input is clamped: t stays in [0, 1], and rowCount <= 1 or non-finite gives the front values.
 */
export function depthOf(row: number, rowCount: number): { scale: number; brightness: number } {
  let t = 1;
  if (Number.isFinite(rowCount) && rowCount > 1) {
    const raw = row / (rowCount - 1);
    t = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
  }
  return {
    scale: round3(DEPTH_SCALE_BACK + (1 - DEPTH_SCALE_BACK) * t),
    brightness: round3(DEPTH_BRIGHTNESS_BACK + (1 - DEPTH_BRIGHTNESS_BACK) * t),
  };
}
