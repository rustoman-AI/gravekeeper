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
  REQUEST_TIMEOUT_MS,
  SCAN_MAX_DEPENDENCIES,
  SCAN_MAX_MANIFESTS,
} from '../../pipeline/constants';
import type { CacheEntry, CacheStore, JsonValue, L2EntryKind } from '../../pipeline/ports/cache';
import type { GithubConfig, SourceName } from '../../pipeline/ports';
import { handleScanRequest } from '../../pipeline/api/handle-scan-request';
import type { ApiDeps } from '../../pipeline/api/handle-scan-request';
import type { ApiResponse } from '../../pipeline/api/scan-error';
import type { LogEntry } from '../../pipeline/ports/runtime';
import { createScanCache } from '../../pipeline/scan/scan-cache';
import { runScan } from '../../pipeline/scan/run-scan';
import type { Result } from '../../core';
import type { ScanDeps, ScanError, ScanOutcome } from '../../pipeline/scan/types';
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
  /** Task 9.17: answer with bodies every mapper accepts, so a scan can finish with all sources ok. */
  readonly valid?: boolean;
  /** The request body of this URL, when it was a string. */
  readonly requestBody?: string | null;
}

function parseObject(text: string | null | undefined): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text ?? '');
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Bodies the mappers accept, for the pieces P72's stubs do not answer in full (GraphQL, versionbatch, version documents). */
function validBody(url: URL, e: EchoContext, echo: unknown): string | null {
  const p = url.pathname;
  if (url.hostname === 'api.github.com' && p === '/graphql') {
    const variables = parseObject(e.requestBody).variables as Record<string, unknown> | undefined;
    const data: Record<string, unknown> = { rateLimit: { remaining: 4000, resetAt: '2030-01-01T00:00:00Z' } };
    for (const key of Object.keys(variables ?? {})) {
      if (!key.endsWith('Owner')) continue;
      data[key.slice(0, -5)] = {
        nameWithOwner: 'o/r',
        isArchived: false,
        isDisabled: false,
        pushedAt: '2023-01-01T00:00:00Z',
        defaultBranchRef: { name: 'main', target: { oid: SHA, committedDate: '2023-01-01T00:00:00Z' } },
      };
    }
    return JSON.stringify({
      data,
      ...(e.graphqlErrors ? { errors: [{ type: 'NOT_FOUND', message: `Bad credentials ${e.token}`, path: ['zz'] }] } : {}),
      echo,
    });
  }
  if (url.hostname === 'api.deps.dev') {
    if (p === '/v3alpha/versionbatch') {
      const requests = parseObject(e.requestBody).requests;
      const responses = (Array.isArray(requests) ? requests : []).map((r: { versionKey?: { name?: string } }) => ({
        request: r,
        version: {
          relatedProjects: [
            { relationType: 'SOURCE_REPO', projectKey: { id: `github.com/own/${String(r.versionKey?.name)}` } },
          ],
        },
      }));
      return JSON.stringify({ responses, echo });
    }
    if (p.includes('/versions/')) {
      return JSON.stringify({
        relatedProjects: [{ relationType: 'SOURCE_REPO', projectKey: { id: 'github.com/own/dep' } }],
        echo,
      });
    }
    if (p.includes('/packages/')) {
      const versions = ['1.0.0', '2.0.0', '3.1.0', '0.8.0', '0.1.0'].map((version, index) => ({
        versionKey: { system: 'NPM', name: 'x', version },
        publishedAt: '2020-01-01T00:00:00Z',
        isDefault: index === 2,
      }));
      return JSON.stringify({ versions, echo });
    }
  }
  return null;
}

/** A 2xx body that reaches the later stages and carries the token in every field a mapper or compactor could keep. */
function okBody(url: URL, e: EchoContext): string {
  const echo = { authorization: e.authorization, token: e.token };
  const p = url.pathname;
  if (e.valid === true) {
    const valid = validBody(url, e, echo);
    if (valid !== null) return valid;
  }
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

/** Task 9.17 options. The defaults give the P72 stack. */
export interface StackOptions {
  /** The GitHub source reports a token (default false, as in P72). */
  readonly hasToken?: boolean;
  /** Answer 2xx with bodies the mappers accept (default false). */
  readonly validBodies?: boolean;
  /** Sources whose 2xx body is not JSON and contains the token. */
  readonly unparsable?: Readonly<Partial<Record<SourceName, boolean>>>;
  /** Sources whose answer arrives later than REQUEST_TIMEOUT_MS. */
  readonly slow?: Readonly<Partial<Record<SourceName, boolean>>>;
}

export interface TokenStack {
  readonly captures: () => readonly Capture[];
  readonly fakeL2: FakeL2;
  readonly fetchCalls: () => number;
  /** Every Logger line written by any component of the stack. */
  readonly logLines: () => readonly LogEntry[];
  /** Messages of errors thrown out of a run (empty when nothing threw). */
  readonly thrown: () => readonly string[];
  /** Runs one scan and settles every deferred L2 write. Returns whether runScan resolved. */
  readonly scan: () => Promise<{ readonly ok: boolean; readonly outcome: Result<ScanOutcome, ScanError> | null }>;
  /** Runs one POST through handleScanRequest, then settles every deferred L2 write. */
  readonly route: () => Promise<ApiResponse | null>;
}

export function buildTokenStack(s: ScenarioShape, opts: StackOptions = {}): TokenStack {
  const startedAtMs = 1_000_000;
  const runtime = createFakeRuntime(startedAtMs, s.random);
  const { token } = s;
  const collected = createCollectingLogger();
  const thrown: string[] = [];

  // Request echo: the wrapper records the Authorization header and OSV batch size per URL.
  const authByUrl = new Map<string, string | null>();
  const bodyByUrl = new Map<string, string | null>();
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
      valid: opts.validBodies === true,
      requestBody: bodyByUrl.get(rawUrl) ?? null,
    };
    if (opts.slow?.[source] === true) {
      return {
        latencyMs: REQUEST_TIMEOUT_MS + 5000,
        response: { status: 200, headers: [['x-ratelimit-remaining', token]], body: { kind: 'text', text: okBody(url, e) } },
      };
    }
    if (opts.unparsable?.[source] === true) {
      return {
        latencyMs: 0,
        response: {
          status: 200,
          headers: [['content-type', 'application/json'], ['x-echo-authorization', e.authorization ?? '']],
          body: { kind: 'text', text: `{"message": "Bad credentials ${token}", "echo": ` },
        },
      };
    }
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
    bodyByUrl.set(url, typeof init?.body === 'string' ? init.body : null);
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
  const logger = collected.logger;
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
        logger,
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
      github: createGithubSource(client, CONFIG, opts.hasToken === true),
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
    logLines: () => collected.lines,
    thrown: () => thrown,
    scan: async () => {
      let outcome: Result<ScanOutcome, ScanError> | null = null;
      try {
        outcome = await runUntilSettled(
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
      } catch (error) {
        thrown.push(error instanceof Error ? error.message : String(error));
      }
      await runUntilSettled(Promise.all(pending), runtime);
      return { ok: outcome?.ok ?? false, outcome };
    },
    route: async () => {
      const { config: _config, limits: _limits, progress: _progress, ...rest } = deps;
      void _config;
      void _limits;
      void _progress;
      const apiDeps: ApiDeps = { ...rest, readEnv: () => ({}) };
      const bytes = new TextEncoder().encode(JSON.stringify({ repoUrl: 'https://github.com/o/r' }));
      let response: ApiResponse | null = null;
      try {
        response = await runUntilSettled(
          handleScanRequest(
            {
              method: 'POST',
              contentType: 'application/json',
              contentLength: String(bytes.byteLength),
              body: new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(bytes);
                  controller.close();
                },
              }),
            },
            apiDeps,
          ),
          runtime,
        );
      } catch (error) {
        thrown.push(error instanceof Error ? error.message : String(error));
      }
      await runUntilSettled(Promise.all(pending), runtime);
      return response;
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

// ===========================================================================
// Task 9.17
// Feature: scan-pipeline, Property 63: The token never reaches a sink
// Validates: Requirements 20.8, 20.9, 20.12
// ===========================================================================

interface Sink {
  readonly name: string;
  readonly text: string;
}

/** The names of the sinks that contain the token, or `Bearer ` (any case, any spacing) followed by the token. */
function sinkLeaks(token: string, sinks: readonly Sink[]): string[] {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const bearer = new RegExp(`bearer\\s+${escaped}`, 'i');
  return sinks.filter((s) => s.text.includes(token) || bearer.test(s.text)).map((s) => s.name);
}

function sinksOf(
  stack: TokenStack,
  outcome: Result<ScanOutcome, ScanError> | null,
  response: ApiResponse | null,
): Sink[] {
  const l2Storage: Capture[] = [...stack.fakeL2.storage.entries()].map(([key, value]) => ({
    where: 'l2.storage',
    key,
    value,
  }));
  return [
    { name: 'logger', text: JSON.stringify(stack.logLines()) },
    { name: 'thrown', text: JSON.stringify(stack.thrown()) },
    { name: 'scan-outcome', text: JSON.stringify(outcome) },
    {
      name: 'route-response',
      text: JSON.stringify(response === null ? null : { status: response.status, headers: response.headers, body: response.body }),
    },
    ...[...stack.captures(), ...l2Storage].map((c, i) => ({
      name: `${c.where}#${i}`,
      text: `${c.key}\n${JSON.stringify(c.value) ?? ''}`,
    })),
  ];
}

const arbSourceFlags = fc.record({
  github: fc.oneof({ weight: 3, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
  depsdev: fc.oneof({ weight: 3, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
  osv: fc.oneof({ weight: 3, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
  npm: fc.oneof({ weight: 3, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
  cratesio: fc.oneof({ weight: 3, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
  pypi: fc.oneof({ weight: 3, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
});

const ALL_200: Readonly<Record<SourceName, readonly number[]>> = {
  github: [200],
  depsdev: [200],
  osv: [200],
  npm: [200],
  cratesio: [200],
  pypi: [200],
};

interface P63Scenario {
  readonly family: 'echo' | 'ok-all' | 'mixed';
  readonly shape: ScenarioShape;
  readonly opts: StackOptions;
}

/**
 * echo: P72's stubs (4xx, 5xx, redirect, echoed headers and GraphQL errors).
 * ok-all: every source answers 200 with valid bodies and a token is set, so a Scan_Result is stored.
 * mixed: valid bodies plus unparsable and slow (timeout) answers on some sources.
 */
const arbP63: fc.Arbitrary<P63Scenario> = fc
  .record({
    family: fc.constantFrom<P63Scenario['family']>('echo', 'ok-all', 'mixed'),
    shape: arbScenario,
    hasToken: fc.boolean(),
    unparsable: arbSourceFlags,
    slow: arbSourceFlags,
  })
  .map(({ family, shape, hasToken, unparsable, slow }): P63Scenario => {
    switch (family) {
      case 'echo':
        return { family, shape, opts: { hasToken } };
      case 'ok-all':
        return { family, shape: { ...shape, plans: ALL_200, redirect: ALL_OK.redirect }, opts: { hasToken: true, validBodies: true } };
      case 'mixed':
        return { family, shape, opts: { hasToken, validBodies: true, unparsable, slow } };
    }
  });

describe('P63 The token never reaches a sink', () => {
  it('P63: an all-ok scan stores a Scan_Result in L1 and L2, and the stored entry is token-free (not vacuous)', async () => {
    const shape: ScenarioShape = { ...ALL_OK, graphqlErrors: true };
    const opts: StackOptions = { hasToken: true, validBodies: true };

    const scanStack = buildTokenStack(shape, opts);
    const { outcome } = await scanStack.scan();
    expect(outcome?.ok).toBe(true);
    if (outcome?.ok !== true) throw new Error('scan did not succeed');
    expect(outcome.value.result.notes.map((n) => n.code)).not.toContain('github-token-missing');
    expect(outcome.value.result.sources).toEqual({
      github: 'ok',
      depsdev: 'ok',
      osv: 'ok',
      npm: 'ok',
      cratesio: 'ok',
      pypi: 'ok',
    });
    const scanWrites = scanStack.captures().filter((c) => c.where === 'l1-scan.set');
    expect(scanWrites).toHaveLength(1);
    const storedScan = [...scanStack.fakeL2.storage.values()].filter((v) => JSON.stringify(v).includes('"assessed"'));
    expect(storedScan).toHaveLength(1);
    expect(sinkLeaks(shape.token, sinksOf(scanStack, outcome, null))).toEqual([]);

    const routeStack = buildTokenStack(shape, opts);
    const response = await routeStack.route();
    expect(response?.status).toBe(200);
    expect(response?.body.ok).toBe(true);
    expect(routeStack.captures().some((c) => c.where === 'l1-scan.set')).toBe(true);
    expect(sinkLeaks(shape.token, sinksOf(routeStack, null, response))).toEqual([]);
  });

  it('P63: neither the token nor "Bearer " + token reaches any Logger line, error message, Scan_Result, Scan_Error, route response or cache key or value', async () => {
    await fc.assert(
      fc.asyncProperty(arbP63, async ({ family, shape, opts }) => {
        const viaScan = buildTokenStack(shape, opts);
        const scanned = await viaScan.scan();
        // The ok-all family must reach the Scan_Cache write, or the scan entry is never checked.
        if (family === 'ok-all') {
          expect(scanned.outcome?.ok).toBe(true);
          expect(viaScan.captures().some((c) => c.where === 'l1-scan.set')).toBe(true);
          expect([...viaScan.fakeL2.storage.values()].some((v) => JSON.stringify(v).includes('"assessed"'))).toBe(true);
        }
        expect(viaScan.fetchCalls()).toBeGreaterThan(0);
        expect(sinkLeaks(shape.token, sinksOf(viaScan, scanned.outcome, null))).toEqual([]);
        expect(viaScan.thrown()).toEqual([]);

        const viaRoute = buildTokenStack(shape, opts);
        const response = await viaRoute.route();
        expect(response).not.toBeNull();
        expect(sinkLeaks(shape.token, sinksOf(viaRoute, null, response))).toEqual([]);
        expect(viaRoute.thrown()).toEqual([]);
      }),
      cfg(),
    );
  });
});
