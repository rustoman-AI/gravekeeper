// Requirement 19.5, 19.6, 19.7, 19.22, 3.13 (Scan_Cache wiring in runScan)
import { describe, expect, it } from 'vitest';
import { MemoryCacheStore } from '../../../adapters/cache/memory-cache-store';
import { PARTIAL_SCAN_TTL_SECONDS, SCAN_CACHE_TTL_SECONDS } from '../../../pipeline/constants';
import type { SourceResult } from '../../../pipeline/ports';
import { createScanProgress, runScan } from '../../../pipeline/scan/run-scan';
import type { ScanProgressHandle } from '../../../pipeline/scan/run-scan';
import { createScanCache } from '../../../pipeline/scan/scan-cache';
import type { ScanDeps, ScanResult } from '../../../pipeline/scan/types';
import { createFakeRuntime, runUntilSettled } from '../../support/fake-runtime';

const START_MS = 1_000_000;
const SHA_1 = 'a'.repeat(40);
const SHA_2 = 'c'.repeat(40);
const DEADLINE_MS = 5_000;

const HEADERS = {};
const okResult = (body: unknown): SourceResult =>
  ({ kind: 'ok', status: 200, body, headers: HEADERS, fromCache: false }) as SourceResult;
const absentResult: SourceResult = { kind: 'absent', headers: HEADERS, fromCache: false };

interface WorldOptions {
  readonly token: boolean;
  /** `npm` with a Source_Repo for every package, or `cargo` with one crate and no Source_Repo. */
  readonly kind: 'npm' | 'cargo';
  /** When true the crates.io owners request never answers, so the scan deadline cuts it. */
  readonly hangOwners?: boolean;
  readonly onPackage?: () => void;
}

interface World {
  readonly sources: ScanDeps['sources'];
  /** Method names of every Source_Port call, in order. */
  readonly calls: string[];
  sha: string;
}

function createWorld(options: WorldOptions): World {
  const calls: string[] = [];
  const world: { sha: string } = { sha: SHA_1 };
  const track = (name: string): void => {
    calls.push(name);
  };
  const npm = options.kind === 'npm';
  const manifestPath = npm ? 'package.json' : 'Cargo.toml';
  const manifest = npm
    ? JSON.stringify({ dependencies: { alpha: '1.0.0' } })
    : '[package]\nname = "x"\nversion = "0.1.0"\n\n[dependencies]\nserde = "1.0"\n';

  const sources: ScanDeps['sources'] = {
    github: {
      hasToken: () => options.token,
      getRepository: () => {
        track('getRepository');
        return Promise.resolve(okResult({ full_name: 'Owner/Repo', default_branch: 'main', private: false }));
      },
      getBranch: () => {
        track('getBranch');
        return Promise.resolve(okResult({ commit: { sha: world.sha } }));
      },
      getTree: () => {
        track('getTree');
        return Promise.resolve(
          okResult({
            tree: [{ path: manifestPath, type: 'blob', size: 100, sha: 'b'.repeat(40) }],
            truncated: false,
          }),
        );
      },
      getManifestText: () => {
        track('getManifestText');
        return Promise.resolve(okResult(manifest) as SourceResult<string>);
      },
      queryRepositories: () => {
        track('queryRepositories');
        return Promise.resolve(
          okResult({
            data: {
              rateLimit: { remaining: 4000, resetAt: '2024-01-11T01:00:00.000Z' },
              r0: { nameWithOwner: 'x/y', isArchived: false, defaultBranchRef: { target: { committedDate: '2024-01-01T00:00:00Z' } } },
            },
          }),
        );
      },
    },
    depsdev: {
      getPackage: (_system, name) => {
        track('getPackage');
        options.onPackage?.();
        if (!npm) return Promise.resolve(absentResult);
        return Promise.resolve(
          okResult({
            versions: [
              {
                versionKey: { system: 'NPM', name, version: '1.0.0' },
                isDefault: true,
                isDeprecated: false,
                publishedAt: '2023-12-31T00:00:00Z',
              },
            ],
          }),
        );
      },
      getVersion: () => {
        track('getVersion');
        return Promise.resolve(okResult({ relatedProjects: [] }));
      },
      getVersionBatch: (requests) => {
        track('getVersionBatch');
        return Promise.resolve(
          okResult({
            responses: requests.map((r) => ({
              request: { versionKey: { system: r.system.toUpperCase(), name: r.name, version: r.version } },
              version: {
                relatedProjects: [{ relationType: 'SOURCE_REPO', projectKey: { id: 'github.com/acme/alpha' } }],
              },
            })),
          }),
        );
      },
      getAdvisory: () => {
        track('getAdvisory');
        return Promise.resolve(absentResult);
      },
    },
    osv: {
      queryBatch: (queries) => {
        track('queryBatch');
        return Promise.resolve(okResult({ results: queries.map(() => ({})) }));
      },
      getVulnerability: () => {
        track('getVulnerability');
        return Promise.resolve(absentResult);
      },
    },
    npm: {
      getLatest: () => {
        track('getLatest');
        return Promise.resolve(okResult({ maintainers: [{ name: 'a' }, { name: 'b' }] }));
      },
    },
    cratesio: {
      getOwners: () => {
        track('getOwners');
        if (options.hangOwners === true) return new Promise<SourceResult>(() => undefined);
        return Promise.resolve(absentResult);
      },
    },
    pypi: {
      getProject: () => {
        track('getProject');
        return Promise.resolve(absentResult);
      },
    },
  };
  return {
    sources,
    calls,
    get sha() {
      return world.sha;
    },
    set sha(value: string) {
      world.sha = value;
    },
  };
}

interface Harness {
  /** Mutable clock shared by the cache store. */
  nowMs: number;
  readonly store: MemoryCacheStore;
  readonly scanCache: ScanDeps['scanCache'];
  scan(world: World, asOf?: string, progress?: ScanProgressHandle): Promise<ScanResult>;
}

function createHarness(): Harness {
  const state = { nowMs: START_MS };
  const store = new MemoryCacheStore(() => state.nowMs);
  const scanCache = createScanCache(store);
  return {
    get nowMs() {
      return state.nowMs;
    },
    set nowMs(value: number) {
      state.nowMs = value;
    },
    store,
    scanCache,
    async scan(world, asOf = '2024-01-11T00:00:00.000Z', progress) {
      const runtime = createFakeRuntime(state.nowMs);
      const deps: ScanDeps = {
        sources: world.sources,
        clock: runtime.clock,
        timer: runtime.timer,
        random: runtime.random,
        logger: { log: () => undefined },
        scanCache,
        config: {
          apiUrl: 'https://api.github.com',
          graphqlUrl: 'https://api.github.com/graphql',
          webHost: 'github.com',
        },
        limits: { maxManifests: 10, maxDependencies: 100, maxAdvisoryDetails: 50 },
        deadlineMs: DEADLINE_MS,
        ...(progress === undefined ? {} : { progress }),
      };
      const outcome = await runUntilSettled(
        runScan(
          {
            repo: { host: 'github.com', owner: 'owner', repo: 'repo', branch: null },
            manifests: [],
            asOf: asOf as never,
            startedAtMs: runtime.clock(),
          },
          deps,
        ),
        runtime,
      );
      if (!outcome.ok) throw new Error(`scan failed: ${outcome.error.code}`);
      return outcome.value;
    },
  };
}

const DISCOVERY_CALLS = ['getRepository', 'getBranch', 'getTree'];

describe('runScan Scan_Cache wiring', () => {
  it('a hit sends only the repository, branch and tree requests and equals the first result (R19.6, R3.13)', async () => {
    const harness = createHarness();
    const first = createWorld({ token: true, kind: 'npm' });
    const firstResult = await harness.scan(first, '2024-01-11T00:00:00.000Z');
    expect(first.calls).toContain('getManifestText');
    expect(Object.values(firstResult.sources)).toEqual(Array(6).fill('ok'));
    expect(harness.store.size()).toBe(1);

    const second = createWorld({ token: true, kind: 'npm' });
    const hit = await harness.scan(second, '2024-02-01T00:00:00.000Z');
    expect(second.calls).toEqual(DISCOVERY_CALLS);
    expect(hit).toEqual(firstResult);
    expect(hit.asOf).toBe('2024-01-11T00:00:00.000Z');
  });

  it('a result with github-token-missing is not stored (R19.7)', async () => {
    const harness = createHarness();
    const first = createWorld({ token: false, kind: 'npm' });
    const result = await harness.scan(first);
    expect(result.notes.map((n) => n.code)).toContain('github-token-missing');
    expect(harness.store.size()).toBe(0);

    const second = createWorld({ token: false, kind: 'npm' });
    await harness.scan(second);
    expect(second.calls).toContain('getManifestText');
  });

  it('the entry expires after SCAN_CACHE_TTL_SECONDS (R19.5)', async () => {
    const harness = createHarness();
    await harness.scan(createWorld({ token: true, kind: 'npm' }));

    harness.nowMs = START_MS + SCAN_CACHE_TTL_SECONDS * 1000 - 1;
    const alive = createWorld({ token: true, kind: 'npm' });
    await harness.scan(alive);
    expect(alive.calls).toEqual(DISCOVERY_CALLS);

    harness.nowMs = START_MS + SCAN_CACHE_TTL_SECONDS * 1000;
    const expired = createWorld({ token: true, kind: 'npm' });
    await harness.scan(expired);
    expect(expired.calls).toContain('getManifestText');
  });

  it('a changed Commit_SHA misses (R19.6)', async () => {
    const harness = createHarness();
    await harness.scan(createWorld({ token: true, kind: 'npm' }));

    const changed = createWorld({ token: true, kind: 'npm' });
    changed.sha = SHA_2;
    const result = await harness.scan(changed);
    expect(changed.calls).toContain('getManifestText');
    expect(result.repo.commitSha).toBe(SHA_2);
    expect(harness.store.size()).toBe(2);
  });

  it('the partial result of a deadline-cut crates.io lookup is stored for PARTIAL_SCAN_TTL_SECONDS (R19.22)', async () => {
    const harness = createHarness();
    const first = createWorld({ token: true, kind: 'cargo', hangOwners: true });
    const result = await harness.scan(first);
    expect(result.sources.cratesio).toBe('partial');
    expect(Object.entries(result.sources).filter(([, s]) => s !== 'ok').map(([n]) => n)).toEqual(['cratesio']);
    expect(harness.store.size()).toBe(1);

    harness.nowMs = START_MS + PARTIAL_SCAN_TTL_SECONDS * 1000 - 1;
    const alive = createWorld({ token: true, kind: 'cargo' });
    const hit = await harness.scan(alive);
    expect(alive.calls).toEqual(DISCOVERY_CALLS);
    expect(hit).toEqual(result);

    harness.nowMs = START_MS + PARTIAL_SCAN_TTL_SECONDS * 1000;
    const expired = createWorld({ token: true, kind: 'cargo' });
    await harness.scan(expired);
    expect(expired.calls).toContain('getManifestText');
  });

  it('a result assembled after the progress handle was closed is not stored (R19.21)', async () => {
    const harness = createHarness();
    const progress = createScanProgress();
    const world = createWorld({ token: true, kind: 'npm', onPackage: () => progress.close() });
    await harness.scan(world, undefined, progress);
    expect(harness.store.size()).toBe(0);

    const next = createWorld({ token: true, kind: 'npm' });
    await harness.scan(next);
    expect(next.calls).toContain('getManifestText');
  });
});
