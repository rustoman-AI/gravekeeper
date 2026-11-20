/**
 * Inert render-timing hook for the scene render budget spec (R8.10, R17.1).
 * Active only when `window.__GK_PERF__ === true` (set by the e2e spec through `addInitScript`).
 * Each run leaves one `gk-model-ready` mark and one `gk-scene` measure: earlier entries are cleared.
 */

declare global {
  interface Window {
    __GK_PERF__?: boolean;
  }
}

function active(): boolean {
  return typeof window !== 'undefined' && window.__GK_PERF__ === true && typeof performance !== 'undefined';
}

/** Marks the moment the result model is available. */
export function markModelReady(): void {
  if (!active()) return;
  performance.clearMarks('gk-model-ready');
  performance.mark('gk-model-ready');
}

/** After the next frame, measures from `gk-model-ready` to the first frame after the scene commit. */
export function measureSceneCommit(): void {
  if (!active()) return;
  requestAnimationFrame(() => {
    if (performance.getEntriesByName('gk-model-ready', 'mark').length === 0) return;
    performance.clearMeasures('gk-scene');
    performance.measure('gk-scene', 'gk-model-ready');
  });
}
