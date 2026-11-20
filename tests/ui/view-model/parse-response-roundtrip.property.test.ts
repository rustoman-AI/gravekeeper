// Feature: graveyard-ui, Property 28: Valid results round trip through the boundary
// Validates: Requirements 14.5, 14.8
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseScanResponse } from '../../../view-model/parse-response';
import type { ScanResult } from '../../../pipeline/scan/types';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';
import { cfg } from '../../support/fc-config';

const headers = { get: (): string | null => null };

function expectedExclusion(excluded: unknown): string {
  if (excluded === null) return 'counted';
  if (excluded === 'informational' || excluded === 'withdrawn') return excluded;
  return 'unknown';
}

describe('P28 Valid results round trip through the boundary', () => {
  it('P28 returns the input unchanged apart from narrowing, keeping valid facts, advisories and bases', () => {
    fc.assert(
      fc.property(arbScanResult(), (result: ScanResult) => {
        const wire = JSON.parse(JSON.stringify(result)) as ScanResult;
        const out = parseScanResponse(200, headers, wire);
        expect(out.kind).toBe('result');
        if (out.kind !== 'result') return;
        const parsed = out.result;

        const { dependencies: wireDeps, ...wireRest } = wire;
        const { dependencies: parsedDeps, ...parsedRest } = parsed;
        expect(parsedRest).toEqual(wireRest);
        expect(parsedDeps).toHaveLength(wireDeps.length);

        wireDeps.forEach((dep, i) => {
          const got = parsedDeps[i]!;
          expect(got.dependency).toEqual(dep.dependency);
          expect(got.facts).toEqual(dep.facts);
          expect(got.versionBasis).toEqual(dep.versionBasis);
          expect(got.advisories).toEqual(
            dep.advisories.map((a) => ({
              id: a.id,
              aliases: a.aliases,
              severity: a.severity,
              url: a.url,
              exclusion: expectedExclusion((a as { excluded?: unknown }).excluded),
            })),
          );
        });
      }),
      cfg(),
    );
  });
});
