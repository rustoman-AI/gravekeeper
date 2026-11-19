// Requirements 13.16, 16.12, 17.7, 18.1, 18.8, 18.9, 18.12
import { describe, expect, it } from 'vitest';
import { classify, summarize } from '../../../core';
import type { Dependency } from '../../../core';
import type { RawTargetInputs } from '../../../pipeline/mapping';
import {
  assemblePartial,
  assembleResult,
} from '../../../pipeline/scan/assemble-result';
import type {
  AssembleInput,
  AssemblyManifest,
  AssemblySnapshot,
} from '../../../pipeline/scan/assemble-result';
import {
  batchFallbackNote,
  noManifestsNote,
  scanDeadlineReachedNote,
  treeTruncatedNote,
} from '../../../pipeline/scan/notes';
import { planLookupTargets, targetKey } from '../../../pipeline/scan/targets';
import type { LedgerEntry, ScanRepo } from '../../../pipeline/scan/types';

const AS_OF = '2025-01-01T00:00:00Z';

const REPO: ScanRepo = {
  host: 'github.com',
  owner: 'o',
  repo: 'r',
  branch: 'main',
  defaultBranch: 'main',
  commitSha: 'abc',
};

const DISCOVERY = {
  candidates: [],
  truncatedTree: false,
  depthLimited: false,
  countLimited: false,
};

function dep(name: string, over: Partial<Dependency> = {}): Dependency {
  return {
    name,
    rawName: name,
    ecosystem: 'npm',
    versionSpec: '^1.0.0',
    scope: 'runtime',
    sourceKind: 'registry',
    ...over,
  };
}

function manifest(path: string, dependencies: Dependency[]): AssemblyManifest {
  return { path, format: 'package.json', warnings: [], dependencies };
}

/** A deps.dev package document with a default version 1.0.0 released a year before AS_OF. */
function rawFor(name: string, body: unknown = packageBody()): RawTargetInputs {
  return {
    ecosystem: 'npm',
    name,
    versionSpecs: [],
    depsdevPackage: { state: 'ok', body },
    npmLatest: { state: 'unavailable' },
    maintainers: { state: 'unavailable' },
    osv: { queryResult: 'unavailable', advisories: new Map(), unfetchedIds: [] },
    repository: 'no-source-repo',
    webHost: 'github.com',
  };
}

function packageBody(): unknown {
  return {
    versions: [
      {
        versionKey: { version: '1.0.0' },
        isDefault: true,
        publishedAt: '2024-01-01T00:00:00Z',
        isDeprecated: false,
      },
    ],
  };
}

function snapshot(
  manifests: AssemblyManifest[],
  raw: Map<string, RawTargetInputs>,
  limit = 100,
  stageNotes: AssemblySnapshot['stageNotes'] = [],
): AssemblySnapshot {
  const all = manifests.flatMap((m) => m.dependencies);
  return {
    repo: REPO,
    discovery: DISCOVERY,
    manifests,
    plan: planLookupTargets(all, limit),
    raw,
    stageNotes,
  };
}

function input(snap: AssemblySnapshot, over: Partial<AssembleInput> = {}): AssembleInput {
  return { ...snap, asOf: AS_OF, ledger: [], deadlineReached: false, ...over };
}

const key = (name: string) => targetKey('npm', name);

describe('assembleResult', () => {
  it('keeps dependencies and assessed the same length, one entry per dependency', () => {
    const m1 = manifest('b/package.json', [dep('a'), dep('b', { scope: 'dev' })]);
    const m2 = manifest('a/package.json', [dep('a'), dep('g', { sourceKind: 'git' })]);
    const raw = new Map([[key('a'), rawFor('a')], [key('b'), rawFor('b')]]);
    const result = assembleResult(input(snapshot([m1, m2], raw)));
    expect(result.dependencies).toHaveLength(4);
    expect(result.assessed).toHaveLength(4);
    expect(result.dependencies.map((d) => d.dependency)).toEqual(
      result.assessed.map((a) => a.dependency),
    );
    // manifests ordered by path
    expect(result.manifests.map((m) => m.path)).toEqual(['a/package.json', 'b/package.json']);
    expect(result.dependencies.map((d) => d.manifestPath)).toEqual([
      'a/package.json',
      'a/package.json',
      'b/package.json',
      'b/package.json',
    ]);
    expect(result.repo).toEqual(REPO);
    expect(result.asOf).toBe(AS_OF);
  });

  it('gives equal facts and classifications to dependencies sharing a target', () => {
    const m1 = manifest('package.json', [dep('a'), dep('a', { scope: 'dev' })]);
    const m2 = manifest('sub/package.json', [dep('a', { scope: 'peer' })]);
    const result = assembleResult(input(snapshot([m1, m2], new Map([[key('a'), rawFor('a')]]))));
    const [first, ...rest] = result.dependencies;
    expect(first?.facts.daysSinceLastRelease).toBe(366);
    for (const other of rest) expect(other.facts).toEqual(first?.facts);
    const [c0, ...cs] = result.assessed.map((a) => a.classification);
    expect(c0).not.toBeNull();
    for (const c of cs) expect(c).toEqual(c0);
  });

  it('leaves git, path and skipped registry dependencies unassessed with all-null facts', () => {
    const m = manifest('package.json', [
      dep('a'),
      dep('b'),
      dep('g', { sourceKind: 'git' }),
      dep('p', { sourceKind: 'path' }),
    ]);
    const raw = new Map([[key('a'), rawFor('a')], [key('b'), rawFor('b')]]);
    const result = assembleResult(input(snapshot([m], raw, 1)));
    expect(result.capped.skipped).toEqual([{ ecosystem: 'npm', name: 'b' }]);
    const byName = new Map(result.dependencies.map((d, i) => [d.dependency.name, i]));
    for (const name of ['b', 'g', 'p']) {
      const i = byName.get(name) as number;
      expect(result.assessed[i]?.classification).toBeNull();
      expect(result.dependencies[i]).toMatchObject({ lookupVersion: null, versionBasis: null });
      expect(Object.values(result.dependencies[i]?.facts ?? {})).toHaveLength(7);
      expect(Object.values(result.dependencies[i]?.facts ?? {}).every((v) => v === null)).toBe(
        true,
      );
    }
    expect(result.assessed[byName.get('a') as number]?.classification).not.toBeNull();
  });

  it('adds dependency-cap-exceeded only when targets were skipped', () => {
    const m = manifest('package.json', [dep('a'), dep('b')]);
    const capped = assembleResult(input(snapshot([m], new Map(), 1)));
    expect(capped.notes.filter((n) => n.code === 'dependency-cap-exceeded')).toHaveLength(1);
    expect(capped.capped).toEqual({ limit: 1, total: 2, skipped: [{ ecosystem: 'npm', name: 'b' }] });
    const uncapped = assembleResult(input(snapshot([m], new Map(), 5)));
    expect(uncapped.notes.some((n) => n.code === 'dependency-cap-exceeded')).toBe(false);
    expect(uncapped.capped.skipped).toEqual([]);
  });

  it('sets lookupVersion and versionBasis together (pinned, resolved, default, or both null)', () => {
    const m = manifest('package.json', [
      dep('pinned', { versionSpec: '1.0.0' }),
      dep('ranged'),
      dep('dflt', { versionSpec: '' }),
      dep('missing'),
      dep('nodata'),
    ]);
    const emptyDoc = { versions: [] };
    const raw = new Map<string, RawTargetInputs>([
      [key('pinned'), rawFor('pinned')],
      [key('ranged'), rawFor('ranged')],
      [key('dflt'), rawFor('dflt')],
      [key('missing'), { ...rawFor('missing'), depsdevPackage: { state: 'absent' } }],
      [key('nodata'), rawFor('nodata', emptyDoc)],
    ]);
    const result = assembleResult(input(snapshot([m], raw)));
    const of = (name: string) => result.dependencies.find((d) => d.dependency.name === name);
    expect(of('pinned')).toMatchObject({ lookupVersion: '1.0.0', versionBasis: 'pinned' });
    expect(of('ranged')).toMatchObject({ lookupVersion: '1.0.0', versionBasis: 'resolved' });
    expect(of('dflt')).toMatchObject({ lookupVersion: '1.0.0', versionBasis: 'default' });
    expect(of('missing')).toMatchObject({ lookupVersion: null, versionBasis: null });
    expect(of('nodata')).toMatchObject({ lookupVersion: null, versionBasis: null });
    for (const d of result.dependencies) {
      expect(d.lookupVersion === null).toBe(d.versionBasis === null);
    }
    expect(result.notes.some((n) => n.code === 'package-not-found')).toBe(true);
  });

  it('assembles a target without raw inputs from unavailable inputs', () => {
    const m = manifest('package.json', [dep('a')]);
    const result = assembleResult(input(snapshot([m], new Map())));
    expect(result.dependencies[0]).toMatchObject({ lookupVersion: null, versionBasis: null });
    expect(result.dependencies[0]?.facts.daysSinceLastRelease).toBeNull();
    expect(result.assessed[0]?.classification).not.toBeNull();
  });

  it('turns the facts of a target whose assembly throws all-null and keeps the others', () => {
    const throwing: RawTargetInputs = {
      ...rawFor('bad'),
      depsdevPackage: {
        state: 'ok',
        get body(): unknown {
          throw new Error('mapper failure');
        },
      },
    };
    const m = manifest('package.json', [dep('bad'), dep('good')]);
    const raw = new Map([[key('bad'), throwing], [key('good'), rawFor('good')]]);
    const result = assembleResult(input(snapshot([m], raw)));
    const bad = result.dependencies.find((d) => d.dependency.name === 'bad');
    const good = result.dependencies.find((d) => d.dependency.name === 'good');
    expect(bad?.facts).toEqual({
      daysSinceLastRelease: null,
      daysSinceLastCommit: null,
      archived: null,
      deprecated: null,
      openVulnerabilityCount: null,
      maxSeverity: null,
      maintainerCount: null,
    });
    expect(bad).toMatchObject({ lookupVersion: null, versionBasis: null });
    expect(good?.facts.daysSinceLastRelease).toBe(366);
    expect(good?.lookupVersion).toBe('1.0.0');
    // the throwing target is still classified from its all-null facts
    expect(result.assessed.find((a) => a.dependency.name === 'bad')?.classification).toEqual(
      classify(bad?.facts),
    );
  });

  it('computes summary as summarize(assessed)', () => {
    const m = manifest('package.json', [dep('a'), dep('b'), dep('g', { sourceKind: 'git' })]);
    const raw = new Map([[key('a'), rawFor('a')], [key('b'), rawFor('b')]]);
    const result = assembleResult(input(snapshot([m], raw)));
    expect(result.summary).toEqual(summarize(result.assessed));
    expect(result.summary.total).toBe(3);
  });

  it('adds exactly one scan-deadline-reached when the deadline was reached', () => {
    const m = manifest('package.json', [dep('a')]);
    const snap = snapshot([m], new Map(), 100, [scanDeadlineReachedNote()]);
    const reached = assembleResult(input(snap, { deadlineReached: true }));
    expect(reached.notes.filter((n) => n.code === 'scan-deadline-reached')).toHaveLength(1);
    const notReached = assembleResult(input(snapshot([m], new Map()), { deadlineReached: false }));
    expect(notReached.notes.some((n) => n.code === 'scan-deadline-reached')).toBe(false);
  });

  it('sorts notes by code, then by canonical details', () => {
    const m = manifest('package.json', [dep('a'), dep('b'), dep('c')]);
    const missing = (name: string): RawTargetInputs => ({
      ...rawFor(name),
      depsdevPackage: { state: 'absent' },
    });
    const raw = new Map([
      [key('a'), missing('a')],
      [key('b'), missing('b')],
      [key('c'), missing('c')],
    ]);
    const stage = [treeTruncatedNote(), noManifestsNote(), batchFallbackNote()];
    const result = assembleResult(
      input(snapshot([m], raw, 2, stage), { deadlineReached: true }),
    );
    expect(result.notes.map((n) => n.code)).toEqual([
      'batch-fallback',
      'dependency-cap-exceeded',
      'no-manifests',
      'package-not-found',
      'package-not-found',
      'scan-deadline-reached',
      'tree-truncated',
    ]);
    const notFound = result.notes
      .filter((n) => n.code === 'package-not-found')
      .map((n) => n.details?.['name']);
    expect(notFound).toEqual(['a', 'b']);
  });

  it('reports the source statuses of the ledger', () => {
    const ledger: LedgerEntry[] = [
      { source: 'npm', unitKey: 'u1', outcome: { ok: false, reason: 'network' } },
    ];
    const m = manifest('package.json', [dep('a')]);
    const result = assembleResult(input(snapshot([m], new Map()), { ledger }));
    expect(result.sources.npm).toBe('failed');
    expect(result.notes.some((n) => n.code === 'source-failed')).toBe(true);
  });
});

describe('assemblePartial', () => {
  const m = manifest('package.json', [dep('a')]);
  const snap = snapshot([m], new Map([[key('a'), rawFor('a')]]));

  it('assembles the snapshot with the deadline note when discovery is complete', () => {
    const progress = {
      ledger: [],
      discovery: { commitSha: 'abc', selection: ['package.json'] },
      closed: false,
      snapshot: snap,
    };
    const outcome = assemblePartial(progress, { asOf: AS_OF, repo: { ...REPO, branch: 'main' } });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.notes.filter((n) => n.code === 'scan-deadline-reached')).toHaveLength(1);
    expect(outcome.value.dependencies).toHaveLength(1);
    expect(outcome.value.summary).toEqual(summarize(outcome.value.assessed));
  });

  it('returns deadline-exceeded when discovery is incomplete', () => {
    const outcome = assemblePartial(
      { ledger: [], discovery: null, closed: false, snapshot: snap },
      { asOf: AS_OF, repo: { ...REPO, branch: 'main' } },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe('deadline-exceeded');
  });

  it('returns deadline-exceeded when there is no snapshot yet', () => {
    const outcome = assemblePartial(
      { ledger: [], discovery: { commitSha: 'abc', selection: [] }, closed: false },
      { asOf: AS_OF, repo: { ...REPO, branch: 'main' } },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe('deadline-exceeded');
  });
});
