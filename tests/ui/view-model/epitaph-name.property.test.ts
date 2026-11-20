// Feature: graveyard-art, Property GA-P8: The epitaph contains the name and is made of sentences
// Validates: Requirements 7.2, 7.7
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { ScanResult } from '../../../pipeline/scan/types';
import { buildEpitaph } from '../../../view-model/epitaph';
import { buildPackageRows } from '../../../view-model/package-rows';
import { parseScanResponse } from '../../../view-model/parse-response';
import type { PackageRow } from '../../../view-model/types';
import { cfg } from '../../support/fc-config';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';
const headers = { get: (): string | null => null };
const arbName = fc.oneof(
  fc.string({ minLength: 1 }),
  fc.string({ unit: 'grapheme', minLength: 1 }),
  fc.stringMatching(/^[a-z][a-z0-9 ._-]{0,12}$/).map((s) => `${s}.`),
  fc.constantFrom('@scope/pkg.', 'naïve café', '墓地 package', 'a b  c', 'x.', '🪦 grave'),
);
function rowsOf(result: ScanResult): PackageRow[] {
  const out = parseScanResponse(200, headers, JSON.parse(JSON.stringify(result)));
  if (out.kind !== 'result') return [];
  return [...buildPackageRows(out.result)];
}
describe('GA-P8 The epitaph contains the name and is made of sentences', () => {
  it('GA-P8 text has the name, starts with "Here lies ", joins the lines, and every line ends with a full stop', () => {
    fc.assert(
      fc.property(arbScanResult(), fc.array(arbName, { maxLength: 64 }), (result, names) => {
        const rows = rowsOf(result);
        rows.forEach((base, i) => {
          const row: PackageRow = i < names.length ? { ...base, displayName: names[i]! } : base;
          const e = buildEpitaph(row);
          expect(e.text).toContain(row.displayName);
          expect(e.text.startsWith('Here lies ')).toBe(true);
          expect(e.text).toBe(e.lines.join(' '));
          expect(e.lines.length).toBeGreaterThan(0);
          for (const line of e.lines) expect(line.endsWith('.')).toBe(true);
        });
      }),
      cfg(),
    );
  });
});
