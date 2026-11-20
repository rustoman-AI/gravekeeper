// Feature: graveyard-ui, Property 8: Kinds and counts follow the core merge
// Validates: Requirements 7.2, 7.11
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { uniquePackages } from '../../../core';
import { plotKindOf } from '../../../view-model/grave-type';
import { buildPackageRows } from '../../../view-model/package-rows';
import { parseScanResponse } from '../../../view-model/parse-response';
import type { ScanResult } from '../../../pipeline/scan/types';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';
import { cfg } from '../../support/fc-config';

const headers = { get: (): string | null => null };

describe('P8 Kinds and counts follow the core merge', () => {
  it('P8 rows carry the core classification and kind, and kind counts equal the summary', () => {
    fc.assert(
      fc.property(arbScanResult(), (result: ScanResult) => {
        const out = parseScanResponse(200, headers, JSON.parse(JSON.stringify(result)));
        expect(out.kind).toBe('result');
        if (out.kind !== 'result') return;
        const parsed = out.result;

        const rows = buildPackageRows(parsed);
        const groups = uniquePackages(parsed.assessed);
        expect(rows).toHaveLength(groups.length);

        const byKey = new Map(
          groups.map((g) => [JSON.stringify([g.ecosystem, g.name, g.sourceKind]), g.classification] as const),
        );
        for (const row of rows) {
          expect(byKey.has(row.key)).toBe(true);
          const classification = byKey.get(row.key) ?? null;
          expect(row.classification).toEqual(classification);
          expect(row.kind).toBe(plotKindOf(classification));
        }

        const count = (...kinds: string[]): number => rows.filter((r) => kinds.includes(r.kind)).length;
        expect(count('tombstone', 'overgrown')).toBe(parsed.summary.counts.DEAD);
        expect(count('ghost', 'restless')).toBe(parsed.summary.counts.HAUNTED);
        expect(count('lantern')).toBe(parsed.summary.counts.ALIVE);
        expect(count('unmarked')).toBe(parsed.summary.unassessed);
      }),
      cfg(),
    );
  });
});
