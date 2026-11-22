// @vitest-environment jsdom
// Feature: art-polish, Property AP-P3: The restless ghost rises above its stone
// Validates: Requirements 7.1, 7.2, 7.3, 7.5
import { cleanup, render } from '@testing-library/react';
import * as fc from 'fast-check';
import { createElement } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GhostDefs, GhostSymbols } from '../../../components/scene-sprite-ghosts';
import { SceneSpriteStones } from '../../../components/scene-sprite-stones';
import {
  GHOST_BASE_BOX,
  RESTLESS_GHOST_SCALE,
  RESTLESS_MAX_OVERFLOW_PX,
  RESTLESS_MAX_OVERLAP,
  RESTLESS_STONE_FOOT,
  RESTLESS_STONE_SCALE,
  STONE_TOPS,
  restlessGeometry,
  restlessGhostTransform,
  restlessStoneTransform,
} from '../../../view-model/restless-art';
import { SPRITE_VARIANTS, symbolIdOf } from '../../../view-model/variants';
import { cfg } from '../../support/fc-config';

/** Y values of every point in an absolute path (M, L, H, V, C, Q, Z), control points included. */
function pathYs(d: string): number[] {
  const ys: number[] = [];
  let cy = 0;
  for (const m of d.matchAll(/([MLHVCQZ])([^MLHVCQZ]*)/g)) {
    const cmd = m[1];
    const n = m[2].trim() === '' ? [] : m[2].trim().split(/[\s,]+/).map(Number);
    if (cmd === 'H') continue;
    if (cmd === 'V') {
      cy = n[0];
      ys.push(cy);
      continue;
    }
    for (let i = 1; i < n.length; i += 2) ys.push(n[i]);
    if (n.length >= 2) cy = n[n.length - 1];
  }
  return ys;
}

let host: Element;

beforeAll(() => {
  host = render(
    createElement(
      'svg',
      null,
      createElement('defs', null, createElement(GhostDefs)),
      createElement(SceneSpriteStones),
      createElement(GhostSymbols),
    ),
  ).container;
});
afterAll(cleanup);

function renderedStoneTop(variant: string): number {
  const paths = Array.from(host.querySelectorAll(`#shape-stone-${variant} path`)).filter(
    (p) => p.getAttribute('fill') === 'var(--color-stone)',
  );
  expect(paths.length).toBeGreaterThan(0);
  return Math.min(...paths.flatMap((p) => pathYs(p.getAttribute('d')!)));
}

describe('AP-P3 The restless ghost rises above its stone', () => {
  it('AP-P3 the geometry limits hold and the rendered markup matches the helpers', () => {
    fc.assert(
      fc.property(fc.constantFrom(...SPRITE_VARIANTS.restless), (v) => {
        const g = restlessGeometry(v);
        expect(g.eyeBottom).toBeLessThan(g.stoneTop);
        expect(RESTLESS_GHOST_SCALE).toBeGreaterThanOrEqual(0.85);
        expect(g.ghostTop).toBeGreaterThanOrEqual(-RESTLESS_MAX_OVERFLOW_PX);
        expect(g.overlapRatio).toBeLessThanOrEqual(RESTLESS_MAX_OVERLAP);

        // Numbers recomputed from the rendered drawing.
        const wispYs = pathYs(host.querySelector('#shape-ghost-wisp path')!.getAttribute('d')!);
        const eyeYs = Array.from(host.querySelectorAll('#shape-ghost-wisp [data-part="eye"]')).flatMap(
          (e) => pathYs(e.getAttribute('d')!),
        );
        expect(Math.min(...wispYs)).toBe(GHOST_BASE_BOX.top);
        expect(Math.max(...wispYs)).toBe(GHOST_BASE_BOX.bottom);
        expect(Math.max(...eyeYs)).toBe(GHOST_BASE_BOX.eyeBottom);
        const top = renderedStoneTop(v);
        expect(top).toBe(STONE_TOPS[v as keyof typeof STONE_TOPS]);
        const footY = RESTLESS_STONE_FOOT[1];
        const stoneTop = footY - (footY - top) * RESTLESS_STONE_SCALE;
        const s = RESTLESS_GHOST_SCALE;
        const ghostBottom = g.ghostTop + (GHOST_BASE_BOX.bottom - GHOST_BASE_BOX.top) * s;
        const eyeBottom = g.ghostTop + (GHOST_BASE_BOX.eyeBottom - GHOST_BASE_BOX.top) * s;
        expect(eyeBottom).toBeLessThan(stoneTop);
        expect(Math.max(0, ghostBottom - stoneTop) / (footY - stoneTop)).toBeLessThanOrEqual(
          RESTLESS_MAX_OVERLAP,
        );

        // Rendered symbols: transforms equal the helpers, stone before wisp, full and flat.
        for (const flat of [false, true]) {
          const sym = host.querySelector(`#${symbolIdOf('restless', v, flat)}`)!;
          const stone = sym.querySelector('[data-part="stone"]')!;
          const wisp = sym.querySelector('[data-part="wisp"]')!;
          expect(stone.getAttribute('transform')).toBe(restlessStoneTransform());
          expect(wisp.getAttribute('transform')).toBe(restlessGhostTransform());
          expect(stone.querySelector(`use[href="#shape-stone-${v}"]`)).not.toBeNull();
          expect(stone.compareDocumentPosition(wisp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        }
      }),
      cfg(),
    );
  });
});
