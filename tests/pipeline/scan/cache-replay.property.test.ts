// Requirements 19.16, 19.21
// Property 62: a cached scan repeats the result without upstream traffic.
// Property 68: a cache hit equals a fresh scan, for every request spelling.
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MemoryCacheStore } from '../../../adapters/cache/memory-cache-store';
import type { SourceResult } from '../../../pipeline/ports';
import { runScan } from '../../../pipeline/scan/run-scan';
import type { ScanProgressHandle } from '../../../pipeline/scan/run-scan';
import { createScanCache } from '../../../pipeline/scan/scan-cache';
import type { ScanDeps, ScanResult } from '../../../pipeline/scan/types';
import { parseRepoUrl } from '../../../pipeline/url/parse-repo-url';
import type { RepoRef } from '../../../pipeline/url/parse-repo-url';
import { cfg } from '../../support/fc-config';
import { createFakeRuntime, runUntilSettled } from '../../support/fake-runtime';
const START_MS = 1_000_000;
const SHA_1 = 'a'.repeat(40);
const DEADLINE_MS = 5_000;
const DEFAULT_REPO: RepoRef = { host: 'github.com', owner: 'owner', repo: 'repo', branch: null };

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
  scan(world: World, asOf?: string, progress?: ScanProgressHandle, repo?: RepoRef): Promise<ScanResult>;
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
    async scan(world, asOf = '2024-01-11T00:00:00.000Z', progress, repo = DEFAULT_REPO) {
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
            repo,
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
const FIRST_AS_OF = '2024-01-11T00:00:00.000Z';
const SECOND_AS_OF = '2024-02-01T00:00:00.000Z';

const arbCase = (word: string): fc.Arbitrary<string> =>
  fc
    .array(fc.boolean(), { minLength: word.length, maxLength: word.length })
    .map((flags) => [...word].map((ch, i) => (flags[i] === true ? ch.toUpperCase() : ch.toLowerCase())).join(''));

/** A spelling variant of github.com/Owner/Repo that parseRepoUrl accepts. */
const arbSpelling: fc.Arbitrary<RepoRef> = fc
  .record({
    scheme: fc.constantFrom('', 'http://', 'https://', 'HTTPS://'),
    www: fc.boolean(),
    hostUpper: fc.boolean(),
    owner: arbCase('Owner'),
    repo: arbCase('Repo'),
    git: fc.boolean(),
    slash: fc.boolean(),
    branch: fc.constantFrom(null, 'main'),
    pad: fc.constantFrom('', ' '),
  })
  .map((v) => {
    const host = (v.www ? 'www.' : '') + (v.hostUpper ? 'GitHub.com' : 'github.com');
    const tree = v.branch === null ? '' : '/tree/' + v.branch;
    const url = v.pad + v.scheme + host + '/' + v.owner + '/' + v.repo + (v.git ? '.git' : '') + tree + (v.slash ? '/' : '') + v.pad;
    const parsed = parseRepoUrl(url, 'github.com');
    if (!parsed.ok) throw new Error('generator produced an unaccepted spelling: ' + url);
    return parsed.value;
  });

describe('Scan_Cache hit properties', () => {
  it('Property 62: A cached scan repeats the result without upstream traffic', async () => {
    await fc.assert(
      fc.asyncProperty(arbSpelling, arbSpelling, fc.constantFrom('npm', 'cargo'), async (first, second, kind) => {
        const harness = createHarness();
        const w1 = createWorld({ token: true, kind });
        const r1 = await harness.scan(w1, FIRST_AS_OF, undefined, first);
        expect(Object.values(r1.sources)).toEqual(Array(6).fill('ok'));
        expect(harness.store.size()).toBe(1);

        const w2 = createWorld({ token: true, kind });
        const r2 = await harness.scan(w2, SECOND_AS_OF, undefined, second);
        expect(w2.calls).toEqual(DISCOVERY_CALLS);
        expect(r2).toEqual(r1);
      }),
      cfg(),
    );
  });

  it('Property 68: A cache hit equals a fresh scan, for every request spelling', async () => {
    await fc.assert(
      fc.asyncProperty(arbSpelling, arbSpelling, async (first, second) => {
        const harness = createHarness();
        await harness.scan(createWorld({ token: true, kind: 'npm' }), FIRST_AS_OF, undefined, first);

        const hitWorld = createWorld({ token: true, kind: 'npm' });
        const hit = await harness.scan(hitWorld, SECOND_AS_OF, undefined, second);
        expect(hitWorld.calls).toEqual(DISCOVERY_CALLS);

        const fresh = await createHarness().scan(createWorld({ token: true, kind: 'npm' }), FIRST_AS_OF, undefined, second);
        expect(hit).toEqual(fresh);
        expect(hit.asOf).toBe(FIRST_AS_OF);
        expect(hit.repo.owner).toBe('Owner');
        expect(hit.repo.repo).toBe('Repo');
      }),
      cfg(),
    );
  });
});
