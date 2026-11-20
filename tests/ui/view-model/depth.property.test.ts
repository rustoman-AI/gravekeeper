// Feature: graveyard-art, Property GA-P3: Depth is monotone by row and stays in range
// Validates: Requirements 2.6, 2.7
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEPTH_BRIGHTNESS_BACK, DEPTH_SCALE_BACK } from '../../../view-model/constants';
import { depthOf } from '../../../view-model/depth';
import { buildPackageRows } from '../../../view-model/package-rows';
import { parseScanResponse } from '../../../view-model/parse-response';
import { buildSceneModel } from '../../../view-model/scene';
import type { ScanResult } from '../../../pipeline/scan/types';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';
import { cfg } from '../../support/fc-config';

const headers = { get: (): string | null => null };

describe('GA-P3 Depth is monotone by row and stays in range', () => {
  it('GA-P3 depthOf is monotone in the row, in range, and 1 for the last row and for one row', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5000 }),
        fc.nat(4999),
        fc.nat(4999),
        (n, a, b) => {
          const r1 = Math.min(a % n, b % n);
          const r2 = Math.max(a % n, b % n);
          const d1 = depthOf(r1, n);
          const d2 = depthOf(r2, n);
          expect(d1.scale).toBeLessThanOrEqual(d2.scale);
          expect(d1.brightness).toBeLessThanOrEqual(d2.brightness);
          for (const d of [d1, d2]) {
            expect(d.scale).toBeGreaterThanOrEqual(DEPTH_SCALE_BACK);
            expect(d.scale).toBeLessThanOrEqual(1);
            expect(d.brightness).toBeGreaterThanOrEqual(DEPTH_BRIGHTNESS_BACK);
            expect(d.brightness).toBeLessThanOrEqual(1);
          }
          expect(depthOf(n - 1, n)).toEqual({ scale: 1, brightness: 1 });
        },
      ),
      cfg(),
    );
    expect(depthOf(0, 1)).toEqual({ scale: 1, brightness: 1 });
  });

  it('GA-P3 plots of one row share depth and later rows have values at least those of earlier rows', () => {
    fc.assert(
      fc.property(
        arbScanResult({ large: true }),
        fc.integer({ min: 2, max: 20 }),
        (result: ScanResult, columns: number) => {
          const out = parseScanResponse(200, headers, JSON.parse(JSON.stringify(result)));
          expect(out.kind).toBe('result');
          if (out.kind !== 'result') return;

          const scene = buildSceneModel(buildPackageRows(out.result), columns);
          const cols = scene.columns;
          const byRow = new Map<number, { scale: number; brightness: number }>();
          scene.plots.forEach((p, i) => {
            const r = Math.floor(i / cols);
            const prev = byRow.get(r);
            if (prev === undefined) {
              byRow.set(r, { scale: p.depthScale, brightness: p.depthBrightness });
            } else {
              expect(p.depthScale).toBe(prev.scale);
              expect(p.depthBrightness).toBe(prev.brightness);
            }
            expect(p.depthScale).toBeGreaterThanOrEqual(DEPTH_SCALE_BACK);
            expect(p.depthScale).toBeLessThanOrEqual(1);
            expect(p.depthBrightness).toBeGreaterThanOrEqual(DEPTH_BRIGHTNESS_BACK);
            expect(p.depthBrightness).toBeLessThanOrEqual(1);
          });
          const rowsSorted = [...byRow.keys()].sort((x, y) => x - y);
          for (let k = 1; k < rowsSorted.length; k++) {
            const earlier = byRow.get(rowsSorted[k - 1])!;
            const later = byRow.get(rowsSorted[k])!;
            expect(later.scale).toBeGreaterThanOrEqual(earlier.scale);
            expect(later.brightness).toBeGreaterThanOrEqual(earlier.brightness);
          }
          if (rowsSorted.length > 0) {
            const last = byRow.get(rowsSorted[rowsSorted.length - 1])!;
            expect(last).toEqual({ scale: 1, brightness: 1 });
          }
        },
      ),
      cfg(),
    );
  }, 300_000);
});
