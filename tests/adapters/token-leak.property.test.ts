import { createHash } from 'node:crypto';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MemoryCacheStore } from '../../adapters/cache/memory-cache-store';
import { RuntimeCacheStore } from '../../adapters/cache/runtime-cache-store';
import { TieredCacheStore } from '../../adapters/cache/tiered-cache-store';
import { createCratesIoSource } from '../../adapters/cratesio/cratesio-source';
import { createDepsDevSource } from '../../adapters/depsdev/depsdev-source';
import { createGithubSource } from '../../adapters/github/github-source';
import { CachingHttpClient } from '../../adapters/http/caching-http-client';
import { createGithubAuthorizer } from '../../adapters/http/github-authorizer';
import { createHttpClient } from '../../adapters/http/http-client';
import { createNpmSource } from '../../adapters/npm/npm-source';
import { createOsvSource } from '../../adapters/osv/osv-source';
import { createPypiSource } from '../../adapters/pypi/pypi-source';
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
  OSV_MAX_ADVISORY_DETAILS,
  SCAN_MAX_DEPENDENCIES,
  SCAN_MAX_MANIFESTS,
} from '../../pipeline/constants';
import type { CacheEntry, CacheStore, JsonValue, L2EntryKind } from '../../pipeline/ports/cache';
import type { GithubConfig, SourceName } from '../../pipeline/ports';
import { createScanCache } from '../../pipeline/scan/scan-cache';
import { runScan } from '../../pipeline/scan/run-scan';
import type { ScanDeps } from '../../pipeline/scan/types';
import { createCollectingLogger, createFakeL2, type FakeL2 } from '../support/arbitraries/l2';
import { createFakeRuntime, runUntilSettled } from '../support/fake-runtime';
import { cfg } from '../support/fc-config';
import { createScriptedFetch, type Step } from '../support/scripted-fetch';

// Feature: scan-pipeline, Property 72: P72 The token never reaches an L2 key or value
// Validates: Requirements 19.32

const SHA = 'a'.repeat(40);
const CONFIG: GithubConfig = {
  apiUrl: GITHUB_DEFAULT_API_URL,
  graphqlUrl: GITHUB_DEFAULT_GRAPHQL_URL,
  webHost: GITHUB_DEFAULT_WEB_HOST,
};

const TREE = {
  truncated: false,
  tree: [
    { path: 'package.json', type: 'blob', size: 100, sha: 'b'.repeat(40) },
    { path: 'requirements.txt', type: 'blob', size: 30, sha: 'c'.repeat(40) },
    { path: 'Cargo.toml', type: 'blob', size: 100, sha: 'd'.repeat(40) },
  ],
};

// ---------------------------------------------------------------------------
// Scenario generators
// ---------------------------------------------------------------------------

const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const arbAlnum = (min: number, max: number): fc.Arbitrary<string> =>
  fc.array(fc.constantFrom(...ALNUM.split('')), { minLength: min, maxLength: max }).map((c) => c.join(''));

/** ghp_ and github_pat_ forms, and random tokens. Characters need no JSON or URL escaping; a random token starts with `z` so it is never only hex. */
export const arbToken: fc.Arbitrary<string> = fc.oneof(
  arbAlnum(36, 36).map((s) => `ghp_${s}`),
  fc.tuple(arbAlnum(22, 22), arbAlnum(59, 59)).map(([a, b]) => `github_pat_${a}_${b}`),
  fc
    .array(fc.constantFrom(...(ALNUM + '_-').split('')), { minLength: 11, maxLength: 40 })
    .map((c) => `z${c.join('')}`),
);

/** One planned answer: status (2xx, 4xx, 5xx) and whether it is preceded by a same-origin redirect. */
const arbStatus = fc.oneof(
  { weight: 5, arbitrary: fc.constant(200) },
  { weight: 1, arbitrary: fc.constantFrom(201, 203) },
  { weight: 2, arbitrary: fc.constantFrom(400, 401, 403, 404, 410, 422, 429) },
  { weight: 2, arbitrary: fc.constantFrom(500, 502, 503) },
);
const arbPlan = fc.array(arbStatus, { minLength: 1, maxLength: 4 });

const arbScenario = fc.record({
  token: arbToken,
  plans: fc
    .tuple(arbPlan, arbPlan, arbPlan, arbPlan, arbPlan, arbPlan)
    .map(
      (p): Readonly<Record<SourceName, readonly number[]>> => ({
        github: p[0],
        depsdev: p[1],
        osv: p[2],
        npm: p[3],
        cratesio: p[4],
        pypi: p[5],
      }),
    ),
  redirect: fc.record({
    github: fc.boolean(),
    depsdev: fc.boolean(),
    osv: fc.boolean(),
    npm: fc.boolean(),
    cratesio: fc.boolean(),
    pypi: fc.boolean(),
  }),
  redirectStatus: fc.constantFrom(301, 302, 307, 308),
  graphqlErrors: fc.boolean(),
  l2Enabled: fc.constant(true),
  random: fc.array(fc.double({ min: 0, max: 0.999999, noNaN: true }), { minLength: 1, maxLength: 4 }),
});

export interface ScenarioShape {
  readonly token: string;
  readonly plans: Readonly<Record<SourceName, readonly number[]>>;
  readonly redirect: Readonly<Record<SourceName, boolean>>;
  readonly redirectStatus: number;
  readonly graphqlErrors: boolean;
  readonly l2Enabled: boolean;
  readonly random: readonly number[];
}

// ---------------------------------------------------------------------------
// Upstream stubs that echo the token
// ---------------------------------------------------------------------------

function sourceOf(url: URL): SourceName {
  switch (url.hostname) {
    case 'api.github.com':
    case 'raw.githubusercontent.com':
      return 'github';
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

interface EchoContext {
  readonly token: string;
  readonly authorization: string | null;
  readonly queryCount: number;
  readonly graphqlErrors: boolean;
}

/** A 2xx body that reaches the later stages and carries the token in every field a mapper or compactor could keep. */
function okBody(url: URL, e: EchoContext): string {
  const echo = { authorization: e.authorization, token: e.token };
  const p = url.pathname;
  switch (url.hostname) {
    case 'api.github.com':
      if (p.includes('/git/trees/')) return JSON.stringify({ ...TREE, echo });
      if (p.includes('/branches/')) return JSON.stringify({ commit: { sha: SHA }, echo });
      if (p === '/graphql') {
        return JSON.stringify({
          data: {},
          ...(e.graphqlErrors ? { errors: [{ type: 'NOT_FOUND', message: `Bad credentials ${e.token}` }] } : {}),
          echo,
        });
      }
      return JSON.stringify({ full_name: 'o/r', default_branch: 'main', private: false, echo });
    case 'raw.githubusercontent.com':
      if (p.endsWith('package.json')) {
        return JSON.stringify({
          name: 'app',
          description: e.token,
          dependencies: { left: '1.0.0', right: '^2.0.0', mid: '3.1.0' },
        });
      }
      if (p.endsWith('requirements.txt')) return `requests==2.0.0\nflask==1.0.0\n# ${e.token}\n`;
      return `[package]\nname = "x"\nversion = "0.1.0"\n[dependencies]\nserde = "1.0.0"\nrand = "0.8.0"\n# ${e.token}\n`;
    case 'api.deps.dev':
      if (p.includes('advisor')) return JSON.stringify({ cvss3Score: 5.5, title: e.token, echo });
      return JSON.stringify({
        versions: [
          { versionKey: { system: 'NPM', name: 'x', version: '1.0.0' }, publishedAt: '2020-01-01T00:00:00Z', isDefault: true },
        ],
        echo,
      });
    case 'registry.npmjs.org':
      return JSON.stringify({ name: 'x', version: '1.0.0', maintainers: [{ name: e.token }], echo });
    case 'crates.io':
      return JSON.stringify({ users: [{ login: e.token, kind: 'user' }, { login: 'a', kind: 'user' }], echo });
    case 'pypi.org':
      return JSON.stringify({ info: { name: 'x', version: '1.0.0' }, ownership: { roles: [] }, echo });
    case 'api.osv.dev':
      if (p === '/v1/querybatch') {
        const results = Array.from({ length: Math.max(1, e.queryCount) }, () => ({ vulns: [{ id: 'GHSA-aaaa-bbbb-cccc' }] }));
        return JSON.stringify({ results, echo });
      }
      return JSON.stringify({
        id: 'GHSA-aaaa-bbbb-cccc',
        aliases: [e.token, 'CVE-2020-0001'],
        summary: e.token,
        database_specific: { severity: 'HIGH' },
        echo,
      });
    default:
      return JSON.stringify({ echo });
  }
}

function errorBody(e: EchoContext): string {
  return JSON.stringify({ message: `Bad credentials ${e.token}`, echo: { authorization: e.authorization, token: e.token } });
}

// ---------------------------------------------------------------------------
// Stack builder (module level: task 9.17 appends P63 to this file)
// ---------------------------------------------------------------------------

export interface Capture {
  readonly where: string;
  readonly key: string;
  readonly value: unknown;
}

/** An L1 store that records every key and value written to it. */
export class CapturingStore implements CacheStore {
  readonly writes: Capture[] = [];
  constructor(
    private readonly name: string,
    private readonly inner: CacheStore,
  ) {}
  get(key: string, options?: { readonly signal?: AbortSignal; readonly l2Kind?: L2EntryKind | null }): Promise<CacheEntry | null> {
    this.writes.push({ where: `${this.name}.get`, key, value: null });
    return this.inner.get(key, options);
  }
  set(
    key: string,
    value: JsonValue,
    ttlSeconds: number,
    options?: { readonly storedAtMs?: number; readonly l2Kind?: L2EntryKind | null },
  ): Promise<void> {
    this.writes.push({ where: `${this.name}.set`, key, value });
    return this.inner.set(key, value, ttlSeconds, options);
  }
}

export interface TokenStack {
  readonly captures: () => readonly Capture[];
  readonly fakeL2: FakeL2;
  readonly fetchCalls: () => number;
  /** Runs one scan and settles every deferred L2 write. Returns whether runScan resolved. */
  readonly scan: () => Promise<{ readonly ok: boolean }>;
}

export function buildTokenStack(s: ScenarioShape): TokenStack {
  const startedAtMs = 1_000_000;
  const runtime = createFakeRuntime(startedAtMs, s.random);
  const { token } = s;

  // Request echo: the wrapper records the Authorization header and OSV batch size per URL.
  const authByUrl = new Map<string, string | null>();
  let queryCount = 0;
  const scripted = createScriptedFetch((rawUrl, attemptIndex): Step => {
    const url = new URL(rawUrl);
    const source = sourceOf(url);
    const plan = s.plans[source];
    const status = plan[Math.min(attemptIndex, plan.length - 1)] as number;
    const e: EchoContext = {
      token,
      authorization: authByUrl.get(rawUrl) ?? null,
      queryCount,
      graphqlErrors: s.graphqlErrors,
    };
    if (s.redirect[source] && !url.searchParams.has('echo')) {
      const target = new URL(rawUrl);
      target.searchParams.set('echo', token);
      return {
        latencyMs: 0,
        response: { status: s.redirectStatus, headers: [['Location', target.pathname + target.search], ['X-Echo-Authorization', e.authorization ?? '']] },
      };
    }
    const headers: [string, string][] = [
      ['content-type', 'application/json'],
      ['x-echo-authorization', e.authorization ?? ''],
      ['x-ratelimit-remaining', token],
    ];
    if (status === 429 || status >= 500) headers.push(['Retry-After', '1']);
    const ok = status >= 200 && status <= 299;
    return {
      latencyMs: 0,
      response: { status, headers, body: { kind: 'text', text: ok ? okBody(url, e) : errorBody(e) } },
    };
  }, runtime);
  const fetchImpl: typeof fetch = (input, init) => {
    const url = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input);
    authByUrl.set(url, new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get('authorization'));
    if (typeof init?.body === 'string' && url.endsWith('/v1/querybatch')) {
      try {
        const parsed = JSON.parse(init.body) as { queries?: unknown[] };
        queryCount = Array.isArray(parsed.queries) ? parsed.queries.length : 0;
      } catch {
        queryCount = 0;
      }
    }
    return scripted.fetch(input, init);
  };

  const limiters: Record<SourceName, { concurrency: number; minIntervalMs: number }> = {
    github: { concurrency: CONCURRENCY_GITHUB, minIntervalMs: 0 },
    depsdev: { concurrency: CONCURRENCY_DEPSDEV, minIntervalMs: 0 },
    osv: { concurrency: CONCURRENCY_OSV, minIntervalMs: 0 },
    npm: { concurrency: CONCURRENCY_NPM, minIntervalMs: 0 },
    cratesio: { concurrency: CONCURRENCY_CRATESIO, minIntervalMs: CRATESIO_MIN_INTERVAL_MS },
    pypi: { concurrency: CONCURRENCY_PYPI, minIntervalMs: 0 },
  };
  const logger = { log: (): void => undefined };
  const inner = createHttpClient({
    fetchImpl,
    clock: runtime.clock,
    timer: runtime.timer,
    random: runtime.random,
    logger,
    limiters,
    authorizer: createGithubAuthorizer(() => token, CONFIG),
    secrets: () => [token],
    userAgent: 'gravekeeper-test',
  });

  const sha256Hex = (text: string): Promise<string> => Promise.resolve(createHash('sha256').update(text).digest('hex'));
  const fakeL2 = createFakeL2(runtime);
  const pending: Promise<unknown>[] = [];
  const l2 = s.l2Enabled
    ? new RuntimeCacheStore({
        getCache: fakeL2.getCache,
        timer: runtime.timer,
        clock: runtime.clock,
        logger: createCollectingLogger().logger,
        sha256Hex,
      })
    : null;
  const newTiered = (name: string): { tiered: TieredCacheStore; l1: CapturingStore } => {
    const l1 = new CapturingStore(name, new MemoryCacheStore(runtime.clock));
    return { tiered: new TieredCacheStore({ l1, l2, deferrer: { defer: (work) => void pending.push(work) } }), l1 };
  };
  const http = newTiered('l1-http');
  const scan = newTiered('l1-scan');
  const client = new CachingHttpClient(inner, http.tiered);

  const deps: ScanDeps = {
    sources: {
      github: createGithubSource(client, CONFIG, false),
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
    scanCache: createScanCache(scan.tiered),
    config: CONFIG,
    limits: {
      maxManifests: SCAN_MAX_MANIFESTS,
      maxDependencies: SCAN_MAX_DEPENDENCIES,
      maxAdvisoryDetails: OSV_MAX_ADVISORY_DETAILS,
    },
  };

  return {
    captures: () => [
      ...http.l1.writes,
      ...scan.l1.writes,
      ...fakeL2.calls.map((c): Capture => ({ where: `l2.${c.op}`, key: c.key, value: c.value ?? null })),
    ],
    fakeL2,
    fetchCalls: () => scripted.calls.length,
    scan: async () => {
      const outcome = await runUntilSettled(
        runScan(
          {
            repo: { host: GITHUB_DEFAULT_WEB_HOST, owner: 'o', repo: 'r', branch: null },
            manifests: [],
            asOf: '2024-01-01T00:00:00Z',
            startedAtMs,
          },
          deps,
        ),
        runtime,
      );
      await runUntilSettled(Promise.all(pending), runtime);
      return { ok: outcome.ok };
    },
  };
}

/** The captures whose key or JSON value contains the token or `Bearer <token>`. */
export function leaksOf(token: string, captures: readonly Capture[]): Capture[] {
  const needles = [token, `Bearer ${token}`];
  return captures.filter((c) => {
    const text = `${c.key}\n${JSON.stringify(c.value) ?? ''}`;
    return needles.some((n) => text.includes(n));
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const ALL_OK: ScenarioShape = {
  token: 'ghp_' + 'Q'.repeat(36),
  plans: { github: [200], depsdev: [200], osv: [200], npm: [200], cratesio: [200], pypi: [200] },
  redirect: { github: false, depsdev: false, osv: false, npm: false, cratesio: false, pypi: false },
  redirectStatus: 302,
  graphqlErrors: true,
  l2Enabled: true,
  random: [0.5],
};

describe('P72 The token never reaches an L2 key or value', () => {
  it('P72: the stack caches and writes L2 entries while upstream echoes the token (not vacuous)', async () => {
    const stack = buildTokenStack(ALL_OK);
    await stack.scan();
    const sets = stack.fakeL2.calls.filter((c) => c.op === 'set');
    expect(sets.length).toBeGreaterThan(0);
    expect(sets.some((c) => c.key.includes(':osv-advisory:'))).toBe(true);
    expect(sets.some((c) => c.key.includes(':crates-owners:'))).toBe(true);
    expect(stack.captures().some((c) => c.where === 'l1-http.set')).toBe(true);
    expect(leaksOf(ALL_OK.token, stack.captures())).toEqual([]);
  });

  it('P72: no L1 or L2 key or value contains the token or "Bearer " + token, for any token, status, and redirect', async () => {
    await fc.assert(
      fc.asyncProperty(arbScenario, async (scenario) => {
        const stack = buildTokenStack(scenario);
        await stack.scan();
        expect(stack.fetchCalls()).toBeGreaterThan(0);
        expect(leaksOf(scenario.token, stack.captures())).toEqual([]);
      }),
      cfg(),
    );
  });
});
