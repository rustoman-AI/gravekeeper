import { describe, expect, it } from 'vitest';
import { EPITAPH_MAX_CHARS } from '../../../view-model/constants';
import { buildPackageRows } from '../../../view-model/package-rows';
import { buildSceneModel, columnsFor, hashKey, sceneHeight } from '../../../view-model/scene';
import { nextFocus } from '../../../view-model/scene-nav';
import type { FocusMove, ParsedScanResult, SceneModel } from '../../../view-model/types';
import { buildScanResult, manyRows, result300, result301 } from '../../support/ui/scan-result-builder';
import type { RowSpec } from '../../support/ui/scan-result-builder';

const sceneOf = (specs: readonly RowSpec[], columns: number): SceneModel =>
  buildSceneModel(buildPackageRows(buildScanResult(specs) as unknown as ParsedScanResult), columns);

describe('columnsFor (R8.1)', () => {
  it.each([
    [0, 2],
    [191, 2],
    [192, 2],
    [288, 3],
    [1920, 20],
    [100000, 20],
    [Number.NaN, 2],
    [Number.POSITIVE_INFINITY, 2],
    [-500, 2],
  ])('maps width %s to %s columns', (width, expected) => {
    expect(columnsFor(width)).toBe(expected);
  });
});

describe('hashKey (FNV-1a 32 bit)', () => {
  it('matches published vectors', () => {
    expect(hashKey('')).toBe(0x811c9dc5);
    expect(hashKey('a')).toBe(0xe40c292c);
    expect(hashKey('foobar')).toBe(0xbf9cf968);
  });

  it('hashes UTF-16 code units, not code points', () => {
    const prime = BigInt(0x01000193);
    const mask = BigInt(0xffffffff);
    let h = BigInt(0x811c9dc5);
    for (const unit of [0xd83d, 0xde00]) {
      h = ((h ^ BigInt(unit)) * prime) & mask;
    }
    expect(hashKey('\u{1F600}')).toBe(Number(h));
  });
});

describe('sceneHeight (R8.3)', () => {
  it('is padding only for zero plots', () => {
    expect(sceneHeight(0, 4)).toBe(32);
  });
  it('is one row plus padding for one plot', () => {
    expect(sceneHeight(1, 4)).toBe(120 + 32);
  });
  it('rounds rows up for 301 plots', () => {
    expect(sceneHeight(301, 20)).toBe(16 * 120 + 32);
  });
});

describe('buildSceneModel (R8.2, R8.9)', () => {
  it('does not simplify 300 plots and simplifies 301', () => {
    const rows300 = buildPackageRows(result300() as unknown as ParsedScanResult);
    const rows301 = buildPackageRows(result301() as unknown as ParsedScanResult);
    expect(rows300).toHaveLength(300);
    expect(rows301).toHaveLength(301);
    expect(buildSceneModel(rows300, 10).simplified).toBe(false);
    expect(buildSceneModel(rows301, 10).simplified).toBe(true);
  });

  it('ends a label longer than the epitaph limit with an ellipsis', () => {
    const long = 'x'.repeat(EPITAPH_MAX_CHARS + 20);
    const scene = sceneOf([{ name: long, kind: 'alive' }], 3);
    const label = scene.plots[0]!.label;
    expect(Array.from(label)).toHaveLength(EPITAPH_MAX_CHARS);
    expect(label.endsWith('\u2026')).toBe(true);
  });

  it('keeps a label of exactly the limit unchanged', () => {
    const exact = 'y'.repeat(EPITAPH_MAX_CHARS);
    const scene = sceneOf([{ name: exact, kind: 'alive' }], 3);
    expect(scene.plots[0]!.label).toBe(exact);
  });

  it('places plots by index and sizes the scene', () => {
    const scene = sceneOf(manyRows(7), 3);
    expect(scene.columns).toBe(3);
    expect(scene.rows).toBe(3);
    expect(scene.width).toBe(3 * 96 + 32);
    expect(scene.height).toBe(3 * 120 + 32);
    const p = scene.plots[4]!;
    expect([p.row, p.col]).toEqual([1, 1]);
    expect(p.x).toBeGreaterThanOrEqual(16 + 96);
    expect(p.x).toBeLessThanOrEqual(16 + 96 + 16);
    expect(p.y).toBeGreaterThanOrEqual(16 + 120);
    expect(p.y).toBeLessThanOrEqual(16 + 120 + 16);
  });
});

describe('nextFocus (R9.6, R9.9)', () => {
  // 7 plots, 3 columns: rows [0 1 2] [3 4 5] [6]
  const scene = sceneOf(manyRows(7), 3);
  const step = (current: number, move: FocusMove): number => nextFocus(scene, current, move);

  it('moves within the grid', () => {
    expect(step(4, 'left')).toBe(3);
    expect(step(4, 'right')).toBe(5);
    expect(step(4, 'up')).toBe(1);
    expect(step(1, 'down')).toBe(4);
    expect(step(3, 'down')).toBe(6);
  });

  it('stays put at the edges', () => {
    expect(step(3, 'left')).toBe(3);
    expect(step(2, 'right')).toBe(2);
    expect(step(1, 'up')).toBe(1);
    expect(step(5, 'down')).toBe(5);
  });

  it('handles the incomplete last row', () => {
    expect(step(6, 'right')).toBe(6);
    expect(step(6, 'down')).toBe(6);
    expect(step(6, 'up')).toBe(3);
    expect(step(4, 'down')).toBe(4);
    expect(step(5, 'down')).toBe(5);
    expect(step(6, 'home')).toBe(6);
    expect(step(6, 'end')).toBe(6);
  });

  it('moves home and end within the row', () => {
    expect(step(4, 'home')).toBe(3);
    expect(step(4, 'end')).toBe(5);
    expect(step(1, 'home')).toBe(0);
    expect(step(1, 'end')).toBe(2);
  });

  it('does not move on any key with a single plot', () => {
    const one = sceneOf(manyRows(1), 3);
    for (const move of ['up', 'down', 'left', 'right', 'home', 'end'] as const) {
      expect(nextFocus(one, 0, move)).toBe(0);
    }
  });

  it('shortens the end of an incomplete row', () => {
    const two = sceneOf(manyRows(2), 4);
    expect(nextFocus(two, 0, 'end')).toBe(1);
  });
});
