import { describe, expect, it } from 'vitest';
import { buildPickerModel } from '../../../view-model/picker';
import { SCAN_MAX_MANIFESTS } from '../../../view-model/constants';

const paths = (n: number) => Array.from({ length: n }, (_, i) => `pkg${i}/package.json`);
const REPO = 'https://github.com/o/r';

describe('buildPickerModel (R11.11, R13.15, R13.16)', () => {
  it('lists every candidate in order with the limit and no URL while nothing is selected', () => {
    const model = buildPickerModel(['b/package.json', 'a/package.json'], [], REPO);
    expect(model.candidates.map((c) => c.path)).toEqual(['b/package.json', 'a/package.json']);
    expect(model.candidates.every((c) => !c.checked && !c.disabled)).toBe(true);
    expect(model.limit).toBe(SCAN_MAX_MANIFESTS);
    expect(model.scanUrl).toBeNull();
  });

  it('gives a URL naming the selected paths', () => {
    const model = buildPickerModel(['a/package.json', 'b/package.json'], ['b/package.json'], REPO);
    expect(model.candidates.map((c) => c.checked)).toEqual([false, true]);
    expect(model.scanUrl).not.toBeNull();
    expect(decodeURIComponent(model.scanUrl!)).toContain('b/package.json');
    expect(decodeURIComponent(model.scanUrl!)).not.toContain('a/package.json');
  });

  it('disables every unchecked box once SCAN_MAX_MANIFESTS are checked', () => {
    const all = paths(SCAN_MAX_MANIFESTS + 3);
    const model = buildPickerModel(all, all.slice(0, SCAN_MAX_MANIFESTS), REPO);
    expect(model.candidates.filter((c) => c.checked)).toHaveLength(SCAN_MAX_MANIFESTS);
    for (const c of model.candidates) expect(c.disabled).toBe(!c.checked);
  });

  it('checks at most SCAN_MAX_MANIFESTS paths when more are selected', () => {
    const all = paths(SCAN_MAX_MANIFESTS + 3);
    const model = buildPickerModel(all, all, REPO);
    expect(model.candidates.filter((c) => c.checked)).toHaveLength(SCAN_MAX_MANIFESTS);
  });

  it('disables nothing below the limit', () => {
    const all = paths(SCAN_MAX_MANIFESTS + 3);
    const model = buildPickerModel(all, all.slice(0, SCAN_MAX_MANIFESTS - 1), REPO);
    expect(model.candidates.some((c) => c.disabled)).toBe(false);
  });

  it('lists a repeated path once', () => {
    const model = buildPickerModel(['a/package.json', 'a/package.json'], [], REPO);
    expect(model.candidates).toHaveLength(1);
  });

  it('gives no checkboxes and no URL for an empty candidate list', () => {
    const model = buildPickerModel([], [], REPO);
    expect(model.candidates).toEqual([]);
    expect(model.scanUrl).toBeNull();
  });
});
