import type { FocusMove, SceneModel } from './types';

/** Index of the plot to focus after `move`; `current` when nothing lies in that direction, -1 for an empty scene. */
export function nextFocus(scene: SceneModel, current: number, move: FocusMove): number {
  const n = scene.plots.length;
  const cols = scene.columns;
  if (n === 0) return -1;
  const i = Math.min(Math.max(Number.isFinite(current) ? Math.trunc(current) : 0, 0), n - 1);
  const row = Math.floor(i / cols);
  const col = i % cols;
  switch (move) {
    case 'left':
      return col > 0 ? i - 1 : i;
    case 'right':
      return col < cols - 1 && i + 1 < n ? i + 1 : i;
    case 'up':
      return i - cols >= 0 ? i - cols : i;
    case 'down':
      return i + cols < n ? i + cols : i;
    case 'home':
      return row * cols;
    case 'end':
      return Math.min(row * cols + cols - 1, n - 1);
  }
}
