import { describe, expect, it } from 'vitest';
import {
  DISCOVERY_MANIFEST_NAMES,
  DISCOVERY_MAX_DEPTH,
  DISCOVERY_MAX_MANIFESTS,
  DISCOVERY_SKIP_DIRS,
} from '../../../pipeline/constants';
import { discoverManifests } from '../../../pipeline/mapping/discovery';
import type { DiscoveryLimits } from '../../../pipeline/mapping/types';

const limits: DiscoveryLimits = {
  maxDepth: DISCOVERY_MAX_DEPTH,
  maxManifests: DISCOVERY_MAX_MANIFESTS,
  manifestNames: DISCOVERY_MANIFEST_NAMES,
  skipDirs: DISCOVERY_SKIP_DIRS,
};

const blob = (path: string, extra: Record<string, unknown> = {}) => ({ path, type: 'blob', ...extra });

function run(tree: unknown[], truncated?: unknown) {
  const r = discoverManifests({ tree, truncated }, limits);
  if (!r.ok) throw new Error('expected ok');
  return r.value;
}

const deepPath = (depth: number, name = 'package.json') =>
  [...Array.from({ length: depth }, (_, i) => `d${i}`), name].join('/');

describe('discoverManifests', () => {
  it('finds manifests, computes depth and format, and orders by depth then path', () => {
    const v = run([
      blob('b/package.json', { size: 10 }),
      blob('Cargo.toml', { size: 5 }),
      blob('a/requirements.txt'),
      blob('README.md'),
      { path: 'a', type: 'tree' },
    ]);
    expect(v.candidates).toEqual([
      { path: 'Cargo.toml', format: 'Cargo.toml', depth: 0, sizeBytes: 5 },
      { path: 'a/requirements.txt', format: 'requirements.txt', depth: 1, sizeBytes: null },
      { path: 'b/package.json', format: 'package.json', depth: 1, sizeBytes: 10 },
    ]);
    expect(v.truncatedTree).toBe(false);
    expect(v.depthLimited).toBe(false);
    expect(v.countLimited).toBe(false);
  });

  it('lists a root and a nested pyproject.toml with format pyproject.toml (R9.2)', () => {
    const v = run([blob('a/b/pyproject.toml', { size: 7 }), blob('pyproject.toml', { size: 3 })]);
    expect(v.candidates).toEqual([
      { path: 'pyproject.toml', format: 'pyproject.toml', depth: 0, sizeBytes: 3 },
      { path: 'a/b/pyproject.toml', format: 'pyproject.toml', depth: 2, sizeBytes: 7 },
    ]);
  });

  it('does not list a pyproject.toml under node_modules (R9.2)', () => {
    const v = run([blob('node_modules/pyproject.toml'), blob('a/node_modules/b/pyproject.toml')]);
    expect(v.candidates).toEqual([]);
    expect(v.depthLimited).toBe(false);
  });

  it('skips manifests under skip directories without marking them limited', () => {
    const v = run([
      ...DISCOVERY_SKIP_DIRS.map((d) => blob(`${d}/package.json`)),
      blob(`${deepPath(DISCOVERY_MAX_DEPTH + 3).replace('d0', 'node_modules')}`),
      blob('a/node_modules/b/Cargo.toml'),
    ]);
    expect(v.candidates).toEqual([]);
    expect(v.depthLimited).toBe(false);
    expect(v.countLimited).toBe(false);
  });

  it('keeps a manifest at depth DISCOVERY_MAX_DEPTH and limits one at + 1', () => {
    const at = run([blob(deepPath(DISCOVERY_MAX_DEPTH))]);
    expect(at.candidates).toHaveLength(1);
    expect(at.candidates[0]?.depth).toBe(DISCOVERY_MAX_DEPTH);
    expect(at.depthLimited).toBe(false);

    const over = run([blob(deepPath(DISCOVERY_MAX_DEPTH + 1))]);
    expect(over.candidates).toEqual([]);
    expect(over.depthLimited).toBe(true);
  });

  it('keeps DISCOVERY_MAX_MANIFESTS candidates without limiting and limits at + 1', () => {
    const make = (n: number) => Array.from({ length: n }, (_, i) => blob(`p${String(i).padStart(3, '0')}/package.json`));
    const at = run(make(DISCOVERY_MAX_MANIFESTS));
    expect(at.candidates).toHaveLength(DISCOVERY_MAX_MANIFESTS);
    expect(at.countLimited).toBe(false);

    const over = run(make(DISCOVERY_MAX_MANIFESTS + 1));
    expect(over.candidates).toHaveLength(DISCOVERY_MAX_MANIFESTS);
    expect(over.countLimited).toBe(true);
    expect(over.candidates[0]?.path).toBe('p000/package.json');
  });

  it('reports truncatedTree only when truncated is exactly true', () => {
    expect(run([], true).truncatedTree).toBe(true);
    expect(run([], false).truncatedTree).toBe(false);
    expect(run([], 'true').truncatedTree).toBe(false);
    expect(run([]).truncatedTree).toBe(false);
  });

  it('ignores entries with non-string or empty path or non-blob / non-string type', () => {
    const v = run([
      { path: 1, type: 'blob' },
      { path: null, type: 'blob' },
      { path: '', type: 'blob' },
      { path: 'package.json', type: 1 },
      { path: 'package.json', type: 'tree' },
      { path: 'package.json' },
      null,
      7,
      'package.json',
      [],
      blob('ok/package.json'),
    ]);
    expect(v.candidates.map((c) => c.path)).toEqual(['ok/package.json']);
  });

  it('gives sizeBytes null for non-integer, negative or non-number sizes', () => {
    const sizes: unknown[] = [1.5, -1, '3', NaN, Infinity, null, undefined];
    for (const size of sizes) {
      expect(run([blob('package.json', { size })]).candidates[0]?.sizeBytes).toBeNull();
    }
    expect(run([blob('package.json', { size: 0 })]).candidates[0]?.sizeBytes).toBe(0);
  });

  it('orders duplicate paths independently of entry order', () => {
    const a = blob('package.json', { size: 9 });
    const b = blob('package.json');
    const c = blob('package.json', { size: 2 });
    expect(run([a, b, c]).candidates).toEqual(run([c, b, a]).candidates);
    expect(run([a, b, c]).candidates.map((x) => x.sizeBytes)).toEqual([null, 2, 9]);
  });

  it('returns invalid-tree for bodies without a tree array', () => {
    const bodies: unknown[] = [null, undefined, 1, 'x', [], {}, { tree: null }, { tree: {} }, { tree: 'x' }, [{ tree: [] }]];
    for (const body of bodies) {
      const r = discoverManifests(body, limits);
      expect(r).toEqual({ ok: false, error: 'invalid-tree' });
    }
  });

  it('does not throw on hostile bodies', () => {
    const hostile = new Proxy({}, {
      get() {
        throw new Error('boom');
      },
      getOwnPropertyDescriptor() {
        throw new Error('boom');
      },
    });
    expect(() => discoverManifests(hostile, limits)).not.toThrow();
    expect(() => discoverManifests({ tree: [hostile] }, limits)).not.toThrow();
  });
});
