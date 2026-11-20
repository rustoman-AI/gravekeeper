// Feature: graveyard-ui, Property 4: Header numbers equal the summary numbers
// **Validates: Requirements 5.9**
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildHeaderModel } from '../../../view-model/header';
import { buildPackageRows } from '../../../view-model/package-rows';
import { parseScanResponse } from '../../../view-model/parse-response';
import type { ScanResult } from '../../../pipeline/scan/types';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';
import { cfg } from '../../support/fc-config';

const headers = { get: (): string | null => null };

describe('P4 Header numbers equal the summary numbers', () => {
  it('P4 N, M and the status counts come from the summary', () => {
    fc.assert(
      fc.property(arbScanResult(), (result: ScanResult) => {
        const out = parseScanResponse(200, headers, JSON.parse(JSON.stringify(result)));
        expect(out.kind).toBe('result');
        if (out.kind !== 'result') return;
        const parsed = out.result;
        const { counts, assessed } = parsed.summary;

        const header = buildHeaderModel(parsed, buildPackageRows(parsed));

        expect(counts.ALIVE + counts.HAUNTED + counts.DEAD).toBe(assessed);
        expect(header.counts.alive).toBe(counts.ALIVE);
        expect(header.counts.haunted).toBe(counts.HAUNTED);
        expect(header.counts.dead).toBe(counts.DEAD);
        expect(header.counts.buried + header.counts.forgotten).toBe(counts.DEAD);

        if (assessed === 0) {
          expect(header.headline).toBeNull();
        } else {
          expect(header.headline).not.toBeNull();
          expect(header.headline?.n).toBe(counts.DEAD + counts.HAUNTED);
          expect(header.headline?.m).toBe(assessed);
        }
      }),
      cfg(),
    );
  });
});
