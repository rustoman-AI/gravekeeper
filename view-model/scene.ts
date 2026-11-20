import {
  EPITAPH_MAX_CHARS,
  LABEL_BAND_HEIGHT_PX,
  PLOT_BOX_HEIGHT_PX,
  PLOT_BOX_WIDTH_PX,
  PLOT_CELL_HEIGHT_PX,
  PLOT_CELL_WIDTH_PX,
  PLOT_JITTER_MAX_PX,
  SCENE_MAX_COLUMNS,
  SCENE_MAX_PLOTS,
  SCENE_MIN_COLUMNS,
  SCENE_PADDING_PX,
} from './constants';
import { depthOf } from './depth';
import { hashKey } from './hash';
import type { PackageRow, PlotModel, SceneModel } from './types';

const JITTER_RANGE = 2 * PLOT_JITTER_MAX_PX + 1;
const ELLIPSIS = '\u2026';

function clampColumns(columns: number): number {
  const raw = Math.floor(columns);
  return Math.min(
    SCENE_MAX_COLUMNS,
    Math.max(SCENE_MIN_COLUMNS, Number.isFinite(raw) ? raw : SCENE_MIN_COLUMNS),
  );
}

/** clamp(floor(w / PLOT_CELL_WIDTH_PX), 2, 20); a non-finite width gives the minimum (R8.1). */
export function columnsFor(containerWidthPx: number): number {
  const raw = Math.floor(containerWidthPx / PLOT_CELL_WIDTH_PX);
  return Math.min(
    SCENE_MAX_COLUMNS,
    Math.max(SCENE_MIN_COLUMNS, Number.isFinite(raw) ? raw : SCENE_MIN_COLUMNS),
  );
}

export { hashKey };

/** rows * PLOT_CELL_HEIGHT_PX + 2 * SCENE_PADDING_PX (R8.3). */
export function sceneHeight(plotCount: number, columns: number): number {
  const cols = clampColumns(columns);
  return Math.ceil(plotCount / cols) * PLOT_CELL_HEIGHT_PX + 2 * SCENE_PADDING_PX;
}

/** Label rectangle of a plot: directly below its box, as wide as the box, LABEL_BAND_HEIGHT_PX high (R8.15). */
export function labelRect(plot: Pick<PlotModel, 'x' | 'y' | 'width' | 'height'>): {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
} {
  return { x: plot.x, y: plot.y + plot.height, width: plot.width, height: LABEL_BAND_HEIGHT_PX };
}

/** Cut to at most EPITAPH_MAX_CHARS code points, the last one an ellipsis when cut. */
function cutLabel(text: string): string {
  const points = Array.from(text);
  if (points.length <= EPITAPH_MAX_CHARS) return text;
  return points.slice(0, EPITAPH_MAX_CHARS - 1).join('') + ELLIPSIS;
}

function plotOf(row: PackageRow, i: number, cols: number, rowCount: number): PlotModel {
  const r = Math.floor(i / cols);
  // graveyard-art Requirements 2.6, 2.8: depth never touches x, y, width, height or phase.
  const depth = depthOf(r, rowCount);
  const c = i % cols;
  const h = hashKey(row.key);
  const jx = (h % JITTER_RANGE) - PLOT_JITTER_MAX_PX;
  const jy = ((h >>> 8) % JITTER_RANGE) - PLOT_JITTER_MAX_PX;
  const scoreLine = row.score === null ? 'score: not assessed' : `score: ${row.score}`;
  return {
    key: row.key,
    index: i,
    row: r,
    col: c,
    kind: row.kind,
    graveType: row.graveType,
    glow: row.glow,
    label: cutLabel(row.displayName),
    accessibleLabel: row.accessibleLabel,
    tooltip: {
      title: row.displayName,
      lines: [row.ecosystem, row.statusWord, scoreLine, row.epitaphShort],
    },
    x: SCENE_PADDING_PX + c * PLOT_CELL_WIDTH_PX + PLOT_JITTER_MAX_PX + jx,
    y: SCENE_PADDING_PX + r * PLOT_CELL_HEIGHT_PX + PLOT_JITTER_MAX_PX + jy,
    width: PLOT_BOX_WIDTH_PX,
    height: PLOT_BOX_HEIGHT_PX,
    phase: (h >>> 16) / 65535,
    depthScale: depth.scale,
    depthBrightness: depth.brightness,
  };
}

/** Rows are already in scene order; plot i sits in cell (floor(i / columns), i % columns). */
export function buildSceneModel(rows: readonly PackageRow[], columns: number): SceneModel {
  const cols = clampColumns(columns);
  const rowCount = Math.ceil(rows.length / cols);
  return {
    columns: cols,
    rows: rowCount,
    width: cols * PLOT_CELL_WIDTH_PX + 2 * SCENE_PADDING_PX,
    height: sceneHeight(rows.length, cols),
    simplified: rows.length > SCENE_MAX_PLOTS,
    plots: rows.map((row, i) => plotOf(row, i, cols, rowCount)),
  };
}
