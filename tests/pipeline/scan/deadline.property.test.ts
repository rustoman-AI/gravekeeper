import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createCratesIoSource } from '../../../adapters/cratesio/cratesio-source';
import { createDepsDevSource } from '../../../adapters/depsdev/depsdev-source';
import { createGithubSource } from '../../../adapters/github/github-source';
import { createGithubAuthorizer } from '../../../adapters/http/github-authorizer';
import { createHttpClient } from '../../../adapters/http/http-client';
import { createNpmSource } from '../../../adapters/npm/npm-source';
import { createOsvSource } from '../../../adapters/osv/osv-source';
import { createPypiSource } from '../../../adapters/pypi/pypi-source';
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
  SCAN_DEADLINE_MS,
  SCAN_MAX_DEPENDENCIES,
  SCAN_MAX_MANIFESTS,
} from '../../../pipeline/constants';
import type { GithubConfig, SourceName } from '../../../pipeline/ports';
import { runScan } from '../../../pipeline/scan/run-scan';
import type { ScanDeps } from '../../../pipeline/scan/types';
import { scriptStep } from '../../support/arbitraries/scripts';
import { createFakeRuntime, runUntilSettled } from '../../support/fake-runtime';
import { cfg } from '../../support/fc-config';
import { createScriptedFetch, type ScriptedResponse, type Step } from '../../support/scripted-fetch';

// Feature: scan-pipeline, Property 48: P48 No attempt is sent at or after the deadline
// Validates: Requirements 16.9

const SHA = 'a'.repeat(40);
const CONFIG: GithubConfig = {
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

/** A 2xx body that lets the scan reach the later stages. */
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

/** Latencies of 5 to 8 seconds make several sequential units reach the deadline. */
const slowStep: fc.Arbitrary<Step> = fc.record({
  latencyMs: fc.integer({ min: REQUEST_TIMEOUT_MS - 3000, max: REQUEST_TIMEOUT_MS + 200 }),
  response: fc.constantFrom<Step['response']>({ status: 200 }, { status: 503 }, 'network-error', { status: 429, headers: [['Retry-After', '3']] }),
});

const arbStep: fc.Arbitrary<Step> = fc.oneof(
  { weight: 3, arbitrary: scriptStep({ failurePercent: 50 }) },
  { weight: 2, arbitrary: slowStep },
);
const arbSteps: fc.Arbitrary<readonly Step[]> = fc.array(arbStep, { minLength: 1, maxLength: 5 });

const arbScripts: fc.Arbitrary<Readonly<Record<SourceName, readonly Step[]>>> = fc
  .tuple(arbSteps, arbSteps, arbSteps, arbSteps, arbSteps, arbSteps)
  .map(([github, depsdev, osv, npm, cratesio, pypi]) => ({ github, depsdev, osv, npm, cratesio, pypi }));

const arbScenario = fc.record({
  startedAtMs: fc.integer({ min: 1_000_000, max: 2_000_000_000 }),
  scripts: arbScripts,
  honorsSignal: fc.boolean(),
  /** Fake-runtime random values for the retry jitter. */
  random: fc.array(fc.double({ min: 0, max: 0.999999, noNaN: true }), { minLength: 1, maxLength: 4 }),
});

/** Keeps a generated step's latency and failure, but gives a 2xx response a body the scan can read. */
function withRoutedBody(step: Step, url: URL): Step {
  const r = step.response;
  if (r === 'network-error' || r.status < 200 || r.status > 299) return step;
  if (r.body?.kind === 'size') return step;
  const response: ScriptedResponse = {
    status: r.status === 204 ? 200 : r.status,
    headers: [['content-type', 'application/json'], ...(r.headers ?? [])],
    body: { kind: 'text', text: bodyFor(url) },
  };
  return { latencyMs: step.latencyMs, response };
}

interface ScenarioInput {
  readonly startedAtMs: number;
  readonly scripts: Readonly<Record<SourceName, readonly Step[]>>;
  readonly honorsSignal: boolean;
  readonly random: readonly number[];
}

async function runScenario(s: ScenarioInput): Promise<{ sentAtMs: readonly number[]; deadlineAtMs: number; outcomeOk: boolean }> {
  const runtime = createFakeRuntime(s.startedAtMs, s.random);
  const scripted = createScriptedFetch((rawUrl, attemptIndex) => {
    const url = new URL(rawUrl);
    const steps = s.scripts[sourceOf(url)];
    const step = steps[Math.min(attemptIndex, steps.length - 1)] as Step;
    return withRoutedBody(step, url);
  }, runtime);
  // "Ignores the signal": the fetch gets no signal, so it never rejects on abort. The client races it.
  const fetchImpl: typeof fetch = s.honorsSignal
    ? scripted.fetch
    : ((input: RequestInfo | URL, init?: RequestInit) => scripted.fetch(input, { ...init, signal: undefined })) as typeof fetch;
  const limiters: Record<SourceName, { concurrency: number; minIntervalMs: number }> = {
    github: { concurrency: CONCURRENCY_GITHUB, minIntervalMs: 0 },
    depsdev: { concurrency: CONCURRENCY_DEPSDEV, minIntervalMs: 0 },
    osv: { concurrency: CONCURRENCY_OSV, minIntervalMs: 0 },
    npm: { concurrency: CONCURRENCY_NPM, minIntervalMs: 0 },
    cratesio: { concurrency: CONCURRENCY_CRATESIO, minIntervalMs: CRATESIO_MIN_INTERVAL_MS },
    pypi: { concurrency: CONCURRENCY_PYPI, minIntervalMs: 0 },
  };
  const logger = { log: (): void => undefined };
  const client = createHttpClient({
    fetchImpl,
    clock: runtime.clock,
    timer: runtime.timer,
    random: runtime.random,
    logger,
    limiters,
    authorizer: createGithubAuthorizer(() => null, CONFIG),
    secrets: () => [],
    userAgent: 'gravekeeper-test',
  });
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
    scanCache: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
    config: CONFIG,
    limits: {
      maxManifests: SCAN_MAX_MANIFESTS,
      maxDependencies: SCAN_MAX_DEPENDENCIES,
      maxAdvisoryDetails: OSV_MAX_ADVISORY_DETAILS,
    },
  };
  const outcome = await runUntilSettled(
    runScan(
      {
        repo: { host: GITHUB_DEFAULT_WEB_HOST, owner: 'o', repo: 'r', branch: null },
        manifests: [],
        asOf: '2024-01-01T00:00:00Z',
        startedAtMs: s.startedAtMs,
      },
      deps,
    ),
    runtime,
  );
  return {
    sentAtMs: scripted.calls.map((c) => c.sentAtMs),
    deadlineAtMs: s.startedAtMs + SCAN_DEADLINE_MS,
    outcomeOk: outcome.ok,
  };
}

describe('P48 No attempt is sent at or after the deadline', () => {
  it('P48: every attempt (first or retry) is sent before Scan_Start + SCAN_DEADLINE_MS, whether fetch honors or ignores the signal, and runScan does not throw', async () => {
    await fc.assert(
      fc.asyncProperty(arbScenario, async (scenario) => {
        const { sentAtMs, deadlineAtMs } = await runScenario(scenario);
        for (const sentAt of sentAtMs) expect(sentAt).toBeLessThan(deadlineAtMs);
      }),
      cfg(),
    );
  });

  it('P48: the scan is exercised past the first stage in at least one generated slow scenario', async () => {
    const slow: Step = { latencyMs: 7000, response: { status: 200 } };
    const fast: Step = { latencyMs: 0, response: { status: 200 } };
    const scripts = { github: [fast], depsdev: [slow], osv: [slow], npm: [slow], cratesio: [slow], pypi: [slow] };
    const result = await runScenario({ startedAtMs: 1_000_000, scripts, honorsSignal: false, random: [0.5] });
    expect(result.sentAtMs.length).toBeGreaterThan(4);
    for (const sentAt of result.sentAtMs) expect(sentAt).toBeLessThan(result.deadlineAtMs);
  });
});
