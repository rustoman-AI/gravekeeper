// Feature: graveyard-art, Property GA-P1: Variant choice is a deterministic function of kind and key
// Validates: Requirements 3.2, 3.3, 3.4
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildPackageRows } from '../../../view-model/package-rows';
import { parseScanResponse } from '../../../view-model/parse-response';
import { buildSceneModel } from '../../../view-model/scene';
import type { PlotKind } from '../../../view-model/types';
import { SPRITE_VARIANTS, symbolIdOf, variantOf } from '../../../view-model/variants';
import type { ScanResult } from '../../../pipeline/scan/types';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';
import { cfg } from '../../support/fc-config';

const headers = { get: (): string | null => null };
const KINDS = Object.keys(SPRITE_VARIANTS) as PlotKind[];
const arbKind = fc.constantFrom(...KINDS);
const arbKey = fc.oneof(fc.string(), fc.string({ unit: 'binary' }), fc.constant(''));

describe('GA-P1 Variant choice is a deterministic function of kind and key', () => {
  it('GA-P1 variantOf is an element of the kind list, repeatable, and symbolIdOf follows the id format', () => {
    fc.assert(
      fc.property(arbKind, arbKey, (kind, key) => {
        const variant = variantOf(kind, key);
        expect(SPRITE_VARIANTS[kind]).toContain(variant);
        expect(variantOf(kind, key)).toBe(variant);
        expect(symbolIdOf(kind, variant, false)).toBe(`plot-${kind}-${variant}`);
        expect(symbolIdOf(kind, variant, true)).toBe(`plot-${kind}-${variant}-flat`);
      }),
      cfg(),
    );
  });

  it('GA-P1 a plot with one kind and key has one variant and symbol id in scenes of any width and row order', () => {
    fc.assert(
      fc.property(
        arbScanResult({ large: true }),
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 20 }),
        fc.nat(),
        (result: ScanResult, colsA: number, colsB: number, shift: number) => {
          const out = parseScanResponse(200, headers, JSON.parse(JSON.stringify(result)));
          expect(out.kind).toBe('result');
          if (out.kind !== 'result') return;

          const rows = buildPackageRows(out.result);
          const k = rows.length === 0 ? 0 : shift % rows.length;
          const rotated = [...rows.slice(k), ...rows.slice(0, k)];

          const seen = new Map<string, { kind: PlotKind; variant: string; symbolId: string }>();
          for (const [list, columns] of [
            [rows, colsA],
            [rows, colsB],
            [rotated, colsA],
            [rotated, colsB],
          ] as const) {
            for (const plot of buildSceneModel(list, columns).plots) {
              const variant = variantOf(plot.kind, plot.key);
              expect(plot.variant).toBe(variant);
              expect(plot.symbolId).toBe(symbolIdOf(plot.kind, variant, false));
              const prev = seen.get(plot.key);
              if (prev === undefined) {
                seen.set(plot.key, { kind: plot.kind, variant: plot.variant, symbolId: plot.symbolId });
              } else {
                expect(plot.kind).toBe(prev.kind);
                expect(plot.variant).toBe(prev.variant);
                expect(plot.symbolId).toBe(prev.symbolId);
              }
            }
          }
        },
      ),
      cfg(),
    );
  }, 300_000);
});
