// pyproject spec task 4.10: scripted scan of a repository with pyproject.toml and requirements.txt
// (Requirements 10.3, 10.4, 10.5, 10.6, 10.7, 10.8). Scripted sources, as in run-scan-cases.test.ts.
import { describe, expect, it } from 'vitest';
import { parseManifest } from '../../../core';
import { CACHE_KEY_VERSION } from '../../../pipeline/constants';
import type { IsoInstant } from '../../../pipeline/mapping';
import type { SourceResult } from '../../../pipeline/ports';
import { canonicalJson } from '../../../pipeline/ports/request-key';
import { createScanProgress, runScan } from '../../../pipeline/scan/run-scan';
import type { ScanDeps, ScanInput, ScanResult } from '../../../pipeline/scan/types';
import { createFakeRuntime } from '../../support/fake-runtime';
import type { FakeRuntime } from '../../support/fake-runtime';

const SHA = 'a'.repeat(40);
const AS_OF = '2024-06-01T00:00:00.000Z' as IsoInstant;
const START_MS = Date.parse(AS_OF);

const ok = (body: unknown): SourceResult =>
  ({ kind: 'ok', status: 200, body, headers: {}, fromCache: false }) as SourceResult;
const absent: SourceResult = { kind: 'absent', headers: {}, fromCache: false };
const failed: SourceResult = { kind: 'failed', reason: 'http-error', status: 500, headers: null };

// requests: PEP 621 runtime range; also pinned in requirements.txt.
// pysocks: PEP 621 extra with no specifier (`*`).
// caretpkg: Poetry caret. barepkg: bare Poetry version. gitpkg: git entry.
// The "not a requirement !!" entry gives a parser warning.
const PYPROJECT_TOML = [
  '[project]',
  'name = "demo"',
  'dependencies = [',
  '  "requests>=2.0",',
  '  "gitpkg @ git+https://github.com/o/gitpkg.git",',
  '  "not a requirement !!",',
  ']',
  '',
  '[project.optional-dependencies]',
  'socks = ["pysocks"]',
  '',
  '[tool.poetry.dependencies]',
  'caretpkg = "^1.2.0"',
  'barepkg = "1.2.3"',
  '',
].join('\n');
const REQUIREMENTS_TXT = 'requests==2.30.0\n';

const VERSIONS: Readonly<Record<string, { versions: string[]; def: string }>> = {
  requests: { versions: ['2.29.0', '2.30.0', '2.31.0'], def: '2.31.0' },
  pysocks: { versions: ['1.7.0', '1.7.1'], def: '1.7.1' },
  caretpkg: { versions: ['1.2.0', '1.9.0', '2.0.0'], def: '2.0.0' },
  barepkg: { versions: ['1.2.3', '2.0.0'], def: '2.0.0' },
};

const packageDoc = (name: string) => {
  const entry = VERSIONS[name];
  if (entry === undefined) return null;
  return {
    versions: entry.versions.map((version) => ({
      versionKey: { version },
      publishedAt: '2020-01-01T00:00:00Z',
      isDefault: version === entry.def,
      isDeprecated: false,
    })),
  };
};

const FILES: Readonly<Record<string, string>> = {
  'pyproject.toml': PYPROJECT_TOML,
  'requirements.txt': REQUIREMENTS_TXT,
};

/** Package names asked of deps.dev, one entry per request. Reset by `scan`. */
let packageRequests: string[] = [];

function buildSources(): ScanDeps['sources'] {
  const github: ScanDeps['sources']['github'] = {
    hasToken: () => false,
    getRepository: () =>
      Promise.resolve(ok({ full_name: 'o/r', default_branch: 'main', private: false })),
    getBranch: () => Promise.resolve(ok({ commit: { sha: SHA } })),
    getTree: () =>
      Promise.resolve(
        ok({
          truncated: false,
          tree: Object.keys(FILES).map((path) => ({
            path,
            type: 'blob',
            size: 10,
            sha: 'f'.repeat(40),
          })),
        }),
      ),
    getManifestText: (_ref, _sha, path) =>
      Promise.resolve({
        kind: 'ok',
        status: 200,
        body: FILES[path] ?? '',
        headers: {},
        fromCache: false,
      } as SourceResult<string>),
    queryRepositories: () => Promise.resolve(ok({ data: {} })),
  };
  return {
    github,
    depsdev: {
      getPackage: (_system, name) => {
        packageRequests.push(name);
        const doc = packageDoc(name);
        return Promise.resolve(doc === null ? absent : ok(doc));
      },
      getVersion: () => Promise.resolve(failed),
      getVersionBatch: (requests) =>
        Promise.resolve(
          ok({
            responses: requests.map((r) => ({
              request: { versionKey: { system: 'PYPI', name: r.name, version: r.version } },
              version: {},
            })),
          }),
        ),
      getAdvisory: () => Promise.resolve(absent),
    },
    osv: {
      queryBatch: (queries) => Promise.resolve(ok({ results: queries.map(() => ({})) })),
      getVulnerability: () => Promise.resolve(absent),
    },
    npm: { getVersion: () => Promise.resolve(absent), getLatest: () => Promise.resolve(absent) } as ScanDeps['sources']['npm'],
    cratesio: { getOwners: () => Promise.resolve(absent) } as ScanDeps['sources']['cratesio'],
    pypi: { getProject: () => Promise.resolve(absent) },
  };
}

function makeDeps(runtime: FakeRuntime, keys: string[]): ScanDeps {
  return {
    sources: buildSources(),
    clock: runtime.clock,
    timer: runtime.timer,
    random: runtime.random,
    logger: { log: () => undefined },
    scanCache: {
      get: (key) => {
        keys.push(key);
        return Promise.resolve(null);
      },
      set: () => Promise.resolve(),
    },
    config: {
      apiUrl: 'https://api.github.com',
      graphqlUrl: 'https://api.github.com/graphql',
      webHost: 'github.com',
    },
    limits: { maxManifests: 10, maxDependencies: 300, maxAdvisoryDetails: 500 },
    progress: createScanProgress(),
  };
}

async function scan(): Promise<{ result: ScanResult; keys: string[] }> {
  const runtime = createFakeRuntime(START_MS);
  const keys: string[] = [];
  packageRequests = [];
  const input: ScanInput = {
    repo: { host: 'github.com', owner: 'o', repo: 'r', branch: null },
    manifests: [],
    asOf: AS_OF,
    startedAtMs: runtime.clock(),
  };
  const outcome = await runScan(input, makeDeps(runtime, keys));
  if (!outcome.ok) throw new Error(`scan failed: ${outcome.error.code}`);
  return { result: outcome.value.result, keys };
}

const named = (result: ScanResult, name: string) =>
  result.dependencies.filter((d) => d.dependency.name === name);

describe('pyproject scripted scan (Requirements 10.3 to 10.8)', () => {
  it('reads both manifests', async () => {
    const { result } = await scan();
    expect(result.manifests.map((m) => [m.path, m.format])).toEqual([
      ['pyproject.toml', 'pyproject.toml'],
      ['requirements.txt', 'requirements.txt'],
    ]);
  });

  it('merges the shared package into one Lookup_Target and the pin wins (10.3)', async () => {
    const { result } = await scan();
    const rows = named(result, 'requests');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.versionBasis).toBe('pinned');
      expect(row.lookupVersion).toBe('2.30.0');
    }
    expect(packageRequests.filter((n) => n === 'requests')).toHaveLength(1);
    expect(result.notes.some((n) => n.code === 'conflicting-pins')).toBe(false);
  });

  it('resolves a Poetry caret range (10.4)', async () => {
    const { result } = await scan();
    const rows = named(result, 'caretpkg');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.dependency.versionSpec).toBe('>=1.2.0,<2.0.0');
    expect(rows[0]?.versionBasis).toBe('resolved');
    expect(rows[0]?.lookupVersion).toBe('1.9.0');
  });

  it('treats a bare Poetry version as a pin', async () => {
    const { result } = await scan();
    expect(named(result, 'barepkg')[0]?.versionBasis).toBe('pinned');
  });

  it('gives a `*` dependency the default version and no range-unresolved note (10.5)', async () => {
    const { result } = await scan();
    const rows = named(result, 'pysocks');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.dependency.versionSpec).toBe('*');
    expect(rows[0]?.versionBasis).toBe('default');
    expect(rows[0]?.lookupVersion).toBe('1.7.1');
    expect(result.notes.filter((n) => n.code === 'range-unresolved')).toEqual([]);
  });

  it('leaves the git entry unassessed with non-registry-source (10.6)', async () => {
    const { result } = await scan();
    const rows = named(result, 'gitpkg');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.dependency.sourceKind).toBe('git');
    expect(rows[0]?.versionBasis).toBeNull();
    expect(result.summary.unassessedItems).toEqual([
      expect.objectContaining({
        name: 'gitpkg',
        sourceKind: 'git',
        unassessedReason: 'non-registry-source',
      }),
    ]);
    expect(result.assessed.find((a) => a.dependency.name === 'gitpkg')?.classification).toBeNull();
  });

  it('carries the parser warnings unchanged in manifests[].warnings (10.7)', async () => {
    const { result } = await scan();
    const expected = parseManifest(PYPROJECT_TOML, 'pyproject.toml').warnings;
    expect(expected.length).toBeGreaterThan(0);
    const entry = result.manifests.find((m) => m.path === 'pyproject.toml');
    expect(entry?.warnings).toEqual(expected);
    const reqExpected = parseManifest(REQUIREMENTS_TXT, 'requirements.txt').warnings;
    expect(result.manifests.find((m) => m.path === 'requirements.txt')?.warnings).toEqual(
      reqExpected,
    );
  });

  it('builds a scan cache key that differs from the version 2 key (10.8)', async () => {
    const { keys } = await scan();
    expect(keys).toHaveLength(1);
    const key = keys[0] as string;
    const parts = JSON.parse(key) as unknown[];
    expect(parts[0]).toBe('scan');
    expect(parts[1]).toBe(CACHE_KEY_VERSION);
    expect(parts[8]).toEqual(['pyproject.toml', 'requirements.txt']);
    const v2 = canonicalJson([parts[0], 2, ...parts.slice(2)]);
    expect(key).not.toBe(v2);
  });
});
