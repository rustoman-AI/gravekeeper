// Feature: graveyard-ui, Property 7: One row per package key
// Validates: Requirements 7.1, 7.10
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildPackageRows } from '../../../view-model/package-rows';
import { parseScanResponse } from '../../../view-model/parse-response';
import type { ParsedScanResult } from '../../../view-model/types';
import { cfg } from '../../support/fc-config';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';

// The view model receives the result as parsed from the wire, so go through the real parser.
function parsed(result: unknown): ParsedScanResult {
  const outcome = parseScanResponse(200, { get: () => null }, JSON.parse(JSON.stringify(result)) as unknown);
  if (outcome.kind !== 'result') throw new Error(`generated result did not parse: ${outcome.kind}`);
  return outcome.result;
}

const keyOf = (ecosystem: string, name: string, sourceKind: string): string =>
  JSON.stringify([ecosystem, name, sourceKind]);

describe('P7: One row per package key', () => {
  it('P7 has exactly one row per distinct dependency key, and as many rows as summary.total', () => {
    fc.assert(
      fc.property(arbScanResult(), (generated) => {
        const result = parsed(generated);
        const rows = buildPackageRows(result);

        const expected = new Set(
          result.dependencies.map((d) => keyOf(d.dependency.ecosystem, d.dependency.name, d.dependency.sourceKind)),
        );
        const rowKeys = rows.map((r) => r.key);

        expect(new Set(rowKeys).size).toBe(rowKeys.length); // no key appears twice
        expect(new Set(rowKeys)).toEqual(expected); // every key present, no extra rows
        expect(rows.length).toBe(result.summary.total);
        for (const r of rows) expect(r.key).toBe(keyOf(r.ecosystem, r.name, r.sourceKind));
      }),
      cfg(),
    );
  });
});
