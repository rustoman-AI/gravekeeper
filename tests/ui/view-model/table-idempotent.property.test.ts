// Feature: graveyard-ui, Property 32: Sorting is idempotent
// Validates: Requirements 18.11
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildPackageRows } from '../../../view-model/package-rows';
import { parseScanResponse } from '../../../view-model/parse-response';
import { buildTableModel } from '../../../view-model/table';
import type { PackageRow, TableColumnKey, TableSort } from '../../../view-model/types';
import type { ScanResult } from '../../../pipeline/scan/types';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';
import { cfg } from '../../support/fc-config';

const headers = { get: (): string | null => null };

const COLUMNS: readonly TableColumnKey[] = ['name', 'ecosystem', 'status', 'score', 'reason', 'scopes', 'version'];

const arbSort = fc.record({
  column: fc.constantFrom(...COLUMNS),
  direction: fc.constantFrom('asc' as const, 'desc' as const),
}) as fc.Arbitrary<TableSort>;

describe('P32 Sorting is idempotent', () => {
  it('P32 building the table from the rows of a table built with the same sort keeps the row order', () => {
    fc.assert(
      fc.property(arbScanResult(), arbSort, (result: ScanResult, sort: TableSort) => {
        const out = parseScanResponse(200, headers, JSON.parse(JSON.stringify(result)));
        expect(out.kind).toBe('result');
        if (out.kind !== 'result') return;

        const rows = buildPackageRows(out.result);
        const once = buildTableModel(rows, sort);

        const byKey = new Map<string, PackageRow>(rows.map((r) => [r.key, r] as const));
        const sortedRows = once.rows.map((r) => {
          const row = byKey.get(r.key);
          if (row === undefined) throw new Error(`unknown row key ${r.key}`);
          return row;
        });
        const twice = buildTableModel(sortedRows, sort);

        expect(twice.rows.map((r) => r.key)).toEqual(once.rows.map((r) => r.key));
        expect(twice.rows).toEqual(once.rows);
      }),
      cfg(),
    );
  });
});
