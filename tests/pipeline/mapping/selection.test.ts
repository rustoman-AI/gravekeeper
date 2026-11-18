import { describe, expect, it } from 'vitest';
import { DISCOVERY_MANIFEST_NAMES, SCAN_MAX_MANIFESTS } from '../../../pipeline/constants';
import { selectManifests } from '../../../pipeline/mapping/selection';
import type { ManifestCandidate, SelectionLimits } from '../../../pipeline/mapping/types';

const limits: SelectionLimits = {
  maxManifests: SCAN_MAX_MANIFESTS,
  manifestNames: DISCOVERY_MANIFEST_NAMES,
};

const cand = (path: string): ManifestCandidate => ({
  path,
  format: 'package-json' as ManifestCandidate['format'],
  depth: path.split('/').length - 1,
  sizeBytes: null,
});

function run(candidates: string[], requested: string[], tree: string[] = candidates) {
  return selectManifests(candidates.map(cand), requested, new Set(tree), limits);
}

describe('selectManifests', () => {
  it('selects root manifests by default in code point order, ignoring nested ones', () => {
    const r = run(['sub/package.json', 'requirements.txt', 'package.json', 'Cargo.toml'], []);
    expect(r).toEqual({
      ok: true,
      value: { selected: ['Cargo.toml', 'package.json', 'requirements.txt'], noRootManifest: false },
    });
  });

  it('has no cap on default root manifests', () => {
    const r = run(['package.json', 'requirements.txt', 'Cargo.toml'], []);
    expect(r.ok && r.value.selected.length).toBe(3);
  });

  it('reports noRootManifest when only nested candidates exist', () => {
    const r = run(['a/package.json'], []);
    expect(r).toEqual({ ok: true, value: { selected: [], noRootManifest: true } });
  });

  it('does not report noRootManifest when there are no candidates', () => {
    const r = run([], []);
    expect(r).toEqual({ ok: true, value: { selected: [], noRootManifest: false } });
  });

  it('removes exact duplicates keeping first occurrence order', () => {
    const r = run([], ['b/package.json', 'a/package.json', 'b/package.json'], [
      'a/package.json',
      'b/package.json',
    ]);
    expect(r).toEqual({
      ok: true,
      value: { selected: ['b/package.json', 'a/package.json'], noRootManifest: false },
    });
  });

  it('keeps case-different paths distinct', () => {
    const r = run([], ['a/package.json', 'A/package.json'], ['a/package.json', 'A/package.json']);
    expect(r.ok && r.value.selected).toEqual(['a/package.json', 'A/package.json']);
  });

  const paths = (n: number) => Array.from({ length: n }, (_, i) => `d${i}/package.json`);

  it('accepts exactly SCAN_MAX_MANIFESTS distinct paths', () => {
    const p = paths(SCAN_MAX_MANIFESTS);
    const r = run([], p, p);
    expect(r.ok && r.value.selected).toEqual(p);
  });

  it('rejects SCAN_MAX_MANIFESTS + 1 distinct paths', () => {
    const p = paths(SCAN_MAX_MANIFESTS + 1);
    expect(run([], p, p)).toEqual({
      ok: false,
      error: { code: 'too-many-manifests', details: { limit: SCAN_MAX_MANIFESTS } },
    });
  });

  it('counts distinct paths, so duplicates do not trigger the cap', () => {
    const p = paths(SCAN_MAX_MANIFESTS);
    const r = run([], [...p, p[0]], p);
    expect(r.ok).toBe(true);
  });

  it('checks the count before existence', () => {
    const r = run([], paths(SCAN_MAX_MANIFESTS + 1), []);
    expect(!r.ok && r.error.code).toBe('too-many-manifests');
  });

  it('rejects a path missing from the tree', () => {
    expect(run([], ['x/package.json'], [])).toEqual({
      ok: false,
      error: { code: 'manifest-not-found', details: { path: 'x/package.json' } },
    });
  });

  it('rejects a wrong-case path and a wrong last segment', () => {
    const tree = ['Package.json', 'a/package.json.bak', 'a/package.json'];
    const caseR = run([], ['Package.json'], tree);
    expect(!caseR.ok && caseR.error).toEqual({
      code: 'manifest-not-found',
      details: { path: 'Package.json' },
    });
    const segR = run([], ['a/package.json.bak'], tree);
    expect(!segR.ok && segR.error.code).toBe('manifest-not-found');
  });

  it('accepts a listed path inside node_modules', () => {
    const p = 'node_modules/foo/package.json';
    const r = run([], [p], [p]);
    expect(r).toEqual({ ok: true, value: { selected: [p], noRootManifest: false } });
  });
});
