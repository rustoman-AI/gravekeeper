// @vitest-environment jsdom
// Feature: art-polish, Property AP-P3: The restless ghost rises beside a full-size stone
// Feature: polish-leftovers, Property 1: The restless ghost rises beside a full-size stone
// Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 5.4
import { cleanup, render } from '@testing-library/react';
import * as fc from 'fast-check';
import { createElement } from 'react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GhostDefs, GhostSymbols } from '../../../components/scene-sprite-ghosts';
import { SceneSpriteStones } from '../../../components/scene-sprite-stones';
import {
  GHOST_BASE_BOX,
  RESTLESS_GHOST_REFERENCE_SCALE,
  RESTLESS_MAX_OVERFLOW_PX,
  RESTLESS_MAX_OVERLAP,
  STONE_BOXES,
  STONE_TOPS,
  restlessGeometry,
  restlessGhostTransform,
  type RestlessVariant,
} from '../../../view-model/restless-art';
import { SPRITE_VARIANTS, symbolIdOf } from '../../../view-model/variants';
import { cfg } from '../../support/fc-config';

const CENTRAL_COLUMN_RIGHT = 46;

/** Coordinates of every point in an absolute path (M, L, H, V, C, Q, T, Z), control points included. */
function pathPoints(d: string): { xs: number[]; ys: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const m of d.matchAll(/([MLHVCQTZ])([^MLHVCQTZ]*)/g)) {
    const cmd = m[1];
    const n = m[2].trim() === '' ? [] : m[2].trim().split(/[\s,]+/).map(Number);
    if (cmd === 'H') xs.push(n[0]);
    else if (cmd === 'V') ys.push(n[0]);
    else
      for (let i = 0; i + 1 < n.length; i += 2) {
        xs.push(n[i]);
        ys.push(n[i + 1]);
      }
  }
  return { xs, ys };
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

/** Extent of the stone body, recomputed from the rendered stone-coloured paths of its shape. */
function renderedStone(variant: string) {
  const paths = Array.from(host.querySelectorAll(`#shape-stone-${variant} path`)).filter(
    (p) => p.getAttribute('fill') === 'var(--color-stone)',
  );
  expect(paths.length).toBeGreaterThan(0);
  const pts = paths.map((p) => pathPoints(p.getAttribute('d')!));
  return {
    left: Math.min(...pts.flatMap((p) => p.xs)),
    right: Math.max(...pts.flatMap((p) => p.xs)),
    top: Math.min(...pts.flatMap((p) => p.ys)),
  };
}

function parseTransform(t: string | null) {
  const m = /^translate\((-?[\d.]+) (-?[\d.]+)\) scale\(([\d.]+)\)$/.exec(t ?? '');
  expect(m).not.toBeNull();
  return { tx: Number(m![1]), ty: Number(m![2]), s: Number(m![3]) };
}

describe('AP-P3 The restless ghost rises beside a full-size stone', () => {
  it('AP-P3 the rendered arrangement meets the scale, overflow, overlap and column limits', () => {
    const wisp = pathPoints(host.querySelector('#shape-ghost-wisp path')!.getAttribute('d')!);
    const eyes = Array.from(host.querySelectorAll('#shape-ghost-wisp [data-part="eye"]')).map((e) =>
      pathPoints(e.getAttribute('d')!),
    );
    // The base box constants equal the drawing.
    expect(Math.min(...wisp.ys)).toBe(GHOST_BASE_BOX.top);
    expect(Math.max(...wisp.ys)).toBe(GHOST_BASE_BOX.bottom);
    expect(Math.min(...wisp.xs)).toBe(GHOST_BASE_BOX.left);
    expect(Math.max(...wisp.xs)).toBe(GHOST_BASE_BOX.right);
    expect(Math.max(...eyes.flatMap((e) => e.ys))).toBe(GHOST_BASE_BOX.eyeBottom);

    fc.assert(
      fc.property(
        fc.constantFrom(...SPRITE_VARIANTS.restless),
        fc.boolean(),
        (v, flat) => {
          const variant = v as RestlessVariant;
          const sym = host.querySelector(`#${symbolIdOf('restless', v, flat)}`)!;
          const stoneGroup = sym.querySelector('[data-part="stone"]')!;
          const wispGroup = sym.querySelector('[data-part="wisp"]')!;

          // Full-size stone drawn from its own shape, before the wisp.
          expect(stoneGroup.hasAttribute('transform')).toBe(false);
          expect(stoneGroup.querySelector(`use[href="#shape-stone-${v}"]`)).not.toBeNull();
          expect(stoneGroup.compareDocumentPosition(wispGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

          // Stone numbers recomputed from the rendered paths.
          const stone = renderedStone(v);
          const box = STONE_BOXES[variant];
          expect(stone.top).toBe(STONE_TOPS[variant]);
          expect(stone.top).toBe(box.top);
          expect(stone.left).toBe(box.left);
          expect(stone.right).toBe(box.right);
          const stoneBox = { ...stone, bottom: box.bottom };

          // Ghost scale and box from the rendered transform.
          const rendered = wispGroup.getAttribute('transform');
          expect(rendered).toBe(restlessGhostTransform(v));
          const { tx, ty, s } = parseTransform(rendered);
          const ratio = s / RESTLESS_GHOST_REFERENCE_SCALE;
          expect(ratio).toBeGreaterThanOrEqual(0.68);
          expect(ratio).toBeLessThanOrEqual(0.72);
          const ghost = {
            left: tx + GHOST_BASE_BOX.left * s,
            right: tx + GHOST_BASE_BOX.right * s,
            top: ty + GHOST_BASE_BOX.top * s,
            bottom: ty + GHOST_BASE_BOX.bottom * s,
          };
          expect(ghost.top).toBeGreaterThanOrEqual(-RESTLESS_MAX_OVERFLOW_PX - 1e-6);
          expect(ghost.left).toBeGreaterThan(CENTRAL_COLUMN_RIGHT);

          const w = Math.max(0, Math.min(ghost.right, stoneBox.right) - Math.max(ghost.left, stoneBox.left));
          const h = Math.max(0, Math.min(ghost.bottom, stoneBox.bottom) - Math.max(ghost.top, stoneBox.top));
          const overlap = (w * h) / ((stoneBox.right - stoneBox.left) * (stoneBox.bottom - stoneBox.top));
          expect(overlap).toBeLessThanOrEqual(RESTLESS_MAX_OVERLAP);

          // The helper agrees with the rendered numbers.
          const g = restlessGeometry(v);
          expect(g.ghostBox.left).toBeCloseTo(ghost.left, 4);
          expect(g.ghostBox.right).toBeCloseTo(ghost.right, 4);
          expect(g.ghostBox.top).toBeCloseTo(ghost.top, 4);
          expect(g.ghostBox.bottom).toBeCloseTo(ghost.bottom, 4);
          expect(g.overlapRatio).toBeCloseTo(overlap, 4);
          expect(g.centralColumnClear).toBe(true);
        },
      ),
      cfg(),
    );
  });
});