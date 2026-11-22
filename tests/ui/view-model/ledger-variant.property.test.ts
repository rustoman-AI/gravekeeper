// Feature: art-polish, Property AP-P1: Variant choice stays deterministic and total over the variant set
// Validates: Requirements 6.2, 6.3, 6.4
import * as fc from 'fast-check';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SceneSprites } from '../../../components/scene-sprites';
import type { PlotKind } from '../../../view-model/types';
import { SPRITE_VARIANTS, symbolIdOf, variantOf } from '../../../view-model/variants';
import { cfg } from '../../support/fc-config';

const KINDS = Object.keys(SPRITE_VARIANTS) as PlotKind[];
const arbKind = fc.constantFrom(...KINDS);
const arbKey = fc.oneof(
  fc.string(),
  fc.string({ unit: 'binary' }),
  fc.string({ unit: 'grapheme' }),
  fc.constant(''),
);

// Rendered once: the sheet does not depend on the generated values.
const sheet = renderToStaticMarkup(createElement(SceneSprites));
const symbolIds = new Set(
  [...sheet.matchAll(/<symbol\b[^>]*?\bid="([^"]+)"/g)].map((m) => m[1]),
);

describe('AP-P1 Variant choice stays deterministic and total over the variant set', () => {
  it('AP-P1 the tombstone and restless lists keep the four variants in order', () => {
    expect([...SPRITE_VARIANTS.tombstone]).toEqual(['rounded', 'cross', 'obelisk', 'slab']);
    expect([...SPRITE_VARIANTS.restless]).toEqual(['rounded', 'cross', 'obelisk', 'slab']);
  });

  it('AP-P1 variantOf is repeatable, a list member, and both symbol ids exist in the sheet', () => {
    expect(symbolIds.size).toBeGreaterThan(0);
    fc.assert(
      fc.property(arbKind, arbKey, (kind, key) => {
        const variant = variantOf(kind, key);
        expect(variantOf(kind, key)).toBe(variant);
        expect(SPRITE_VARIANTS[kind]).toContain(variant);
        expect(symbolIds.has(symbolIdOf(kind, variant, false))).toBe(true);
        expect(symbolIds.has(symbolIdOf(kind, variant, true))).toBe(true);
      }),
      cfg(),
    );
  });
});
