// Feature: graveyard-ui, Property 31: Table and scene agree
// Validates: Requirements 18.10
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildPackageRows } from '../../../view-model/package-rows';
import { parseScanResponse } from '../../../view-model/parse-response';
import { buildSceneModel } from '../../../view-model/scene';
import { buildTableModel } from '../../../view-model/table';
import type { TableColumnKey, TableSort } from '../../../view-model/types';
import type { ScanResult } from '../../../pipeline/scan/types';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';
import { cfg } from '../../support/fc-config';

const headers = { get: (): string | null => null };

const COLUMN_KEYS: readonly TableColumnKey[] = [
  'name',
  'ecosystem',
  'status',
  'score',
  'reason',
  'scopes',
  'version',
];

const arbSort = fc.option(
  fc.record({
    column: fc.constantFrom(...COLUMN_KEYS),
    direction: fc.constantFrom('asc' as const, 'desc' as const),
  }),
  { nil: null },
) as fc.Arbitrary<TableSort | null>;

describe('P31 Table and scene agree', () => {
  it('P31 table and scene hold the same keys, and each table row matches its plot row', () => {
    fc.assert(
      fc.property(arbScanResult(), arbSort, fc.integer({ min: 2, max: 20 }), (result: ScanResult, sort, columns) => {
        const out = parseScanResponse(200, headers, JSON.parse(JSON.stringify(result)));
        expect(out.kind).toBe('result');
        if (out.kind !== 'result') return;

        const rows = buildPackageRows(out.result);
        const table = buildTableModel(rows, sort);
        const scene = buildSceneModel(rows, columns);

        const tableKeys = table.rows.map((r) => r.key);
        const plotKeys = scene.plots.map((p) => p.key);
        expect(tableKeys).toHaveLength(plotKeys.length);
        expect(new Set(tableKeys).size).toBe(tableKeys.length);
        expect([...tableKeys].sort()).toEqual([...plotKeys].sort());

        const rowByKey = new Map(rows.map((r) => [r.key, r] as const));
        const plotByKey = new Map(scene.plots.map((p) => [p.key, p] as const));
        for (const tr of table.rows) {
          const row = rowByKey.get(tr.key);
          const plot = plotByKey.get(tr.key);
          expect(row).toBeDefined();
          expect(plot).toBeDefined();
          if (row === undefined || plot === undefined) continue;
          expect(tr.statusWord).toBe(row.statusWord);
          expect(tr.score).toBe(row.score);
          expect(plot.kind).toBe(row.kind);
          expect(plot.tooltip.lines[1]).toBe(tr.statusWord);
          expect(plot.tooltip.lines[2]).toBe(row.score === null ? 'score: not assessed' : `score: ${row.score}`);
        }
      }),
      cfg(),
    );
  });
});
