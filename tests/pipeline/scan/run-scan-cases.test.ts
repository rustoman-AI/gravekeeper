// Requirement 23.12, cases 7 to 10 and 12 (Requirements 9.6, 10.5, 14.4, 15.8)
// Case 11 (never-responding upstream through the route) is written in task 9.8.
// The Scan_Cache is wired in task 7.20; these cases do not depend on it (the cache stub always misses).
import { describe, expect, it } from 'vitest';
import { createHttpClient } from '../../../adapters/http/http-client';
import { createNpmSource } from '../../../adapters/npm/npm-source';
import { GITHUB_BUDGET_THRESHOLD, RETRY_AFTER_MAX_MS } from '../../../pipeline/constants';
import type { IsoInstant } from '../../../pipeline/mapping';
import type { AttemptGate, SourceName, SourceResult } from '../../../pipeline/ports';
import { createScanProgress, runScan } from '../../../pipeline/scan/run-scan';
import type { ScanDeps, ScanInput, ScanNote, ScanResult } from '../../../pipeline/scan/types';
import { createFakeRuntime, runUntilSettled } from '../../support/fake-runtime';
import type { FakeRuntime } from '../../support/fake-runtime';
import { createScriptedFetch, scriptFromSteps } from '../../support/scripted-fetch';

const SHA = 'a'.repeat(40);
const AS_OF = '2024-06-01T00:00:00.000Z' as IsoInstant;
const START_MS = Date.parse(AS_OF);

const ok = (body: unknown): SourceResult =>
  ({ kind: 'ok', status: 200, body, headers: {}, fromCache: false }) as SourceResult;
const absent: SourceResult = { kind: 'absent', headers: {}, fromCache: false };
const failed: SourceResult = { kind: 'failed', reason: 'http-error', status: 500, headers: null };

const CARGO_TOML = '[dependencies]\nfailure = "0.1.0"\n';
const PACKAGE_JSON = JSON.stringify({ dependencies: { 'left-pad': '1.0.0' } });

/** deps.dev package document (EF-1) with one default version. */
const packageDoc = (version: string, isDeprecated: boolean) => ({
  versions: [
    {
      versionKey: { version },
      publishedAt: '2020-01-01T00:00:00Z',
      isDefault: true,
      isDeprecated,
    },
  ],
});

interface WorldOptions {
  manifestPath: 'Cargo.toml' | 'package.json';
  manifestText: string;
  version: string;
  /** `isDeprecated` of the deps.dev package document. */
  isDeprecated?: boolean;
  /** OSV ids returned by the batch query. */
  osvIds?: readonly string[];
  /** OSV detail bodies by id (EF-6). */
  osvAdvisories?: Readonly<Record<string, unknown>>;
  /** deps.dev advisory answers by id (EF-25). Missing id: absent. */
  depsdevAdvisories?: Readonly<Record<string, SourceResult>>;
  /** `github.com/owner/repo` to return as Source_Repo of every version document. */
  sourceRepo?: string;
  hasToken?: boolean;
  /** Called with the gate on every manifest text request (the real raw request carries no budget). */
  onManifestText?: (gate: AttemptGate) => void;
  /** Replaces the npm port (case 7 uses the real adapter on a scripted fetch). */
  npm?: ScanDeps['sources']['npm'];
}

function buildWorld(options: WorldOptions) {
  const githubCalls: string[] = [];
  const graphqlQueries: string[] = [];
  const systemOf = options.manifestPath === 'Cargo.toml' ? 'CARGO' : 'NPM';

  const github: ScanDeps['sources']['github'] = {
    hasToken: () => options.hasToken ?? true,
    getRepository: () => {
      githubCalls.push('repository');
      return Promise.resolve(ok({ full_name: 'o/r', default_branch: 'main', private: false }));
    },
    getBranch: () => {
      githubCalls.push('branch');
      return Promise.resolve(ok({ commit: { sha: SHA } }));
    },
    getTree: () => {
      githubCalls.push('tree');
      return Promise.resolve(
        ok({
          truncated: false,
          tree: [{ path: options.manifestPath, type: 'blob', size: 10, sha: 'f'.repeat(40) }],
        }),
      );
    },
    getManifestText: (_ref, _sha, _path, _treeSha, _ctx, gate) => {
      githubCalls.push('manifest');
      options.onManifestText?.(gate);
      return Promise.resolve({
        kind: 'ok',
        status: 200,
        body: options.manifestText,
        headers: {},
        fromCache: false,
      } as SourceResult<string>);
    },
    queryRepositories: (query) => {
      githubCalls.push('graphql');
      graphqlQueries.push(query);
      return Promise.resolve(ok({ data: {} }));
    },
  };

  const versionDoc = (name: string) => ({
    request: { versionKey: { system: systemOf, name, version: options.version } },
    version:
      options.sourceRepo === undefined
        ? {}
        : {
            relatedProjects: [
              { relationType: 'SOURCE_REPO', projectKey: { id: options.sourceRepo } },
            ],
          },
  });

  const osvIds = options.osvIds ?? [];
  const sources: ScanDeps['sources'] = {
    github,
    depsdev: {
      getPackage: () => Promise.resolve(ok(packageDoc(options.version, options.isDeprecated ?? false))),
      getVersion: () => Promise.resolve(failed),
      getVersionBatch: (requests) =>
        Promise.resolve(ok({ responses: requests.map((r) => versionDoc(r.name)) })),
      getAdvisory: (id) => Promise.resolve(options.depsdevAdvisories?.[id] ?? absent),
    },
    osv: {
      queryBatch: (queries) =>
        Promise.resolve(
          ok({
            results: queries.map(() =>
              osvIds.length === 0 ? {} : { vulns: osvIds.map((id) => ({ id, modified: '2020-01-01T00:00:00Z' })) },
            ),
          }),
        ),
      getVulnerability: (id) => {
        const body = options.osvAdvisories?.[id];
        return Promise.resolve(body === undefined ? absent : ok(body));
      },
    },
    npm:
      options.npm ??
      ({
        getLatest: () => Promise.resolve(ok({ maintainers: [{ name: 'a' }, { name: 'b' }] })),
      } as ScanDeps['sources']['npm']),
    cratesio: {
      getOwners: () =>
        Promise.resolve(ok({ users: [{ login: 'a', kind: 'user' }, { login: 'b', kind: 'user' }] })),
    },
    pypi: { getProject: () => Promise.resolve(absent) },
  };
  return { sources, githubCalls, graphqlQueries };
}

function makeDeps(
  sources: ScanDeps['sources'],
  runtime: FakeRuntime,
  progress = createScanProgress(),
  timer: ScanDeps['timer'] = runtime.timer,
): ScanDeps {
  return {
    sources,
    clock: runtime.clock,
    timer,
    random: runtime.random,
    logger: { log: () => undefined },
    scanCache: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
    config: {
      apiUrl: 'https://api.github.com',
      graphqlUrl: 'https://api.github.com/graphql',
      webHost: 'github.com',
    },
    limits: { maxManifests: 10, maxDependencies: 300, maxAdvisoryDetails: 500 },
    progress,
  };
}

const input = (runtime: FakeRuntime): ScanInput => ({
  repo: { host: 'github.com', owner: 'o', repo: 'r', branch: null },
  manifests: [],
  asOf: AS_OF,
  startedAtMs: runtime.clock(),
});

async function scanResult(promise: Promise<Awaited<ReturnType<typeof runScan>>>): Promise<ScanResult> {
  const outcome = await promise;
  if (!outcome.ok) throw new Error(`scan failed: ${outcome.error.code}`);
  return outcome.value;
}

async function runPlain(options: WorldOptions) {
  const runtime = createFakeRuntime(START_MS);
  const world = buildWorld(options);
  const result = await scanResult(runScan(input(runtime), makeDeps(world.sources, runtime)));
  return { result, ...world };
}

const notesOf = (result: ScanResult, code: ScanNote['code']): ScanNote[] =>
  result.notes.filter((n) => n.code === code);

describe('R23.12 case 7: 429 with Retry-After above RETRY_AFTER_MAX_MS', () => {
  it('ends the Work_Unit failed with reason rate-limited, without a wait or a further attempt', async () => {
    const runtime = createFakeRuntime(START_MS);
    const retryAfterSeconds = RETRY_AFTER_MAX_MS / 1000 + 1;
    const scripted = createScriptedFetch(
      scriptFromSteps([
        {
          latencyMs: 0,
          response: { status: 429, headers: [['Retry-After', String(retryAfterSeconds)]] },
        },
      ]),
      runtime,
    );
    const sleeps: number[] = [];
    const timer: ScanDeps['timer'] = {
      ...runtime.timer,
      sleep: (ms, signal) => {
        sleeps.push(ms);
        return runtime.timer.sleep(ms, signal);
      },
    };
    const sourceNames: SourceName[] = ['github', 'depsdev', 'osv', 'npm', 'cratesio', 'pypi'];
    const client = createHttpClient({
      fetchImpl: scripted.fetch,
      clock: runtime.clock,
      timer,
      random: runtime.random,
      logger: { log: () => undefined },
      limiters: Object.fromEntries(
        sourceNames.map((name) => [name, { concurrency: 4, minIntervalMs: 0 }]),
      ) as Record<SourceName, { concurrency: number; minIntervalMs: number }>,
      authorizer: () => null,
      secrets: () => [],
      userAgent: 'gravekeeper-test',
    });
    const world = buildWorld({
      manifestPath: 'package.json',
      manifestText: PACKAGE_JSON,
      version: '1.0.0',
      npm: createNpmSource(client),
    });
    const progress = createScanProgress();

    const result = await scanResult(
      runUntilSettled(
        runScan(input(runtime), makeDeps(world.sources, runtime, progress, timer)),
        runtime,
      ),
    );

    expect(retryAfterSeconds * 1000).toBeGreaterThan(RETRY_AFTER_MAX_MS);
    expect(scripted.calls).toHaveLength(1);
    expect(scripted.calls[0]?.url).toBe('https://registry.npmjs.org/left-pad/latest');
    expect(sleeps).toEqual([]);
    const npmUnits = progress.ledger.filter((entry) => entry.source === 'npm');
    expect(npmUnits).toHaveLength(1);
    expect(npmUnits[0]?.outcome).toEqual({ ok: false, reason: 'rate-limited' });
    expect(result.sources.npm).toBe('failed');
  });
});

describe('R23.12 case 8: GitHub_Budget drops below GITHUB_BUDGET_THRESHOLD during the scan', () => {
  it('sends no further GitHub request and adds exactly one github-budget-low note', async () => {
    const low = GITHUB_BUDGET_THRESHOLD - 1;
    const { result, githubCalls, graphqlQueries } = await runPlain({
      manifestPath: 'Cargo.toml',
      manifestText: CARGO_TOML,
      version: '0.1.0',
      sourceRepo: 'github.com/rust-lang-nursery/failure',
      hasToken: true,
      onManifestText: (gate) => gate.observe({ 'x-ratelimit-remaining': String(low) }),
    });

    expect(githubCalls).toEqual(['repository', 'branch', 'tree', 'manifest']);
    expect(graphqlQueries).toEqual([]);
    const budgetNotes = notesOf(result, 'github-budget-low');
    expect(budgetNotes).toHaveLength(1);
    expect(budgetNotes[0]?.details).toMatchObject({ remaining: low });
    expect(result.dependencies[0]?.facts.archived).toBeNull();
    expect(result.dependencies[0]?.facts.daysSinceLastCommit).toBeNull();
  });
});

const rustsec = (informational: string, id = 'RUSTSEC-2020-0036') => ({
  id,
  aliases: [],
  affected: [{ package: { name: 'failure' }, database_specific: { informational } }],
});

describe('R23.12 case 9: informational RustSec advisory', () => {
  it('is not counted and adds an informational-advisory-excluded note', async () => {
    const { result } = await runPlain({
      manifestPath: 'Cargo.toml',
      manifestText: CARGO_TOML,
      version: '0.1.0',
      osvIds: ['RUSTSEC-2021-0001'],
      osvAdvisories: { 'RUSTSEC-2021-0001': rustsec('notice', 'RUSTSEC-2021-0001') },
    });

    expect(result.dependencies[0]?.facts.openVulnerabilityCount).toBe(0);
    const excluded = notesOf(result, 'informational-advisory-excluded');
    expect(excluded).toHaveLength(1);
    expect(excluded[0]?.details).toMatchObject({
      ecosystem: 'cargo',
      name: 'failure',
      ids: ['RUSTSEC-2021-0001'],
    });
  });
});

describe('R23.12 case 10: cargo unmaintained advisory (RUSTSEC-2020-0036)', () => {
  const base = {
    manifestPath: 'Cargo.toml',
    manifestText: CARGO_TOML,
    version: '0.1.0',
    isDeprecated: false,
    osvIds: ['RUSTSEC-2020-0036'],
    depsdevAdvisories: { 'RUSTSEC-2020-0036': ok({ advisoryKey: { id: 'RUSTSEC-2020-0036' }, cvss3Score: 9.8 }) },
  } as const;

  it('sets deprecated true, names the advisory id in an unmaintained-advisory note and excludes it from the count', async () => {
    const { result } = await runPlain({
      ...base,
      osvAdvisories: { 'RUSTSEC-2020-0036': rustsec('unmaintained') },
    });

    const facts = result.dependencies[0]?.facts;
    expect(facts?.deprecated).toBe(true);
    expect(facts?.openVulnerabilityCount).toBe(0);
    const notes = notesOf(result, 'unmaintained-advisory');
    expect(notes).toHaveLength(1);
    expect(notes[0]?.details).toMatchObject({
      ecosystem: 'cargo',
      name: 'failure',
      ids: ['RUSTSEC-2020-0036'],
    });
  });

  it('leaves deprecated false for the same advisory marked informational unsound', async () => {
    const { result } = await runPlain({
      ...base,
      osvAdvisories: { 'RUSTSEC-2020-0036': rustsec('unsound') },
    });

    const facts = result.dependencies[0]?.facts;
    expect(facts?.deprecated).toBe(false);
    expect(facts?.openVulnerabilityCount).toBe(0);
    expect(notesOf(result, 'unmaintained-advisory')).toEqual([]);
  });
});

describe('R23.12 case 12: deps.dev score against OSV severity', () => {
  const base = {
    manifestPath: 'Cargo.toml',
    manifestText: CARGO_TOML,
    version: '0.1.0',
    osvIds: ['GHSA-aaaa-bbbb-cccc'],
    osvAdvisories: {
      'GHSA-aaaa-bbbb-cccc': {
        id: 'GHSA-aaaa-bbbb-cccc',
        aliases: [],
        database_specific: { severity: 'LOW' },
      },
    },
  } as const;

  it('uses the deps.dev cvss3Score 9.8 over OSV severity LOW: CRITICAL', async () => {
    const { result } = await runPlain({
      ...base,
      depsdevAdvisories: {
        'GHSA-aaaa-bbbb-cccc': ok({ advisoryKey: { id: 'GHSA-aaaa-bbbb-cccc' }, cvss3Score: 9.8 }),
      },
    });

    expect(result.dependencies[0]?.facts.openVulnerabilityCount).toBe(1);
    expect(result.dependencies[0]?.facts.maxSeverity).toBe('CRITICAL');
  });

  it('falls back to the OSV severity LOW when the deps.dev request failed', async () => {
    const { result } = await runPlain({
      ...base,
      depsdevAdvisories: { 'GHSA-aaaa-bbbb-cccc': failed },
    });

    expect(result.dependencies[0]?.facts.openVulnerabilityCount).toBe(1);
    expect(result.dependencies[0]?.facts.maxSeverity).toBe('LOW');
  });
});
