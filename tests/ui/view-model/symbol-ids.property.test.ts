// @vitest-environment jsdom
// Feature: graveyard-art, Property GA-P10: Every plot resolves to one existing, kind-unique symbol
// Validates: Requirements 4.7, 4.8
import { render } from '@testing-library/react';
import * as fc from 'fast-check';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { SceneSprites } from '../../../components/scene-sprites';
import type { ScanResult } from '../../../pipeline/scan/types';
import { buildPackageRows } from '../../../view-model/package-rows';
import { parseScanResponse } from '../../../view-model/parse-response';
import { buildSceneModel } from '../../../view-model/scene';
import type { PlotKind } from '../../../view-model/types';
import { SPRITE_VARIANTS, symbolIdOf } from '../../../view-model/variants';
import { cfg } from '../../support/fc-config';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';

const headers = { get: (): string | null => null };
const KINDS = Object.keys(SPRITE_VARIANTS) as PlotKind[];

function idsOf(kind: PlotKind, flat: boolean): string[] {
  return SPRITE_VARIANTS[kind].map((v) => symbolIdOf(kind, v, flat));
}

const PLAIN_IDS = new Set(KINDS.flatMap((k) => idsOf(k, false)));
const FLAT_IDS = new Set(KINDS.flatMap((k) => idsOf(k, true)));

describe('GA-P10 Every plot resolves to one existing, kind-unique symbol', () => {
  it('GA-P10 the table holds no duplicate id and the per-kind id sets are disjoint', () => {
    const all = KINDS.flatMap((k) => idsOf(k, false));
    expect(new Set(all).size).toBe(all.length);
    for (const kind of KINDS) {
      expect(new Set(SPRITE_VARIANTS[kind]).size).toBe(SPRITE_VARIANTS[kind].length);
      const mine = new Set([...idsOf(kind, false), ...idsOf(kind, true)]);
      for (const other of KINDS) {
        if (other === kind) continue;
        for (const id of [...idsOf(other, false), ...idsOf(other, true)]) {
          expect(mine.has(id), `${kind} vs ${other}: ${id}`).toBe(false);
        }
      }
    }
  });

  it('GA-P10 every plot symbolId is in the table and its flat twin exists', () => {
    fc.assert(
      fc.property(arbScanResult({ large: true }), fc.integer({ min: 1, max: 20 }), (result: ScanResult, columns: number) => {
        const out = parseScanResponse(200, headers, JSON.parse(JSON.stringify(result)));
        expect(out.kind).toBe('result');
        if (out.kind !== 'result') return;
        for (const plot of buildSceneModel(buildPackageRows(out.result), columns).plots) {
          expect(PLAIN_IDS.has(plot.symbolId), plot.symbolId).toBe(true);
          expect(FLAT_IDS.has(`${plot.symbolId}-flat`), plot.symbolId).toBe(true);
          expect(idsOf(plot.kind, false)).toContain(plot.symbolId);
        }
      }),
      cfg(),
    );
  }, 300_000);

  it('GA-P10 the rendered sheet holds every table id and its flat twin, with no identical symbols per form', () => {
    const { container } = render(createElement(SceneSprites));
    const svg = container.querySelector('svg') as SVGSVGElement;
    const serialized = (el: Element): string => {
      const clone = el.cloneNode(true) as Element;
      clone.removeAttribute('id');
      return clone.outerHTML;
    };
    for (const ids of [PLAIN_IDS, FLAT_IDS]) {
      const seen = new Map<string, string>();
      for (const id of ids) {
        const el = svg.querySelector(`[id="${id}"]`);
        expect(el, id).not.toBeNull();
        expect(el?.tagName.toLowerCase()).toBe('symbol');
        const s = serialized(el as Element);
        expect(seen.get(s), `${id} duplicates ${seen.get(s)}`).toBeUndefined();
        seen.set(s, id);
      }
    }
  });
});
