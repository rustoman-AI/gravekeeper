// Feature: graveyard-ui, Property 17: Every row appears once with a label
// Validates: Requirements 8.14
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EPITAPH_MAX_CHARS } from '../../../view-model/constants';
import { buildPackageRows } from '../../../view-model/package-rows';
import { parseScanResponse } from '../../../view-model/parse-response';
import { buildSceneModel } from '../../../view-model/scene';
import type { ScanResult } from '../../../pipeline/scan/types';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';
import { cfg } from '../../support/fc-config';

const headers = { get: (): string | null => null };

describe('P17 Every row appears once with a label', () => {
  it('P17 each row has exactly one plot with a non-empty label containing its name or its cut form', () => {
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
          const counts = new Map<string, number>();
          for (const p of scene.plots) counts.set(p.key, (counts.get(p.key) ?? 0) + 1);
          const expected = new Map<string, number>();
          for (const r of rows) expected.set(r.key, (expected.get(r.key) ?? 0) + 1);
          expect(counts).toEqual(expected);

          rows.forEach((row, i) => {
            const plot = scene.plots[i];
            expect(plot.key).toBe(row.key);
            expect(plot.label.length).toBeGreaterThan(0);
            const points = Array.from(row.displayName);
            if (points.length <= EPITAPH_MAX_CHARS) {
              expect(plot.label).toContain(row.displayName);
            } else {
              const labelPoints = Array.from(plot.label);
              expect(labelPoints[labelPoints.length - 1]).toBe('\u2026');
              expect(labelPoints.length).toBeLessThanOrEqual(EPITAPH_MAX_CHARS);
              expect(row.displayName.startsWith(labelPoints.slice(0, -1).join(''))).toBe(true);
            }
          });
        },
      ),
      cfg(),
    );
  }, 300_000);
});
