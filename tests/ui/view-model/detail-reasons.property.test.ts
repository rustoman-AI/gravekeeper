// Feature: graveyard-art, Property GA-P14: Reasons keep the core message and rule id verbatim
// Validates: Requirements 8.1, 8.6, 8.8
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { uniquePackages } from '../../../core';
import { buildDetailModel } from '../../../view-model/detail';
import { buildPackageRows } from '../../../view-model/package-rows';
import { parseScanResponse } from '../../../view-model/parse-response';
import { strongestReason } from '../../../view-model/reasons';
import type { ScanResult } from '../../../pipeline/scan/types';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';
import { cfg } from '../../support/fc-config';

const headers = { get: (): string | null => null };

describe('GA-P14 Reasons keep the core message and rule id verbatim', () => {
  it('GA-P14 each detail reason equals the core reason in length, order, ruleId and message, has a plain line, and only the strongest is main', () => {
    fc.assert(
      fc.property(arbScanResult(), (result: ScanResult) => {
        const out = parseScanResponse(200, headers, JSON.parse(JSON.stringify(result)));
        expect(out.kind).toBe('result');
        if (out.kind !== 'result') return;
        const parsed = out.result;

        const rows = buildPackageRows(parsed);
        const byKey = new Map(
          uniquePackages(parsed.assessed).map(
            (g) => [JSON.stringify([g.ecosystem, g.name, g.sourceKind]), g.classification] as const,
          ),
        );

        for (const row of rows) {
          const classification = byKey.get(row.key);
          if (classification === undefined || classification === null) continue;
          const detail = buildDetailModel(parsed, rows, row.key);
          expect(detail).not.toBeNull();
          if (detail === null) continue;

          const core = classification.reasons;
          expect(detail.reasons).toHaveLength(core.length);
          const strongest = strongestReason(classification);
          const mainIndex = strongest === null ? -1 : core.indexOf(strongest);
          detail.reasons.forEach((entry, i) => {
            expect(entry.ruleId).toBe(core[i]?.ruleId);
            expect(entry.message).toBe(core[i]?.message);
            expect(typeof entry.plain).toBe('string');
            expect(entry.plain.length).toBeGreaterThan(0);
            expect(entry.isMain).toBe(i === mainIndex);
          });
          expect(detail.reasons.filter((r) => r.isMain).length).toBe(core.length === 0 ? 0 : 1);
        }
      }),
      cfg(),
    );
    // Each run builds a full ScanResult and calls buildDetailModel once per row, so
    // FC_NUM_RUNS=1000 takes ~19 s alone and exceeds the 30 s default under CPU contention
    // in a full parallel deep run.
  }, 120_000);
});
