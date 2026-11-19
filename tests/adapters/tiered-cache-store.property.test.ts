import { createHash } from 'node:crypto';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MemoryCacheStore } from '../../adapters/cache/memory-cache-store';
import { RuntimeCacheStore } from '../../adapters/cache/runtime-cache-store';
import { CachingHttpClient } from '../../adapters/http/caching-http-client';
import { createCratesIoSource } from '../../adapters/cratesio/cratesio-source';
import { createDepsDevSource } from '../../adapters/depsdev/depsdev-source';
import { createGithubSource } from '../../adapters/github/github-source';
import { createGithubAuthorizer } from '../../adapters/http/github-authorizer';
import { createHttpClient } from '../../adapters/http/http-client';
import { createNpmSource } from '../../adapters/npm/npm-source';
import { createOsvSource } from '../../adapters/osv/osv-source';
import { createPypiSource } from '../../adapters/pypi/pypi-source';
import { TieredCacheStore } from '../../adapters/cache/tiered-cache-store';
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
  L2_MAX_BODY_BYTES,
  L2_MAX_SCAN_BYTES,
  OSV_MAX_ADVISORY_DETAILS,
  SCAN_MAX_DEPENDENCIES,
  SCAN_MAX_MANIFESTS,
} from '../../pipeline/constants';
import type { GithubConfig, SourceName } from '../../pipeline/ports';
import { createScanCache } from '../../pipeline/scan/scan-cache';
import { runScan } from '../../pipeline/scan/run-scan';
import type { ScanDeps } from '../../pipeline/scan/types';
import type { CacheEntry, JsonValue, L2EntryKind } from '../../pipeline/ports/cache';
import { L2_OK, arbFailingL2Mode, arbL2Modes, createCollectingLogger, createFakeL2, type L2Mode } from '../support/arbitraries/l2';
import { cfg } from '../support/fc-config';
import { createFakeRuntime, runUntilSettled, type FakeRuntime } from '../support/fake-runtime';
import { createScriptedFetch, type Step } from '../support/scripted-fetch';

// Requirement 19.11 (Property 67)

const START = 1_000_000;
const sha256Hex = (text: string): Promise<string> =>
  Promise.resolve(createHash('sha256').update(text).digest('hex'));

/** Each key has one fixed L2 kind (null: L1 only). */
const KEY_KIND: Readonly<Record<string, L2EntryKind | null>> = {
  a: 'scan',
  b: 'scan',
  c: 'osv-advisory',
  d: 'osv-advisory',
  e: null,
  f: null,
};
const KEYS = Object.keys(KEY_KIND);
const limitOf = (kind: L2EntryKind | null): number =>
  kind === 'scan' ? L2_MAX_SCAN_BYTES : L2_MAX_BODY_BYTES;
const BIG: Readonly<Record<string, string>> = {
  scan: 'x'.repeat(L2_MAX_SCAN_BYTES + 1),
  body: 'x'.repeat(L2_MAX_BODY_BYTES + 1),
};

type Op =
  | { readonly kind: 'put'; readonly key: string; readonly n: number; readonly ttl: number; readonly big: boolean }
  | { readonly kind: 'get'; readonly key: string }
  | { readonly kind: 'advance'; readonly ms: number }
  | { readonly kind: 'reset' };

const arbKey = fc.constantFrom(...KEYS);
const arbOp: fc.Arbitrary<Op> = fc.oneof(
  {
    weight: 5,
    arbitrary: fc.record({
      kind: fc.constant('put' as const),
      key: arbKey,
      n: fc.integer({ min: 0, max: 1000 }),
      ttl: fc.constantFrom(1, 2, 5, 60),
      big: fc.oneof({ weight: 6, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
    }),
  },
  { weight: 6, arbitrary: fc.record({ kind: fc.constant('get' as const), key: arbKey }) },
  {
    weight: 3,
    arbitrary: fc.record({
      kind: fc.constant('advance' as const),
      ms: fc.oneof(fc.integer({ min: 1, max: 70_000 }), fc.constantFrom(999, 1000, 1001, 2000, 5000)),
    }),
  },
  { weight: 2, arbitrary: fc.constant<Op>({ kind: 'reset' }) },
);
const arbOps = fc.array(arbOp, { minLength: 1, maxLength: 60 });

interface Stored {
  readonly value: JsonValue;
  readonly at: number;
  readonly ttl: number;
}
const live = (e: Stored, now: number): boolean => now >= e.at && now - e.at < e.ttl * 1000;
const bytesOf = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;
const valueOf = (op: Extract<Op, { kind: 'put' }>): JsonValue => {
  if (!op.big) return { n: op.n };
  return KEY_KIND[op.key] === 'scan' ? (BIG.scan as string) : (BIG.body as string);
};

function setup(modes: readonly L2Mode[]) {
  const runtime = createFakeRuntime(START);
  const l2 = createFakeL2(runtime, modes);
  const { logger } = createCollectingLogger();
  const l2Store = new RuntimeCacheStore({
    getCache: l2.getCache,
    sha256Hex,
    timer: runtime.timer,
    clock: runtime.clock,
    logger,
  });
  const pending: Promise<unknown>[] = [];
  const newL1 = (): MemoryCacheStore => new MemoryCacheStore(runtime.clock);
  const build = (l1: MemoryCacheStore): TieredCacheStore =>
    new TieredCacheStore({ l1, l2: l2Store, deferrer: { defer: (p) => void pending.push(p) } });
  return { runtime, l2, pending, newL1, build };
}

async function settle(runtime: FakeRuntime, pending: Promise<unknown>[]): Promise<void> {
  await runUntilSettled(Promise.all(pending.splice(0)), runtime);
}

function advance(runtime: FakeRuntime, ms: number): void {
  runtime.timer.setTimeout(() => undefined, ms);
  runtime.advanceToNextTimer();
}

/** No L2 write ever carries a value above the limit of its kind (the kind is part of the L2 key). */
function expectNoOversizeWrites(l2: ReturnType<typeof createFakeL2>): void {
  for (const call of l2.calls) {
    if (call.op !== 'set') continue;
    const kind = call.key.split(':')[2] === 'scan' ? 'scan' : null;
    const envelope = call.value as { value: unknown };
    expect(bytesOf(envelope.value)).toBeLessThanOrEqual(limitOf(kind));
  }
}

describe('Property 67: Tiered cache behaves like one cache that survives instance loss', () => {
  it(
    'with a healthy L2 it matches a two-tier model exactly, across L1 resets',
    async () => {
      await fc.assert(
        fc.asyncProperty(arbOps, async (ops) => {
          const { runtime, l2, pending, newL1, build } = setup([L2_OK]);
          let store = build(newL1());
          const l1m = new Map<string, Stored>();
          const l2m = new Map<string, Stored>();
          for (const op of ops) {
            await settle(runtime, pending);
            const now = runtime.clock();
            if (op.kind === 'put') {
              const kind = KEY_KIND[op.key] ?? null;
              const value = valueOf(op);
              const rec: Stored = { value, at: now, ttl: op.ttl };
              await store.set(op.key, value, op.ttl, { l2Kind: kind });
              l1m.set(op.key, rec);
              if (kind !== null && bytesOf(value) <= limitOf(kind)) l2m.set(op.key, rec);
            } else if (op.kind === 'get') {
              const kind = KEY_KIND[op.key] ?? null;
              const got = await runUntilSettled(store.get(op.key, { l2Kind: kind }), runtime);
              const a = l1m.get(op.key);
              const b = l2m.get(op.key);
              let expected: Stored | null = null;
              if (a !== undefined && live(a, now)) expected = a;
              else if (kind !== null && b !== undefined && live(b, now)) {
                expected = b;
                l1m.set(op.key, b); // promotion keeps storedAt and ttl
              }
              if (expected === null) expect(got).toBeNull();
              else {
                expect(got).not.toBeNull();
                expect((got as CacheEntry).value).toEqual(expected.value);
                expect((got as CacheEntry).storedAtMs).toBe(expected.at);
              }
            } else if (op.kind === 'advance') {
              advance(runtime, op.ms);
            } else {
              store = build(newL1());
              l1m.clear();
            }
          }
          await settle(runtime, pending);
          expectNoOversizeWrites(l2);
        }),
        cfg(),
      );
    },
    120_000,
  );

  it(
    'with any L2 failure sequence it never throws, never returns an expired or unstored value, and never writes an oversize value',
    async () => {
      await fc.assert(
        fc.asyncProperty(arbL2Modes, arbOps, async (modes, ops) => {
          const { runtime, l2, pending, newL1, build } = setup(modes);
          let store = build(newL1());
          const history = new Map<string, Stored[]>();
          for (const op of ops) {
            await settle(runtime, pending);
            const now = runtime.clock();
            if (op.kind === 'put') {
              const kind = KEY_KIND[op.key] ?? null;
              const value = valueOf(op);
              await store.set(op.key, value, op.ttl, { l2Kind: kind });
              history.set(op.key, [...(history.get(op.key) ?? []), { value, at: now, ttl: op.ttl }]);
            } else if (op.kind === 'get') {
              const kind = KEY_KIND[op.key] ?? null;
              const got = await runUntilSettled(store.get(op.key, { l2Kind: kind }), runtime);
              if (got !== null) {
                const at = runtime.clock();
                const match = (history.get(op.key) ?? []).some(
                  (h) =>
                    h.at === got.storedAtMs &&
                    h.ttl === got.ttlSeconds &&
                    JSON.stringify(h.value) === JSON.stringify(got.value),
                );
                expect(match).toBe(true);
                expect(at - got.storedAtMs).toBeGreaterThanOrEqual(0);
                expect(at - got.storedAtMs).toBeLessThan((got.ttlSeconds ?? 0) * 1000);
                if (kind === null) expect(got.ttlSeconds).toBeDefined();
              }
            } else if (op.kind === 'advance') {
              advance(runtime, op.ms);
            } else {
              store = build(newL1());
            }
          }
          await settle(runtime, pending);
          expectNoOversizeWrites(l2);
        }),
        cfg(),
      );
    },
    120_000,
  );
});

it('P67 unit: a live value written to L2 is returned after an L1 reset', async () => {
  const { runtime, pending, newL1, build } = setup([L2_OK]);
  await build(newL1()).set('a', { n: 1 }, 60, { l2Kind: 'scan' });
  await settle(runtime, pending);
  const got = await runUntilSettled(build(newL1()).get('a', { l2Kind: 'scan' }), runtime);
  expect(got?.value).toEqual({ n: 1 });
});

// Feature: scan-pipeline, Property 69: L2 failures never change a result
// Validates: Requirements 19.29

const SHA = 'a'.repeat(40);
const GH_CONFIG: GithubConfig = {
  apiUrl: GITHUB_DEFAULT_API_URL,
  graphqlUrl: GITHUB_DEFAULT_GRAPHQL_URL,
  webHost: GITHUB_DEFAULT_WEB_HOST,
};
const PACKAGE_JSON = JSON.stringify({
  name: 'app',
  dependencies: { left: '1.0.0', right: '^2.0.0', mid: '3.1.0' },
});
const REQUIREMENTS = 'requests==2.0.0\nflask==1.0.0\n';
const CARGO = '[package]\nname = "x"\nversion = "0.1.0"\n[dependencies]\nserde = "1.0.0"\nrand = "0.8.0"\n';
const TREE = {
  truncated: false,
  tree: [
    { path: 'package.json', type: 'blob', size: 100, sha: 'b'.repeat(40) },
    { path: 'requirements.txt', type: 'blob', size: 30, sha: 'c'.repeat(40) },
    { path: 'Cargo.toml', type: 'blob', size: 100, sha: 'd'.repeat(40) },
  ],
};

function sourceOf(url: URL): SourceName {
  switch (url.hostname) {
    case 'api.deps.dev':
      return 'depsdev';
    case 'api.osv.dev':
      return 'osv';
    case 'registry.npmjs.org':
      return 'npm';
    case 'crates.io':
      return 'cratesio';
    case 'pypi.org':
      return 'pypi';
    default:
      return 'github';
  }
}

function bodyFor(url: URL): string {
  const p = url.pathname;
  switch (url.hostname) {
    case 'api.github.com':
      if (p.includes('/git/trees/')) return JSON.stringify(TREE);
      if (p.includes('/branches/')) return JSON.stringify({ commit: { sha: SHA } });
      if (p === '/graphql') return JSON.stringify({ data: {} });
      return JSON.stringify({ full_name: 'o/r', default_branch: 'main', private: false });
    case 'raw.githubusercontent.com':
      if (p.endsWith('package.json')) return PACKAGE_JSON;
      if (p.endsWith('requirements.txt')) return REQUIREMENTS;
      return CARGO;
    case 'api.deps.dev':
      return JSON.stringify({
        versions: [
          { versionKey: { system: 'NPM', name: 'x', version: '1.0.0' }, publishedAt: '2020-01-01T00:00:00Z', isDefault: true },
        ],
      });
    case 'registry.npmjs.org':
      return JSON.stringify({ name: 'x', version: '1.0.0', maintainers: [{ name: 'a' }] });
    case 'crates.io':
      return JSON.stringify({ users: [{ login: 'a' }] });
    case 'pypi.org':
      return JSON.stringify({ info: { name: 'x', version: '1.0.0' }, ownership: { roles: [] } });
    case 'api.osv.dev':
      return JSON.stringify({ results: [{ vulns: [] }] });
    default:
      return '{}';
  }
}

/**
 * Upstream steps are fast (so the 25 s deadline is not what separates two runs) and the same for
 * both runs of a scenario; the extra clock time spent on L2 timeouts must not change a result.
 */
const arbStep: fc.Arbitrary<Step> = fc.record({
  latencyMs: fc.integer({ min: 0, max: 200 }),
  response: fc.oneof(
    { weight: 6, arbitrary: fc.constant<Step['response']>({ status: 200 }) },
    { weight: 1, arbitrary: fc.constant<Step['response']>({ status: 404 }) },
    { weight: 1, arbitrary: fc.constant<Step['response']>({ status: 503 }) },
    { weight: 1, arbitrary: fc.constant<Step['response']>('network-error') },
  ),
});
const arbSteps = fc.array(arbStep, { minLength: 1, maxLength: 3 });
const arbScripts: fc.Arbitrary<Readonly<Record<SourceName, readonly Step[]>>> = fc
  .tuple(arbSteps, arbSteps, arbSteps, arbSteps, arbSteps, arbSteps)
  .map(([github, depsdev, osv, npm, cratesio, pypi]) => ({ github, depsdev, osv, npm, cratesio, pypi }));

const arbFailingModes = fc.array(arbFailingL2Mode, { minLength: 1, maxLength: 12 });

/** Runs three scans (miss, L1 hit, miss after L1 loss) and returns their outcomes. */
async function fullScans(
  scripts: Readonly<Record<SourceName, readonly Step[]>>,
  random: readonly number[],
  modes: readonly L2Mode[] | null,
) {
  const runtime = createFakeRuntime(START, random);
  const scripted = createScriptedFetch((rawUrl, attemptIndex) => {
    const url = new URL(rawUrl);
    const steps = scripts[sourceOf(url)];
    const step = steps[Math.min(attemptIndex, steps.length - 1)] as Step;
    const r = step.response;
    if (r === 'network-error' || r.status !== 200) return step;
    return {
      latencyMs: step.latencyMs,
      response: {
        status: 200,
        headers: [['content-type', 'application/json']],
        body: { kind: 'text', text: bodyFor(url) },
      },
    };
  }, runtime);
  const l2 = modes === null ? null : createFakeL2(runtime, modes);
  const { logger: l2Logger, lines } = createCollectingLogger();
  const l2Store =
    l2 === null
      ? null
      : new RuntimeCacheStore({
          getCache: l2.getCache,
          sha256Hex,
          timer: runtime.timer,
          clock: runtime.clock,
          logger: l2Logger,
        });
  const pending: Promise<unknown>[] = [];
  const build = (): TieredCacheStore =>
    new TieredCacheStore({
      l1: new MemoryCacheStore(runtime.clock),
      l2: l2Store,
      deferrer: { defer: (p) => void pending.push(p) },
    });
  const logger = { log: (): void => undefined };
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
    logger,
    limiters,
    authorizer: createGithubAuthorizer(() => null, GH_CONFIG),
    secrets: () => [],
    userAgent: 'gravekeeper-test',
  });
  const outcomes: unknown[] = [];
  let store = build();
  for (let i = 0; i < 3; i += 1) {
    if (i === 2) store = build(); // instance loss: L1 is empty, L2 (if any) is all that is left
    const client = new CachingHttpClient(http, store);
    const deps: ScanDeps = {
      sources: {
        github: createGithubSource(client, GH_CONFIG, false),
        depsdev: createDepsDevSource(client),
        osv: createOsvSource(client),
        npm: createNpmSource(client),
        cratesio: createCratesIoSource({ http: client, userAgent: 'gravekeeper-test' }),
        pypi: createPypiSource(client),
      },
      clock: runtime.clock,
      timer: runtime.timer,
      random: runtime.random,
      logger,
      scanCache: createScanCache(store),
      config: GH_CONFIG,
      limits: {
        maxManifests: SCAN_MAX_MANIFESTS,
        maxDependencies: SCAN_MAX_DEPENDENCIES,
        maxAdvisoryDetails: OSV_MAX_ADVISORY_DETAILS,
      },
    };
    outcomes.push(
      await runUntilSettled(
        runScan(
          {
            repo: { host: GITHUB_DEFAULT_WEB_HOST, owner: 'o', repo: 'r', branch: null },
            manifests: [],
            asOf: '2024-01-01T00:00:00Z',
            startedAtMs: START,
          },
          deps,
        ),
        runtime,
      ),
    );
    await settle(runtime, pending);
  }
  return { outcomes, l2, lines, fetchCalls: scripted.calls.length };
}

describe('Property 69: L2 failures never change a result', () => {
  it(
    'full scans with any failing L2 equal the same scans with the runtime cache off, and each failed L2 operation logs one l2-cache-error line',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbScripts,
          fc.array(fc.double({ min: 0, max: 0.999999, noNaN: true }), { minLength: 1, maxLength: 4 }),
          arbFailingModes,
          async (scripts, random, modes) => {
            const off = await fullScans(scripts, random, null);
            const failing = await fullScans(scripts, random, modes);
            expect(failing.outcomes).toEqual(off.outcomes);
            expect(failing.fetchCalls).toBe(off.fetchCalls);
            // Every L2 call fails (a `set` in invalid-envelope mode is answered normally).
            const l2 = failing.l2 as NonNullable<typeof failing.l2>;
            const expectedLines = l2.calls.filter((call, i) => {
              const mode = modes[Math.min(i, modes.length - 1)] as L2Mode;
              return !(call.op === 'set' && mode.kind === 'invalid-envelope');
            }).length;
            const errorLines = failing.lines.filter(
              (l) => l.source === 'cache' && l.code === 'l2-cache-error',
            );
            expect(errorLines.length).toBe(expectedLines);
            expect(failing.lines.length).toBe(errorLines.length);
          },
        ),
        cfg(),
      );
    },
    300_000,
  );
});

it('P69 unit: an all-200 scan reaches L2 (scan cache and HTTP cache) and equals the off result', async () => {
  const ok: Step[] = [{ latencyMs: 0, response: { status: 200 } }];
  const scripts = { github: ok, depsdev: ok, osv: ok, npm: ok, cratesio: ok, pypi: ok };
  const off = await fullScans(scripts, [0.5], null);
  const failing = await fullScans(scripts, [0.5], [{ kind: 'throw' }]);
  expect((off.outcomes[0] as { ok: boolean }).ok).toBe(true);
  expect(failing.outcomes).toEqual(off.outcomes);
  expect((failing.l2?.calls.length ?? 0)).toBeGreaterThan(3);
  expect(failing.lines.length).toBe(failing.l2?.calls.length);
});
