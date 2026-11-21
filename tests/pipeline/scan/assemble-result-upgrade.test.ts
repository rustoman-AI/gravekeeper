// resurrect-upgrade Requirements 4.7, 5.1
import { describe, expect, it } from 'vitest';
import type { Dependency } from '../../../core';
import type { RawTargetInputs } from '../../../pipeline/mapping';
import { assembleResult } from '../../../pipeline/scan/assemble-result';
import type { AssemblyManifest } from '../../../pipeline/scan/assemble-result';
import { planLookupTargets, targetKey } from '../../../pipeline/scan/targets';
import type { ScanRepo } from '../../../pipeline/scan/types';

const REPO: ScanRepo = {
  host: 'github.com',
  owner: 'o',
  repo: 'r',
  branch: 'main',
  defaultBranch: 'main',
  commitSha: 'abc',
};

function dep(name: string, scope: Dependency['scope'] = 'runtime'): Dependency {
  return { name, rawName: name, ecosystem: 'npm', versionSpec: '1.0.0', scope, sourceKind: 'registry' };
}

function version(v: string, over: Record<string, unknown> = {}) {
  return { versionKey: { version: v }, publishedAt: '2024-01-01T00:00:00Z', isDefault: false, isDeprecated: false, ...over };
}

function rawFor(name: string, body: unknown): RawTargetInputs {
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

function run(manifests: AssemblyManifest[], raw: Map<string, RawTargetInputs>) {
  const all = manifests.flatMap((m) => m.dependencies);
  return assembleResult({
    repo: REPO,
    discovery: { candidates: [], truncatedTree: false, depthLimited: false, countLimited: false },
    manifests,
    plan: planLookupTargets(all, 100),
    raw,
    stageNotes: [],
    asOf: '2025-01-01T00:00:00Z',
    ledger: [],
    deadlineReached: false,
  });
}

const deprecatedBody = {
  versions: [version('1.0.0', { isDeprecated: true }), version('2.0.0', { isDefault: true })],
};
const healthyBody = { versions: [version('1.0.0', { isDefault: true })] };

describe('assembleResult upgrade', () => {
  it('gives every dependency of one target an equal upgrade', () => {
    const manifests: AssemblyManifest[] = [
      { path: 'a/package.json', format: 'package.json', warnings: [], dependencies: [dep('x')] },
      { path: 'b/package.json', format: 'package.json', warnings: [], dependencies: [dep('x', 'dev')] },
    ];
    const result = run(manifests, new Map([[targetKey('npm', 'x'), rawFor('x', deprecatedBody)]]));
    expect(result.dependencies).toHaveLength(2);
    for (const d of result.dependencies) {
      expect(d.upgrade).toEqual({ version: '2.0.0', basis: 'registry-default' });
    }
  });

  it('omits the key when there is no upgrade, and for unlooked dependencies', () => {
    const git: Dependency = { ...dep('g'), sourceKind: 'git' };
    const manifests: AssemblyManifest[] = [
      { path: 'package.json', format: 'package.json', warnings: [], dependencies: [dep('h'), git] },
    ];
    const result = run(manifests, new Map([[targetKey('npm', 'h'), rawFor('h', healthyBody)]]));
    for (const d of result.dependencies) expect('upgrade' in d).toBe(false);
  });
});
