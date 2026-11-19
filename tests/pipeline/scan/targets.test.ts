// Requirements 16.3, 16.6, 16.7, 16.10, 13.16
import { describe, expect, it } from 'vitest';
import type { Dependency, Ecosystem, Scope, SourceKind } from '@/core';
import { SCAN_MAX_DEPENDENCIES } from '../../../pipeline/constants';
import { planLookupTargets, targetKey } from '../../../pipeline/scan/targets';

function dep(
  name: string,
  opts: {
    ecosystem?: Ecosystem;
    versionSpec?: string;
    scope?: Scope;
    sourceKind?: SourceKind;
  } = {},
): Dependency {
  return {
    name,
    rawName: name,
    ecosystem: opts.ecosystem ?? 'npm',
    versionSpec: opts.versionSpec ?? '1.0.0',
    scope: opts.scope ?? 'runtime',
    sourceKind: opts.sourceKind ?? 'registry',
  };
}

describe('planLookupTargets', () => {
  it('merges one target across scopes and manifests, keeping every versionSpec in input order', () => {
    const plan = planLookupTargets(
      [
        dep('a', { versionSpec: '^1.0.0', scope: 'runtime' }),
        dep('a', { versionSpec: '1.2.3', scope: 'dev' }),
        dep('a', { versionSpec: '^1.0.0', scope: 'runtime' }),
      ],
      SCAN_MAX_DEPENDENCIES,
    );
    expect(plan.targets).toEqual([
      { ecosystem: 'npm', name: 'a', versionSpecs: ['^1.0.0', '1.2.3', '^1.0.0'] },
    ]);
    expect(plan.capped).toEqual({ limit: SCAN_MAX_DEPENDENCIES, total: 1, skipped: [] });
  });

  it('keeps the same name in different ecosystems as separate targets', () => {
    const plan = planLookupTargets(
      [dep('x', { ecosystem: 'pypi' }), dep('x', { ecosystem: 'npm' })],
      10,
    );
    expect(plan.targets.map((t) => [t.ecosystem, t.name])).toEqual([
      ['npm', 'x'],
      ['pypi', 'x'],
    ]);
  });

  it('never looks up or counts git and path dependencies', () => {
    const plan = planLookupTargets(
      [
        dep('g', { sourceKind: 'git' }),
        dep('p', { sourceKind: 'path' }),
        dep('r', { sourceKind: 'registry' }),
      ],
      10,
    );
    expect(plan.targets.map((t) => t.name)).toEqual(['r']);
    expect(plan.capped.total).toBe(1);
    expect(plan.capped.skipped).toEqual([]);
  });

  it('does not merge a git dependency into a registry target of the same name', () => {
    const plan = planLookupTargets(
      [dep('a', { versionSpec: 'git-spec', sourceKind: 'git' }), dep('a', { versionSpec: '2.0.0' })],
      10,
    );
    expect(plan.targets).toEqual([{ ecosystem: 'npm', name: 'a', versionSpecs: ['2.0.0'] }]);
  });

  it('orders by ecosystem then name in code point order (case-sensitive)', () => {
    const plan = planLookupTargets(
      [
        dep('b', { ecosystem: 'pypi' }),
        dep('b'),
        dep('a'),
        dep('B'),
        dep('c', { ecosystem: 'cargo' }),
      ],
      10,
    );
    expect(plan.targets.map((t) => `${t.ecosystem}/${t.name}`)).toEqual([
      'cargo/c',
      'npm/B',
      'npm/a',
      'npm/b',
      'pypi/b',
    ]);
  });

  describe('cap', () => {
    const many = (n: number): Dependency[] =>
      Array.from({ length: n }, (_, i) => dep(`pkg-${String(i).padStart(4, '0')}`));

    it('has no skipped targets at exactly SCAN_MAX_DEPENDENCIES', () => {
      const plan = planLookupTargets(many(SCAN_MAX_DEPENDENCIES), SCAN_MAX_DEPENDENCIES);
      expect(plan.targets).toHaveLength(SCAN_MAX_DEPENDENCIES);
      expect(plan.capped).toEqual({
        limit: SCAN_MAX_DEPENDENCIES,
        total: SCAN_MAX_DEPENDENCIES,
        skipped: [],
      });
    });

    it('skips exactly one target at SCAN_MAX_DEPENDENCIES + 1, and it sorts last', () => {
      const plan = planLookupTargets(many(SCAN_MAX_DEPENDENCIES + 1).reverse(), SCAN_MAX_DEPENDENCIES);
      expect(plan.targets).toHaveLength(SCAN_MAX_DEPENDENCIES);
      expect(plan.capped.limit).toBe(SCAN_MAX_DEPENDENCIES);
      expect(plan.capped.total).toBe(SCAN_MAX_DEPENDENCIES + 1);
      expect(plan.capped.skipped).toEqual([
        { ecosystem: 'npm', name: `pkg-${String(SCAN_MAX_DEPENDENCIES).padStart(4, '0')}` },
      ]);
    });

    it('sorts skipped targets after every looked-up one and keeps total = looked-up + skipped', () => {
      const deps = [
        dep('d'),
        dep('a', { ecosystem: 'pypi' }),
        dep('b'),
        dep('c', { ecosystem: 'cargo' }),
        dep('a'),
      ];
      const plan = planLookupTargets(deps, 2);
      expect(plan.targets.map((t) => `${t.ecosystem}/${t.name}`)).toEqual(['cargo/c', 'npm/a']);
      expect(plan.capped.skipped).toEqual([
        { ecosystem: 'npm', name: 'b' },
        { ecosystem: 'npm', name: 'd' },
        { ecosystem: 'pypi', name: 'a' },
      ]);
      expect(plan.capped.total).toBe(plan.targets.length + plan.capped.skipped.length);

      const keys = [...plan.targets, ...plan.capped.skipped].map((t) => targetKey(t.ecosystem, t.name));
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('counts a shared target once toward the cap', () => {
      const plan = planLookupTargets([dep('a'), dep('a', { scope: 'dev' }), dep('b')], 2);
      expect(plan.capped).toEqual({ limit: 2, total: 2, skipped: [] });
    });

    it('does not count git and path dependencies toward the cap', () => {
      const plan = planLookupTargets(
        [dep('a'), dep('g', { sourceKind: 'git' }), dep('p', { sourceKind: 'path' })],
        1,
      );
      expect(plan.capped).toEqual({ limit: 1, total: 1, skipped: [] });
    });

    it('handles an empty list and a zero limit', () => {
      expect(planLookupTargets([], 5)).toEqual({
        targets: [],
        capped: { limit: 5, total: 0, skipped: [] },
      });
      const plan = planLookupTargets([dep('a')], 0);
      expect(plan.targets).toEqual([]);
      expect(plan.capped.skipped).toEqual([{ ecosystem: 'npm', name: 'a' }]);
    });
  });
});

describe('targetKey', () => {
  it('separates ecosystem and name unambiguously', () => {
    expect(targetKey('npm', 'a')).not.toBe(targetKey('pypi', 'a'));
    expect(targetKey('npm', 'a')).toBe(targetKey('npm', 'a'));
  });
});
