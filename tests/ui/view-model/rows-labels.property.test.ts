// Feature: graveyard-ui, Property 10: Accessible labels
// Validates: Requirements 7.6, 7.13
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildPackageRows } from '../../../view-model/package-rows';
import { parseScanResponse } from '../../../view-model/parse-response';
import type { PlotKind } from '../../../view-model/types';
import type { ScanResult } from '../../../pipeline/scan/types';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';
import { cfg } from '../../support/fc-config';

const headers = { get: (): string | null => null };

const WORDS: Readonly<Record<PlotKind, string>> = {
  tombstone: 'dead, buried',
  overgrown: 'dead, forgotten',
  ghost: 'haunted',
  restless: 'haunted, buried',
  lantern: 'alive',
  unmarked: 'not assessed',
};

describe('P10 Accessible labels', () => {
  it('P10 every label is non-empty, names the package and status word, and is unique', () => {
    fc.assert(
      fc.property(arbScanResult(), (result: ScanResult) => {
        const out = parseScanResponse(200, headers, JSON.parse(JSON.stringify(result)));
        expect(out.kind).toBe('result');
        if (out.kind !== 'result') return;

        const rows = buildPackageRows(out.result);
        for (const row of rows) {
          expect(row.accessibleLabel.length).toBeGreaterThan(0);
          expect(row.statusWord).toBe(WORDS[row.kind]);
          expect(row.accessibleLabel).toContain(row.displayName);
          expect(row.accessibleLabel).toContain(row.statusWord);
          expect(row.accessibleLabel).toContain(row.ecosystem);
          if (row.kind === 'restless') {
            expect(row.accessibleLabel).toContain('haunted, buried');
          }
        }

        // Equal labels would be indistinguishable; labels of rows that share a name
        // must therefore differ (at the latest after the ecosystem).
        const labels = rows.map((r) => r.accessibleLabel);
        expect(new Set(labels).size).toBe(labels.length);
      }),
      cfg(),
    );
  });
});
