// Feature: graveyard-ui, Property 23: Sources are listed once each
// Validates: Requirements 11.2, 11.15
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildNotesModel } from '../../../view-model/notes';
import { parseScanResponse } from '../../../view-model/parse-response';
import type { ScanResult } from '../../../pipeline/scan/types';
import { cfg } from '../../support/fc-config';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';

// Requirement 11.2: the fixed order of the six sources.
const ORDER = ['github', 'depsdev', 'osv', 'npm', 'cratesio', 'pypi'] as const;
const SYMBOL = { ok: '✓', partial: '◐', failed: '✕' } as const;
const headers = { get: () => null };

describe('P23: Sources are listed once each', () => {
  it('P23 lists the six sources once each in the fixed order, with the status taken from sources', () => {
    fc.assert(
      fc.property(arbScanResult(), (generated: ScanResult) => {
        const out = parseScanResponse(200, headers, JSON.parse(JSON.stringify(generated)) as unknown);
        expect(out.kind).toBe('result');
        if (out.kind !== 'result') return;

        const list = buildNotesModel(out.result).sources;
        expect(list.map((s) => s.name)).toEqual([...ORDER]);
        expect(new Set(list.map((s) => s.name)).size).toBe(6);

        for (const [i, name] of ORDER.entries()) {
          const entry = list[i];
          const status = generated.sources[name];
          expect(entry.status).toBe(status);
          expect(entry.symbol).toBe(SYMBOL[status]);
          expect(entry.label.length).toBeGreaterThan(0);
          expect(entry.alert === null).toBe(status === 'ok');
        }
        expect(new Set(list.map((s) => s.symbol)).size).toBe(new Set(list.map((s) => s.status)).size);
      }),
      cfg(),
    );
  });
});
