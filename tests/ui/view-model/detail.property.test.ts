// Feature: graveyard-ui, Property 20: Detail contains every reason and fact
// Validates: Requirements 10.4, 10.15
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { uniquePackages } from '../../../core';
import { buildDetailModel } from '../../../view-model/detail';
import { FACT_LABELS } from '../../../view-model/fact-labels';
import { FACT_FIELDS } from '../../../view-model/format-fact';
import { buildPackageRows } from '../../../view-model/package-rows';
import { parseScanResponse } from '../../../view-model/parse-response';
import type { ScanResult } from '../../../pipeline/scan/types';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';
import { cfg } from '../../support/fc-config';

const headers = { get: (): string | null => null };

describe('P20 Detail contains every reason and fact', () => {
  it('P20 the detail lists every reason verbatim in order, marks one as main, and names each fact once', () => {
    fc.assert(
      fc.property(arbScanResult(), (result: ScanResult) => {
        const out = parseScanResponse(200, headers, JSON.parse(JSON.stringify(result)));
        expect(out.kind).toBe('result');
        if (out.kind !== 'result') return;
        const parsed = out.result;

        const rows = buildPackageRows(parsed);
        const groups = uniquePackages(parsed.assessed);
        const byKey = new Map(
          groups.map((g) => [JSON.stringify([g.ecosystem, g.name, g.sourceKind]), g.classification] as const),
        );

        for (const row of rows) {
          const classification = byKey.get(row.key) ?? null;
          if (classification === null) continue;
          const detail = buildDetailModel(parsed, rows, row.key);
          expect(detail).not.toBeNull();
          if (detail === null) continue;

          expect(detail.reasons.map((r) => r.message)).toEqual(classification.reasons.map((r) => r.message));
          expect(detail.reasons.map((r) => r.ruleId)).toEqual(classification.reasons.map((r) => r.ruleId));
          const mains = detail.reasons.filter((r) => r.isMain).length;
          expect(mains).toBe(classification.reasons.length === 0 ? 0 : 1);

          const names = detail.facts.map((f) => f.field);
          expect(names).toEqual([...FACT_FIELDS]);
          expect(new Set(names).size).toBe(7);
          const labels = detail.facts.map((f) => f.label);
          expect(labels).toEqual(FACT_FIELDS.map((f) => FACT_LABELS[f]));
          expect(new Set(labels).size).toBe(7);
        }
      }),
      cfg(),
    );
    // FC_NUM_RUNS=1000 takes 20-30 s in a full parallel deep run (CPU contention), near the 30 s default.
  }, 120_000);
});
