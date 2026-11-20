// Feature: graveyard-ui, Property 30: Sorted table is an ordered permutation
// Validates: Requirements 18.4, 18.5, 18.9
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SCOPE_ORDER } from '../../../core';
import { buildPackageRows } from '../../../view-model/package-rows';
import { parseScanResponse } from '../../../view-model/parse-response';
import { buildTableModel } from '../../../view-model/table';
import type { PackageRow, PlotKind, TableColumnKey, TableSort } from '../../../view-model/types';
import type { ScanResult } from '../../../pipeline/scan/types';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';
import { cfg } from '../../support/fc-config';

const headers = { get: (): string | null => null };

const COLUMNS: readonly TableColumnKey[] = [
  'name',
  'ecosystem',
  'status',
  'score',
  'reason',
  'scopes',
  'version',
];

// Status rank of the scene order (design "Table sort", Requirement 7.9).
const RANK: Readonly<Record<PlotKind, number>> = {
  ghost: 0,
  restless: 0,
  tombstone: 1,
  overgrown: 1,
  lantern: 2,
  unmarked: 3,
};

// ---- independent oracle ------------------------------------------------------------------------

function cmpCodePoints(a: string, b: string): number {
  const x = Array.from(a, (c) => c.codePointAt(0) as number);
  const y = Array.from(b, (c) => c.codePointAt(0) as number);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (x[i] !== y[i]) return (x[i] as number) < (y[i] as number) ? -1 : 1;
  }
  return Math.sign(x.length - y.length);
}

type Key = string | number | readonly [number, string] | null;

function keyOf(column: TableColumnKey, row: PackageRow): Key {
  switch (column) {
    case 'name':
      return row.displayName;
    case 'ecosystem':
      return row.ecosystem;
    case 'status':
      return [RANK[row.kind], row.statusWord];
    case 'score':
      return row.score;
    case 'reason':
      return row.epitaphShort;
    case 'scopes':
      return SCOPE_ORDER.filter((s) => row.scopes.includes(s)).join(', ');
    case 'version':
      return row.lookupVersion;
  }
}

function cmpKeys(a: Exclude<Key, null>, b: Exclude<Key, null>): number {
  if (typeof a === 'number' && typeof b === 'number') return Math.sign(a - b);
  if (typeof a === 'string' && typeof b === 'string') return cmpCodePoints(a, b);
  if (Array.isArray(a) && Array.isArray(b)) {
    const [ra, wa] = a as readonly [number, string];
    const [rb, wb] = b as readonly [number, string];
    return ra !== rb ? Math.sign(ra - rb) : cmpCodePoints(wa, wb);
  }
  throw new Error('mixed key types');
}

// ---- generators --------------------------------------------------------------------------------

const arbSort = fc.option(
  fc.record({
    column: fc.constantFrom(...COLUMNS),
    direction: fc.constantFrom('asc' as const, 'desc' as const),
  }),
  { nil: null },
);

describe('P30: Sorted table is an ordered permutation', () => {
  it('P30 sorted rows permute the scene rows and are ordered by the column key, null keys last', () => {
    fc.assert(
      fc.property(arbScanResult(), arbSort, (result: ScanResult, sort: TableSort | null) => {
        const out = parseScanResponse(200, headers, JSON.parse(JSON.stringify(result)));
        expect(out.kind).toBe('result');
        if (out.kind !== 'result') return;
        const rows = buildPackageRows(out.result);
        const model = buildTableModel(rows, sort);

        // Permutation: same multiset of keys (row keys are unique).
        expect(model.rows).toHaveLength(rows.length);
        const sceneIndex = new Map(rows.map((r, i) => [r.key, i] as const));
        expect(sceneIndex.size).toBe(rows.length);
        const order = model.rows.map((r) => sceneIndex.get(r.key));
        expect(order.every((i) => i !== undefined)).toBe(true);
        expect(new Set(order).size).toBe(rows.length);

        if (sort === null) {
          expect(order).toEqual(rows.map((_, i) => i));
          return;
        }

        const sign = sort.direction === 'asc' ? 1 : -1;
        for (let n = 1; n < order.length; n++) {
          const ia = order[n - 1] as number;
          const ib = order[n] as number;
          const ka = keyOf(sort.column, rows[ia] as PackageRow);
          const kb = keyOf(sort.column, rows[ib] as PackageRow);
          if (ka === null && kb !== null) {
            throw new Error(`null key before non-null at position ${n}`);
          }
          if (ka === null || kb === null) {
            // null after non-null, or both null: scene order breaks ties
            if (ka === null && kb === null) expect(ia).toBeLessThan(ib);
            continue;
          }
          const c = sign * cmpKeys(ka, kb);
          expect(c).toBeLessThanOrEqual(0);
          if (c === 0) expect(ia).toBeLessThan(ib);
        }

        // Displayed cells agree with the underlying row.
        for (const m of model.rows) {
          const r = rows[sceneIndex.get(m.key) as number] as PackageRow;
          expect(m.score).toBe(r.score);
          expect(m.statusWord).toBe(r.statusWord);
        }
      }),
      cfg(),
    );
  });
});
