// Requirements 12.15
// Property 74: Crates owners are looked up in scope order and cached owners send no request.
// A Cargo.toml goes through runScan (real parser, real stage S5); crates.io is the real adapter
// behind the caching client (L1 + L2) on a scripted fetch.
import { createHash } from 'node:crypto';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MemoryCacheStore } from '../../../adapters/cache/memory-cache-store';
import { RuntimeCacheStore } from '../../../adapters/cache/runtime-cache-store';
import { TieredCacheStore } from '../../../adapters/cache/tiered-cache-store';
import { createCratesIoSource } from '../../../adapters/cratesio/cratesio-source';
import { CachingHttpClient } from '../../../adapters/http/caching-http-client';
import { createGithubAuthorizer } from '../../../adapters/http/github-authorizer';
import { createHttpClient } from '../../../adapters/http/http-client';
import type { Scope } from '../../../core';
import {
  CONCURRENCY_CRATESIO,
  CONCURRENCY_DEPSDEV,
  CONCURRENCY_GITHUB,
  CONCURRENCY_NPM,
  CONCURRENCY_OSV,
  CONCURRENCY_PYPI,
  CRATESIO_MIN_INTERVAL_MS,
  GITHUB_DEFAULT_API_URL,
  GITHUB_DEFAULT_GRAPHQL_URL,
  GITHUB_DEFAULT_WEB_HOST,
} from '../../../pipeline/constants';
import type { GithubConfig, SourceName, SourceResult } from '../../../pipeline/ports';
import { runScan } from '../../../pipeline/scan/run-scan';
import type { ScanDeps } from '../../../pipeline/scan/types';
import { createCollectingLogger, createFakeL2 } from '../../support/arbitraries/l2';
import { cfg } from '../../support/fc-config';
import { createFakeRuntime, runUntilSettled } from '../../support/fake-runtime';
import { createScriptedFetch } from '../../support/scripted-fetch';

const START = 1_000_000;
const SHA = 'a'.repeat(40);
const GH_CONFIG: GithubConfig = {
  apiUrl: GITHUB_DEFAULT_API_URL,
  graphqlUrl: GITHUB_DEFAULT_GRAPHQL_URL,
  webHost: GITHUB_DEFAULT_WEB_HOST,
};
const sha256Hex = (text: string): Promise<string> =>
  Promise.resolve(createHash('sha256').update(text).digest('hex'));
const OWNERS_BODY = JSON.stringify({ users: [{ login: 'alice', kind: 'user' }] });

/** Cargo supports these scopes; the lookup order is the SCOPE order (R12.14). */
const SCOPE_RANK: Readonly<Record<string, number>> = { runtime: 0, build: 1, dev: 2, optional: 3, peer: 4 };
const TABLE_OF: Readonly<Record<string, string>> = {
  runtime: 'dependencies',
  build: 'build-dependencies',
  dev: 'dev-dependencies',
};
const CARGO_SCOPES = ['runtime', 'build', 'dev'] as const;

interface CrateCase {
  readonly name: string;
  readonly scopes: readonly Scope[];
  readonly cached: 'none' | 'l1' | 'l2';
}

const arbName = fc.stringMatching(/^[a-z0-9]([a-z0-9-]{0,5}[a-z0-9])?$/);
const arbCrates: fc.Arbitrary<CrateCase[]> = fc.uniqueArray(
  fc.record({
    name: arbName,
    scopes: fc.subarray([...CARGO_SCOPES], { minLength: 1 }) as fc.Arbitrary<Scope[]>,
    cached: fc.constantFrom('none', 'l1', 'l2') as fc.Arbitrary<CrateCase['cached']>,
  }),
  { minLength: 1, maxLength: 7, selector: (c) => c.name },
);

const ok = (body: unknown): SourceResult =>
  ({ kind: 'ok', status: 200, body, headers: {}, fromCache: false }) as SourceResult;
const absent: SourceResult = { kind: 'absent', headers: {}, fromCache: false };

function manifestOf(crates: readonly CrateCase[]): string {
  const lines: string[] = [];
  for (const scope of CARGO_SCOPES) {
    const members = crates.filter((c) => c.scopes.includes(scope));
    if (members.length === 0) continue;
    lines.push(`[${TABLE_OF[scope]}]`, ...members.map((c) => `"${c.name}" = "1"`), '');
  }
  return lines.join('\n');
}

/** Code point order of the first scope, then name (R12.14). */
function expectedOrder(crates: readonly CrateCase[]): string[] {
  const rank = (c: CrateCase): number => Math.min(...c.scopes.map((s) => SCOPE_RANK[s] as number));
  return [...crates]
    .sort((a, b) => rank(a) - rank(b) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((c) => c.name);
}

async function runCase(crates: readonly CrateCase[]) {
  const runtime = createFakeRuntime(START);
  const scripted = createScriptedFetch((rawUrl) => {
    const url = new URL(rawUrl);
    return {
      latencyMs: 0,
      response: {
        status: 200,
        headers: [['content-type', 'application/json']],
        body: { kind: 'text', text: url.hostname === 'crates.io' ? OWNERS_BODY : '{}' },
      },
    };
  }, runtime);
  const l2 = createFakeL2(runtime);
  const { logger } = createCollectingLogger();
  const l2Store = new RuntimeCacheStore({
    getCache: l2.getCache,
    sha256Hex,
    timer: runtime.timer,
    clock: runtime.clock,
    logger,
  });
  const pending: Promise<unknown>[] = [];
  const limiters: Record<SourceName, { concurrency: number; minIntervalMs: number }> = {
    github: { concurrency: CONCURRENCY_GITHUB, minIntervalMs: 0 },
    depsdev: { concurrency: CONCURRENCY_DEPSDEV, minIntervalMs: 0 },
    osv: { concurrency: CONCURRENCY_OSV, minIntervalMs: 0 },
    npm: { concurrency: CONCURRENCY_NPM, minIntervalMs: 0 },
    cratesio: { concurrency: CONCURRENCY_CRATESIO, minIntervalMs: CRATESIO_MIN_INTERVAL_MS },
    pypi: { concurrency: CONCURRENCY_PYPI, minIntervalMs: 0 },
  };
  const http = createHttpClient({
    fetchImpl: scripted.fetch,
    clock: runtime.clock,
    timer: runtime.timer,
    random: runtime.random,
    logger: { log: (): void => undefined },
    limiters,
    authorizer: createGithubAuthorizer(() => null, GH_CONFIG),
    secrets: () => [],
    userAgent: 'gravekeeper-test',
  });
  const newStore = (): TieredCacheStore =>
    new TieredCacheStore({
      l1: new MemoryCacheStore(runtime.clock),
      l2: l2Store,
      deferrer: { defer: (p) => void pending.push(p) },
    });
  const settle = async (): Promise<void> => {
    await runUntilSettled(Promise.all(pending.splice(0)), runtime);
  };
  const cratesOf = (store: TieredCacheStore) =>
    createCratesIoSource({ http: new CachingHttpClient(http, store), userAgent: 'gravekeeper-test' });
  const cratesCalls = (): string[] =>
    scripted.calls
      .filter((c) => new URL(c.url).hostname === 'crates.io')
      .map((c) => decodeURIComponent(new URL(c.url).pathname.split('/')[4] ?? ''));

  // Warm: L1 crates through the scan's store (so L1 and L2), L2-only crates through another instance.
  const scanStore = newStore();
  const ctx = { signal: new AbortController().signal, deadlineAtMs: 0 };
  const warm = async (store: TieredCacheStore, names: readonly string[]): Promise<void> => {
    const source = cratesOf(store);
    for (const name of names) await runUntilSettled(source.getOwners(name, ctx), runtime);
    await settle();
  };
  await warm(scanStore, crates.filter((c) => c.cached === 'l1').map((c) => c.name));
  await warm(newStore(), crates.filter((c) => c.cached === 'l2').map((c) => c.name));
  const warmCalls = cratesCalls().length;

  const manifest = manifestOf(crates);
  const sources: ScanDeps['sources'] = {
    github: {
      hasToken: () => true,
      getRepository: () =>
        Promise.resolve(ok({ full_name: 'o/r', default_branch: 'main', private: false })),
      getBranch: () => Promise.resolve(ok({ commit: { sha: SHA } })),
      getTree: () =>
        Promise.resolve(
          ok({
            tree: [{ path: 'Cargo.toml', type: 'blob', size: 100, sha: 'b'.repeat(40) }],
            truncated: false,
          }),
        ),
      getManifestText: () => Promise.resolve(ok(manifest) as SourceResult<string>),
      queryRepositories: () => Promise.resolve(ok({ data: {} })),
    },
    depsdev: {
      getPackage: () => Promise.resolve(absent),
      getVersion: () => Promise.resolve(absent),
      getVersionBatch: () => Promise.resolve(ok({ responses: [] })),
      getAdvisory: () => Promise.resolve(absent),
    },
    osv: {
      queryBatch: (queries) => Promise.resolve(ok({ results: queries.map(() => ({})) })),
      getVulnerability: () => Promise.resolve(absent),
    },
    npm: { getLatest: () => Promise.resolve(absent) },
    cratesio: cratesOf(scanStore),
    pypi: { getProject: () => Promise.resolve(absent) },
  };
  const deps: ScanDeps = {
    sources,
    clock: runtime.clock,
    timer: runtime.timer,
    random: runtime.random,
    logger: { log: () => undefined },
    scanCache: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
    config: GH_CONFIG,
    limits: { maxManifests: 10, maxDependencies: 100, maxAdvisoryDetails: 50 },
    deadlineMs: 600_000,
  };
  const outcome = await runUntilSettled(
    runScan(
      {
        repo: { host: 'github.com', owner: 'o', repo: 'r', branch: null },
        manifests: [],
        asOf: '2024-01-11T00:00:00.000Z' as never,
        startedAtMs: runtime.clock(),
      },
      deps,
    ),
    runtime,
  );
  await settle();
  if (!outcome.ok) throw new Error(`scan failed: ${outcome.error.code}`);
  return { requests: cratesCalls().slice(warmCalls) };
}

describe('crates.io owners order and cache at scan level', () => {
  it('Property 74: Crates owners are looked up in scope order and cached owners send no request', async () => {
    await fc.assert(
      fc.asyncProperty(arbCrates, async (crates) => {
        const { requests } = await runCase(crates);
        const uncached = crates.filter((c) => c.cached === 'none');
        const expected = expectedOrder(uncached);
        expect(requests).toEqual(expected);
        for (const c of crates.filter((x) => x.cached !== 'none')) {
          expect(requests).not.toContain(c.name);
        }
      }),
      cfg(),
    );
  });
});
