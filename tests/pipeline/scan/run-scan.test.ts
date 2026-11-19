// Requirement 23.12, cases 1 to 6 (stubbed Source_Ports)
import { describe, expect, it } from 'vitest';
import { createHttpClient } from '../../../adapters/http/http-client';
import { createDepsDevSource } from '../../../adapters/depsdev/depsdev-source';
import { RETRY_AFTER_MAX_MS } from '../../../pipeline/constants';
import type {
  CratesIoSource,
  DepsDevSource,
  GithubSource,
  NpmSource,
  OsvSource,
  PypiSource,
  SourceName,
  SourceResult,
} from '../../../pipeline/ports';
import { createScanProgress, runScan } from '../../../pipeline/scan/run-scan';
import type { Result } from '../../../core';
import type { ScanDeps, ScanError, ScanOutcome, ScanResult } from '../../../pipeline/scan/types';
import { createFakeRuntime, runUntilSettled } from '../../support/fake-runtime';
import type { FakeRuntime } from '../../support/fake-runtime';
import { createScriptedFetch } from '../../support/scripted-fetch';

const AS_OF = '2024-01-11T00:00:00.000Z';
const RESET = '2024-01-11T01:00:00.000Z';
const SHA = 'a'.repeat(40);
const START_MS = 1_000_000;

// ---------------------------------------------------------------- scripted source builders

const HEADERS = {};
const okResult = (body: unknown): SourceResult =>
  ({ kind: 'ok', status: 200, body, headers: HEADERS, fromCache: false }) as SourceResult;
const absentResult: SourceResult = { kind: 'absent', headers: HEADERS, fromCache: false };

interface PackageSpec {
  /** Source_Repo `owner/name` that deps.dev reports for the selected version. */
  readonly repo?: string;
  /** 404 for the package document (EF-1). */
  readonly missing?: boolean;
}

interface WorldOptions {
  readonly token: boolean;
  readonly packages: Readonly<Record<string, PackageSpec>>;
  readonly truncatedTree?: boolean;
  /** Answers one GraphQL request. Default: a live, non-archived repository per alias. */
  readonly graphql?: (variables: Readonly<Record<string, string>>) => unknown;
}

interface GraphqlCall {
  readonly query: string;
  readonly variables: Readonly<Record<string, string>>;
}

/** Aliases of a GraphQL request, in variable order. */
function aliasesOf(variables: Readonly<Record<string, string>>): string[] {
  return Object.keys(variables)
    .filter((k) => k.endsWith('Owner'))
    .map((k) => k.slice(0, -'Owner'.length));
}

const liveNode = (archived = false, committedDate = '2024-01-01T00:00:00Z') => ({
  nameWithOwner: 'x/y',
  isArchived: archived,
  defaultBranchRef: { target: { committedDate } },
});

function defaultGraphql(variables: Readonly<Record<string, string>>): unknown {
  const data: Record<string, unknown> = { rateLimit: { remaining: 4000, resetAt: RESET } };
  for (const alias of aliasesOf(variables)) data[alias] = liveNode();
  return { data };
}

function packageDocument(name: string): unknown {
  return {
    versions: [
      {
        versionKey: { system: 'NPM', name, version: '1.0.0' },
        isDefault: true,
        isDeprecated: false,
        publishedAt: '2023-12-31T00:00:00Z',
      },
    ],
  };
}

function versionDocument(repo: string | undefined): unknown {
  return {
    relatedProjects:
      repo === undefined
        ? []
        : [{ relationType: 'SOURCE_REPO', projectKey: { id: `github.com/${repo}` } }],
  };
}

function manifestText(names: readonly string[]): string {
  return JSON.stringify({ dependencies: Object.fromEntries(names.map((n) => [n, '1.0.0'])) });
}

interface World {
  readonly github: GithubSource;
  readonly depsdev: DepsDevSource;
  readonly osv: OsvSource;
  readonly npm: NpmSource;
  readonly cratesio: CratesIoSource;
  readonly pypi: PypiSource;
  readonly graphqlCalls: GraphqlCall[];
}

/** Six scripted Source_Ports for an npm repository whose package.json lists `packages`. */
function createWorld(options: WorldOptions): World {
  const names = Object.keys(options.packages);
  const graphqlCalls: GraphqlCall[] = [];
  const answer = options.graphql ?? defaultGraphql;

  const github: GithubSource = {
    hasToken: () => options.token,
    getRepository: () =>
      Promise.resolve(okResult({ full_name: 'Owner/Repo', default_branch: 'main', private: false })),
    getBranch: () => Promise.resolve(okResult({ commit: { sha: SHA } })),
    getTree: () =>
      Promise.resolve(
        okResult({
          tree: [{ path: 'package.json', type: 'blob', size: 100, sha: 'b'.repeat(40) }],
          truncated: options.truncatedTree === true,
        }),
      ),
    getManifestText: () => Promise.resolve(okResult(manifestText(names)) as SourceResult<string>),
    queryRepositories: (query, variables) => {
      graphqlCalls.push({ query, variables });
      return Promise.resolve(okResult(answer(variables)));
    },
  };

  const depsdev: DepsDevSource = {
    getPackage: (_system, name) => {
      const spec = options.packages[name];
      if (spec === undefined || spec.missing === true) return Promise.resolve(absentResult);
      return Promise.resolve(okResult(packageDocument(name)));
    },
    getVersion: (_system, name) => Promise.resolve(okResult(versionDocument(options.packages[name]?.repo))),
    getVersionBatch: (requests) =>
      Promise.resolve(
        okResult({
          responses: requests.map((r) => ({
            request: { versionKey: { system: r.system.toUpperCase(), name: r.name, version: r.version } },
            version: versionDocument(options.packages[r.name]?.repo),
          })),
        }),
      ),
    getAdvisory: () => Promise.resolve(absentResult),
  };

  const osv: OsvSource = {
    queryBatch: (queries) => Promise.resolve(okResult({ results: queries.map(() => ({})) })),
    getVulnerability: () => Promise.resolve(absentResult),
  };
  const npm: NpmSource = {
    getLatest: () => Promise.resolve(okResult({ maintainers: [{ name: 'a' }, { name: 'b' }] })),
  };
  const cratesio: CratesIoSource = { getOwners: () => Promise.resolve(absentResult) };
  const pypi: PypiSource = { getProject: () => Promise.resolve(absentResult) };

  return { github, depsdev, osv, npm, cratesio, pypi, graphqlCalls };
}

function createDeps(world: World, runtime: FakeRuntime, extra: Partial<ScanDeps> = {}): ScanDeps {
  return {
    sources: {
      github: world.github,
      depsdev: world.depsdev,
      osv: world.osv,
      npm: world.npm,
      cratesio: world.cratesio,
      pypi: world.pypi,
    },
    clock: runtime.clock,
    timer: runtime.timer,
    random: runtime.random,
    logger: { log: () => undefined },
    scanCache: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
    config: {
      apiUrl: 'https://api.github.com',
      graphqlUrl: 'https://api.github.com/graphql',
      webHost: 'github.com',
    },
    limits: { maxManifests: 10, maxDependencies: 100, maxAdvisoryDetails: 50 },
    ...extra,
  };
}

async function scan(world: World, extra: Partial<ScanDeps> = {}): Promise<ScanResult> {
  const runtime = createFakeRuntime(START_MS);
  const outcome = await runUntilSettled(
    runScan(
      {
        repo: { host: 'github.com', owner: 'owner', repo: 'repo', branch: null },
        manifests: [],
        asOf: AS_OF as never,
        startedAtMs: runtime.clock(),
      },
      createDeps(world, runtime, extra),
    ),
    runtime,
  );
  return expectOk(outcome);
}

function expectOk(outcome: Result<ScanOutcome, ScanError>): ScanResult {
  if (!outcome.ok) throw new Error(`scan failed: ${outcome.error.code}`);
  expect(outcome.value.fromCache).toBe(false);
  return outcome.value.result;
}

const factsOf = (result: ScanResult, name: string) => {
  const entry = result.dependencies.find((d) => d.dependency.name === name);
  if (entry === undefined) throw new Error(`no dependency ${name}`);
  return entry.facts;
};

const noteCodes = (result: ScanResult): string[] => result.notes.map((n) => n.code);

// ---------------------------------------------------------------------------------- cases

describe('runScan with stubbed Source_Ports (R23.12)', () => {
  it('R23.12.1 unauthenticated scan without Token: github facts null, no GraphQL request, one github-token-missing note (R11.8)', async () => {
    const world = createWorld({
      token: false,
      packages: { alpha: { repo: 'acme/alpha' }, beta: { repo: 'acme/beta' } },
    });
    const result = await scan(world);

    expect(world.graphqlCalls).toHaveLength(0);
    for (const name of ['alpha', 'beta']) {
      const facts = factsOf(result, name);
      expect(facts.archived).toBeNull();
      expect(facts.daysSinceLastCommit).toBeNull();
    }
    expect(result.dependencies).toHaveLength(2);
    expect(result.notes.filter((n) => n.code === 'github-token-missing')).toHaveLength(1);
  });

  it('R23.12.2 truncated tree: truncatedTree true and one tree-truncated note (R4.6)', async () => {
    const world = createWorld({ token: true, packages: { alpha: {} }, truncatedTree: true });
    const result = await scan(world);

    expect(result.discovery.truncatedTree).toBe(true);
    expect(result.notes.filter((n) => n.code === 'tree-truncated')).toHaveLength(1);
  });

  it('R23.12.3 GraphQL partial answer with one NOT_FOUND alias: null facts for it, others keep data, no source-failed or source-partial note (R11.5)', async () => {
    const world = createWorld({
      token: true,
      packages: {
        alpha: { repo: 'acme/aaa' },
        beta: { repo: 'acme/bbb' },
        gamma: { repo: 'acme/ccc' },
      },
      graphql: () => ({
        data: {
          rateLimit: { remaining: 4000, resetAt: RESET },
          r0: liveNode(true, '2024-01-01T00:00:00Z'),
          r1: null,
          r2: liveNode(false, '2023-12-22T00:00:00Z'),
        },
        errors: [{ type: 'NOT_FOUND', path: ['r1'], message: 'Could not resolve' }],
      }),
    });
    const result = await scan(world);

    // Aliases follow the ascending lowercase repository order: r1 is acme/bbb.
    expect(world.graphqlCalls).toHaveLength(1);
    expect(world.graphqlCalls[0]?.variables['r1Owner']).toBe('acme');
    expect(world.graphqlCalls[0]?.variables['r1Name']).toBe('bbb');

    expect(factsOf(result, 'beta')).toMatchObject({ archived: null, daysSinceLastCommit: null });
    expect(factsOf(result, 'alpha')).toMatchObject({ archived: true, daysSinceLastCommit: 10 });
    expect(factsOf(result, 'gamma')).toMatchObject({ archived: false, daysSinceLastCommit: 20 });
    expect(noteCodes(result)).not.toContain('source-failed');
    expect(noteCodes(result)).not.toContain('source-partial');
    expect(result.sources.github).toBe('ok');
  });

  it('R23.12.4 renamed repository: the Lookup_Target receives the data of the repository GraphQL resolved (R11.2)', async () => {
    const world = createWorld({
      token: true,
      packages: { alpha: { repo: 'oldowner/oldname' } },
      graphql: (variables) => ({
        data: {
          rateLimit: { remaining: 4000, resetAt: RESET },
          // GraphQL follows the rename and answers with the repository's new identity.
          [aliasesOf(variables)[0] as string]: {
            nameWithOwner: 'newowner/newname',
            isArchived: true,
            defaultBranchRef: { target: { committedDate: '2024-01-06T00:00:00Z' } },
          },
        },
      }),
    });
    const result = await scan(world);

    expect(world.graphqlCalls).toHaveLength(1);
    expect(world.graphqlCalls[0]?.variables).toEqual({ r0Owner: 'oldowner', r0Name: 'oldname' });
    expect(factsOf(result, 'alpha')).toMatchObject({ archived: true, daysSinceLastCommit: 5 });
  });

  it('R23.12.5 404 package: all facts of EF-1 are null and the Work_Unit ends ok (EF-1)', async () => {
    const world = createWorld({ token: true, packages: { ghost: { missing: true } } });
    const progress = createScanProgress();
    const result = await scan(world, { progress });

    const facts = factsOf(result, 'ghost');
    expect(facts.daysSinceLastRelease).toBeNull();
    expect(facts.deprecated).toBeNull();

    const unit = progress.ledger.find((e) => e.source === 'depsdev' && e.unitKey === 'pkg:npm:ghost');
    expect(unit?.outcome).toEqual({ ok: true });
    expect(result.sources.depsdev).toBe('ok');
    expect(noteCodes(result)).toContain('package-not-found');
  });

  it('R23.12.6 429 with Retry-After at most RETRY_AFTER_MAX_MS: the Adapter waits that long on the injected timer, then sends a further attempt (R15.7)', async () => {
    const retryAfterSeconds = 2;
    expect(retryAfterSeconds * 1000).toBeLessThanOrEqual(RETRY_AFTER_MAX_MS);

    const runtime = createFakeRuntime(START_MS, [0.9]);
    const packageUrl = 'https://api.deps.dev/v3/systems/npm/packages/alpha';
    const scripted = createScriptedFetch(
      (url, attemptIndex) => {
        if (url === packageUrl && attemptIndex === 0) {
          return {
            latencyMs: 0,
            response: { status: 429, headers: [['retry-after', String(retryAfterSeconds)]] },
          };
        }
        const body =
          url === packageUrl
            ? packageDocument('alpha')
            : url.endsWith('/v3alpha/versionbatch')
              ? {
                  responses: [
                    {
                      request: { versionKey: { system: 'NPM', name: 'alpha', version: '1.0.0' } },
                      version: versionDocument(undefined),
                    },
                  ],
                }
              : {};
        return {
          latencyMs: 0,
          response: { status: 200, body: { kind: 'text', text: JSON.stringify(body) } },
        };
      },
      runtime,
    );
    const names: SourceName[] = ['github', 'depsdev', 'osv', 'npm', 'cratesio', 'pypi'];
    const limiters = Object.fromEntries(names.map((n) => [n, { concurrency: 4, minIntervalMs: 0 }])) as Record<
      SourceName,
      { concurrency: number; minIntervalMs: number }
    >;
    const client = createHttpClient({
      fetchImpl: scripted.fetch,
      clock: runtime.clock,
      timer: runtime.timer,
      random: runtime.random,
      logger: { log: () => undefined },
      limiters,
      authorizer: () => null,
      secrets: () => [],
      userAgent: 'gravekeeper-test',
    });

    const world = createWorld({ token: true, packages: { alpha: {} } });
    const deps = createDeps({ ...world, depsdev: createDepsDevSource(client) }, runtime);
    const progress = createScanProgress();
    const outcome = await runUntilSettled(
      runScan(
        {
          repo: { host: 'github.com', owner: 'owner', repo: 'repo', branch: null },
          manifests: [],
          asOf: AS_OF as never,
          startedAtMs: runtime.clock(),
        },
        { ...deps, progress },
      ),
      runtime,
    );
    const result = expectOk(outcome);

    const packageCalls = scripted.calls.filter((c) => c.url === packageUrl);
    expect(packageCalls).toHaveLength(2);
    expect(packageCalls[0]?.sentAtMs).toBe(START_MS);
    expect(packageCalls[1]?.sentAtMs).toBe(START_MS + retryAfterSeconds * 1000);

    const unit = progress.ledger.find((e) => e.source === 'depsdev' && e.unitKey === 'pkg:npm:alpha');
    expect(unit?.outcome).toEqual({ ok: true });
    // The second attempt's document was used: the release of 2023-12-31 is 11 days before asOf.
    expect(factsOf(result, 'alpha').daysSinceLastRelease).toBe(11);
  });
});
