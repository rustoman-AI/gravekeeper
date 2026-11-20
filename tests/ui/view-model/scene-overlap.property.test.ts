// Feature: graveyard-ui, Property 14: Plots and their labels do not overlap
// Validates: Requirements 8.11, 8.15
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildPackageRows } from '../../../view-model/package-rows';
import { parseScanResponse } from '../../../view-model/parse-response';
import { buildSceneModel, labelRect } from '../../../view-model/scene';
import type { ScanResult } from '../../../pipeline/scan/types';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';
import { cfg } from '../../support/fc-config';

const headers = { get: (): string | null => null };

interface Rect {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Rectangles are half-open [x, x + width) x [y, y + height): edge contact is not an overlap. */
function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Sweep over x so 1000 plots need far fewer than n^2 / 2 comparisons. */
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

describe('P14 Plots do not overlap', () => {
  it('P14 no two distinct plot rectangles intersect for 2 to 20 columns', () => {
    fc.assert(
      fc.property(
        arbScanResult({ large: true }),
        fc.integer({ min: 2, max: 20 }),
        (result: ScanResult, columns: number) => {
          const out = parseScanResponse(200, headers, JSON.parse(JSON.stringify(result)));
          expect(out.kind).toBe('result');
          if (out.kind !== 'result') return;

          const scene = buildSceneModel(buildPackageRows(out.result), columns);
          expect(scene.columns).toBe(columns);
          const rects: Rect[] = [];
          for (const p of scene.plots) {
            rects.push({ key: p.key, x: p.x, y: p.y, width: p.width, height: p.height });
            rects.push({ key: p.key + '#label', ...labelRect(p) });
          }
          expect(firstOverlap(rects)).toBeNull();
        },
      ),
      cfg(),
    );
  });
});
