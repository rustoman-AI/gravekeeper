// Feature: graveyard-ui, Property 15: Plots lie inside the scene
// Validates: Requirements 8.3, 8.12, 8.15
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PLOT_CELL_HEIGHT_PX, SCENE_PADDING_PX } from '../../../view-model/constants';
import { buildPackageRows } from '../../../view-model/package-rows';
import { parseScanResponse } from '../../../view-model/parse-response';
import { buildSceneModel, labelRect } from '../../../view-model/scene';
import type { ScanResult } from '../../../pipeline/scan/types';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';
import { cfg } from '../../support/fc-config';

const headers = { get: (): string | null => null };

describe('P15 Plots lie inside the scene', () => {
  it('P15 every plot rectangle is inside [0, width] x [0, height] and height follows the formula', () => {
    fc.assert(
      fc.property(
        arbScanResult({ large: true }),
        fc.integer({ min: 2, max: 20 }),
        (result: ScanResult, columns: number) => {
          const out = parseScanResponse(200, headers, JSON.parse(JSON.stringify(result)));
          expect(out.kind).toBe('result');
          if (out.kind !== 'result') return;

          const scene = buildSceneModel(buildPackageRows(out.result), columns);
          expect(scene.height).toBe(scene.rows * PLOT_CELL_HEIGHT_PX + 2 * SCENE_PADDING_PX);
          for (const p of scene.plots) {
            expect(p.x).toBeGreaterThanOrEqual(0);
            expect(p.y).toBeGreaterThanOrEqual(0);
            expect(p.x + p.width).toBeLessThanOrEqual(scene.width);
            expect(p.y + p.height).toBeLessThanOrEqual(scene.height);
            const l = labelRect(p);
            expect(l.x).toBeGreaterThanOrEqual(0);
            expect(l.y).toBeGreaterThanOrEqual(0);
            expect(l.x + l.width).toBeLessThanOrEqual(scene.width);
            expect(l.y + l.height).toBeLessThanOrEqual(scene.height);
          }
        },
      ),
      cfg(),
    );
  }, 600_000);
});
