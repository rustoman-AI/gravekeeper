// Feature: graveyard-art, Property GA-P4: Depth does not change any layout box
// Validates: Requirements 2.8, 17.1
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  LABEL_BAND_HEIGHT_PX,
  PLOT_BOX_HEIGHT_PX,
  PLOT_BOX_WIDTH_PX,
  PLOT_CELL_HEIGHT_PX,
  PLOT_CELL_WIDTH_PX,
  PLOT_JITTER_MAX_PX,
  SCENE_PADDING_PX,
} from '../../../view-model/constants';
import { hashKey } from '../../../view-model/hash';
import { buildPackageRows } from '../../../view-model/package-rows';
import { parseScanResponse } from '../../../view-model/parse-response';
import { buildSceneModel, labelRect } from '../../../view-model/scene';
import type { ScanResult } from '../../../pipeline/scan/types';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';
import { cfg } from '../../support/fc-config';

const headers = { get: (): string | null => null };

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Half-open rectangles: edge contact is not an overlap (same rule as graveyard-ui P14). */
function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function firstOverlap(rects: readonly Rect[]): [Rect, Rect] | null {
  const sorted = [...rects].sort((a, b) => a.x - b.x);
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (b.x >= a.x + a.width) break;
      if (intersects(a, b)) return [a, b];
    }
  }
  return null;
}

describe('GA-P4 Depth does not change any layout box', () => {
  it('GA-P4 x, y, width and height equal the independently computed cell formula; P14 and P15 hold', () => {
    fc.assert(
      fc.property(
        arbScanResult({ large: true }),
        fc.integer({ min: 2, max: 20 }),
        (result: ScanResult, columns: number) => {
          const out = parseScanResponse(200, headers, JSON.parse(JSON.stringify(result)));
          expect(out.kind).toBe('result');
          if (out.kind !== 'result') return;

          const rows = buildPackageRows(out.result);
          const scene = buildSceneModel(rows, columns);
          expect(scene.plots.length).toBe(rows.length);

          const range = 2 * PLOT_JITTER_MAX_PX + 1;
          const rects: Rect[] = [];
          scene.plots.forEach((p, i) => {
            const row = rows[i];
            const h = hashKey(row.key);
            const jx = (h % range) - PLOT_JITTER_MAX_PX;
            const jy = ((h >>> 8) % range) - PLOT_JITTER_MAX_PX;
            const col = i % columns;
            const r = Math.floor(i / columns);
            expect(p.key).toBe(row.key);
            expect(p.x).toBe(SCENE_PADDING_PX + col * PLOT_CELL_WIDTH_PX + PLOT_JITTER_MAX_PX + jx);
            expect(p.y).toBe(SCENE_PADDING_PX + r * PLOT_CELL_HEIGHT_PX + PLOT_JITTER_MAX_PX + jy);
            expect(p.width).toBe(PLOT_BOX_WIDTH_PX);
            expect(p.height).toBe(PLOT_BOX_HEIGHT_PX);

            // graveyard-ui P15: inside the scene (box and label band).
            expect(p.x).toBeGreaterThanOrEqual(0);
            expect(p.y).toBeGreaterThanOrEqual(0);
            expect(p.x + p.width).toBeLessThanOrEqual(scene.width);
            const l = labelRect(p);
            expect(l.height).toBe(LABEL_BAND_HEIGHT_PX);
            expect(l.y + l.height).toBeLessThanOrEqual(scene.height);

            rects.push({ x: p.x, y: p.y, width: p.width, height: p.height });
            rects.push(l);
          });
          // graveyard-ui P14: no overlap of boxes and labels.
          expect(firstOverlap(rects)).toBeNull();
        },
      ),
      cfg(),
    );
  }, 600_000);
});
