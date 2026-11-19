// Requirements 3.11, 17.10, 17.11
// Properties of `runScan` against scripted sources. The harness at the top (world, faults, ports,
// runner) is shared with the later scan properties appended to this file.
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseManifest, summarize } from '../../../core';
import type { ManifestFormat, RawHealthFacts } from '../../../core';
import { REQUEST_TIMEOUT_MS } from '../../../pipeline/constants';
import type { SourceName, SourceResult } from '../../../pipeline/ports';
import { runScan } from '../../../pipeline/scan/run-scan';
import type { ScanDeps, ScanInput, ScanOutcome, ScanResult } from '../../../pipeline/scan/types';
import { arbJson } from '../../support/arbitraries/json';
import { scriptStep } from '../../support/arbitraries/scripts';
import { createFakeRuntime } from '../../support/fake-runtime';
import { cfg } from '../../support/fc-config';
import type { Step } from '../../support/scripted-fetch';

// ---------------------------------------------------------------------------------------------
// Harness: a generated world served by scripted ports
// ---------------------------------------------------------------------------------------------

const SOURCES: readonly SourceName[] = ['github', 'depsdev', 'osv', 'npm', 'cratesio', 'pypi'];
const ECOSYSTEMS = ['npm', 'pypi', 'cargo'] as const;
type Eco = (typeof ECOSYSTEMS)[number];

const AS_OF = '2024-06-01T00:00:00.000Z';
const START_MS = Date.parse(AS_OF);
const DAY = 86_400_000;
const SHA = 'a'.repeat(40);
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

interface Pkg {
  readonly ecosystem: Eco;
  readonly name: string;
  /** Manifest spec is an exact pin of an existing version, otherwise a range (default version). */
  readonly pinned: boolean;
  /** deps.dev knows the package (otherwise 404). */
  readonly found: boolean;
  readonly releaseDays: number;
  readonly deprecated: boolean;
  /** Index into `World.repos`, or null when the version document has no SOURCE_REPO. */
  readonly repoIndex: number | null;
  readonly vulns: number;
  readonly maintainers: number;
}

interface RepoFacts {
  readonly archived: boolean;
  readonly commitDays: number;
}

/** Optional additions used by the unassessed/shared-target property (P39); absent in the base worlds. */
interface Extras {
  /** Git dependencies (npm `github:` specs, cargo `git`) listed next to the registry ones. */
  readonly git: number;
  /** Path dependencies (npm `file:` specs, cargo `path`). */
  readonly path: number;
  /** The first N npm packages are also listed in devDependencies (same target, other scope). */
  readonly devDup: number;
  /** The next npm package after those in devDependencies is a git spec under a registry name. */
  readonly gitShadow: boolean;
  /** `sub/package.json` repeats every npm package with the opposite pin (same target, other manifest). */
  readonly sub: boolean;
}

interface World {
  readonly pkgs: readonly Pkg[];
  readonly repos: readonly RepoFacts[];
  readonly extras?: Extras;
}

const PREFIX: Record<Eco, string> = { npm: 'n', pypi: 'p', cargo: 'c' };

const pkgArb = (ecosystem: Eco, index: number): fc.Arbitrary<Pkg> =>
  fc.record({
    ecosystem: fc.constant(ecosystem),
    name: fc.constant(`${PREFIX[ecosystem]}${index}`),
    pinned: fc.boolean(),
    found: fc.integer({ min: 0, max: 9 }).map((n) => n > 0),
    releaseDays: fc.integer({ min: 1, max: 3000 }),
    deprecated: fc.boolean(),
    repoIndex: fc.option(fc.integer({ min: 0, max: 2 }), { nil: null }),
    vulns: fc.integer({ min: 0, max: 3 }),
    maintainers: fc.integer({ min: 0, max: 3 }),
  });

const worldArb: fc.Arbitrary<World> = fc
  .tuple(fc.integer({ min: 0, max: 3 }), fc.integer({ min: 0, max: 3 }), fc.integer({ min: 0, max: 3 }))
  .chain(([npm, pypi, cargo]) =>
    fc.record({
      pkgs: fc.tuple(
        ...ECOSYSTEMS.flatMap((eco) =>
          Array.from({ length: { npm, pypi, cargo }[eco] }, (_, i) => pkgArb(eco, i)),
        ),
      ) as fc.Arbitrary<readonly Pkg[]>,
      repos: fc.array(
        fc.record({ archived: fc.boolean(), commitDays: fc.integer({ min: 0, max: 3000 }) }),
        { minLength: 3, maxLength: 3 },
      ),
    }),
  );

type Failure = Exclude<SourceResult, { readonly kind: 'ok' } | { readonly kind: 'absent' }>;

/** Turns one scripted fetch step (scripts.ts) into the failed result a source port would report. */
function failureOf(step: Step): Failure {
  const { latencyMs, response } = step;
  if (latencyMs === 'never' || latencyMs >= REQUEST_TIMEOUT_MS) {
    return { kind: 'failed', reason: 'timeout', status: null, headers: null };
  }
  if (response === 'network-error') {
    return { kind: 'failed', reason: 'network', status: null, headers: null };
  }
  if (response.status >= 200 && response.status < 300) {
    return { kind: 'unparsable', status: response.status, headers: {} };
  }
  const reason = response.status === 429 ? 'rate-limited' : 'http-error';
  return { kind: 'failed', reason, status: response.status, headers: {} };
}

interface Faults {
  /** Sources whose every call fails. */
  readonly failed: ReadonlyMap<SourceName, Failure>;
  /** With github failing: manifest downloads fail too (otherwise only GraphQL). */
  readonly githubManifest: boolean;
}

const NO_FAULTS: Faults = { failed: new Map(), githubManifest: false };

const failureStep = scriptStep({ failurePercent: 100 });

/** A subset of failing sources (possibly empty or all six), each with its own failure. */
const faultsArb: fc.Arbitrary<Faults> = fc
  .record({
    github: fc.option(failureStep, { nil: null }),
    depsdev: fc.option(failureStep, { nil: null }),
    osv: fc.option(failureStep, { nil: null }),
    npm: fc.option(failureStep, { nil: null }),
    cratesio: fc.option(failureStep, { nil: null }),
    pypi: fc.option(failureStep, { nil: null }),
    githubManifest: fc.boolean(),
  })
  .map(({ githubManifest, ...steps }) => {
    const failed = new Map<SourceName, Failure>();
    for (const source of SOURCES) {
      const step = steps[source];
      if (step !== null) failed.set(source, failureOf(step));
    }
    return { failed, githubManifest };
  });

const ok = <T>(body: T): SourceResult<T> => ({
  kind: 'ok',
  status: 200,
  body,
  headers: {},
  fromCache: false,
});
const absent = (): SourceResult => ({ kind: 'absent', headers: {}, fromCache: false });

const iso = (daysAgo: number): string => new Date(START_MS - daysAgo * DAY).toISOString();

function manifestFiles(world: World): ReadonlyMap<string, string> {
  const files = new Map<string, string>();
  const of = (eco: Eco): readonly Pkg[] => world.pkgs.filter((p) => p.ecosystem === eco);
  const npm = of('npm');
  const x = world.extras;
  const gitPath = (x?.git ?? 0) + (x?.path ?? 0);
  if (npm.length > 0 || gitPath > 0) {
    const dependencies: Record<string, string> = Object.fromEntries(
      npm.map((p) => [p.name, p.pinned ? '1.0.0' : '^1.0.0']),
    );
    for (let i = 0; i < (x?.git ?? 0); i++) dependencies[`g${i}`] = `github:o/g${i}`;
    for (let i = 0; i < (x?.path ?? 0); i++) dependencies[`l${i}`] = `file:../l${i}`;
    const devDependencies: Record<string, string> = {};
    npm.slice(0, x?.devDup ?? 0).forEach((p) => {
      devDependencies[p.name] = p.pinned ? '^1.0.0' : '1.0.0';
    });
    const shadow = x?.gitShadow === true ? npm[x.devDup] : undefined;
    if (shadow !== undefined) devDependencies[shadow.name] = 'github:o/shadow';
    files.set(
      'package.json',
      JSON.stringify({
        name: 'root',
        version: '1.0.0',
        dependencies,
        ...(Object.keys(devDependencies).length > 0 ? { devDependencies } : {}),
      }),
    );
  }
  if (x?.sub === true && npm.length > 0) {
    const dependencies = Object.fromEntries(npm.map((p) => [p.name, p.pinned ? '^1.0.0' : '1.0.0']));
    files.set('sub/package.json', JSON.stringify({ name: 'sub', version: '1.0.0', dependencies }));
  }
  const pypi = of('pypi');
  if (pypi.length > 0) {
    files.set('requirements.txt', pypi.map((p) => `${p.name}${p.pinned ? '==1.0.0' : '>=1.0.0'}`).join('\n') + '\n');
  }
  const cargo = of('cargo');
  if (cargo.length > 0) {
    const lines = cargo.map((p) => `${p.name} = "${p.pinned ? '=1.0.0' : '1.0.0'}"`);
    for (let i = 0; i < (x?.git ?? 0); i++) lines.push(`cg${i} = { git = "https://github.com/o/cg${i}" }`);
    for (let i = 0; i < (x?.path ?? 0); i++) lines.push(`cl${i} = { path = "../cl${i}" }`);
    files.set('Cargo.toml', `[package]\nname = "root"\nversion = "0.1.0"\n\n[dependencies]\n${lines.join('\n')}\n`);
  }
  return files;
}

function vulnIds(p: Pkg): string[] {
  return Array.from({ length: p.vulns }, (_, j) => `V-${p.name}-${j}`);
}

interface Discovery {
  readonly repository: SourceResult;
  readonly branch: SourceResult;
}

function makeSources(world: World, faults: Faults, discovery?: Discovery): ScanDeps['sources'] {
  const files = manifestFiles(world);
  const find = (system: string, name: string): Pkg | undefined =>
    world.pkgs.find((p) => p.ecosystem === system && p.name === name);
  const failing = <T>(source: SourceName, make: () => SourceResult<T>): Promise<SourceResult<T>> =>
    Promise.resolve(faults.failed.get(source) ?? make());
  const versionDoc = (p: Pkg): unknown => {
    const repo = p.repoIndex === null ? undefined : `github.com/o${p.repoIndex}/r${p.repoIndex}`;
    return {
      relatedProjects: repo === undefined ? [] : [{ relationType: 'SOURCE_REPO', projectKey: { id: repo } }],
    };
  };

  return {
    github: {
      hasToken: () => true,
      getRepository: () =>
        Promise.resolve(
          discovery?.repository ?? ok({ full_name: 'Owner/Repo', default_branch: 'main', private: false }),
        ),
      getBranch: () => Promise.resolve(discovery?.branch ?? ok({ commit: { sha: SHA } })),
      getTree: () =>
        Promise.resolve(
          ok({
            tree: [...files.keys()].map((path) => ({ path, type: 'blob', sha: SHA, size: 100 })),
            truncated: false,
          }),
        ),
      getManifestText: (_ref, _sha, path) =>
        faults.githubManifest && faults.failed.has('github')
          ? failing('github', () => ok(''))
          : Promise.resolve(ok(files.get(path) ?? '')),
      queryRepositories: (_query, variables) =>
        failing('github', () => {
          const data: Record<string, unknown> = {};
          for (const key of Object.keys(variables)) {
            if (!key.endsWith('Owner')) continue;
            const alias = key.slice(0, -'Owner'.length);
            const owner = String(variables[key]);
            const index = Number(owner.slice(1));
            const facts = world.repos[index] ?? { archived: false, commitDays: 0 };
            data[alias] = {
              nameWithOwner: `${owner}/${String(variables[`${alias}Name`])}`,
              isArchived: facts.archived,
              isDisabled: false,
              pushedAt: iso(facts.commitDays),
              defaultBranchRef: { name: 'main', target: { oid: SHA, committedDate: iso(facts.commitDays) } },
            };
          }
          data.rateLimit = { limit: 5000, remaining: 4000, resetAt: '2030-01-01T00:00:00Z' };
          return ok({ data });
        }),
    },
    depsdev: {
      getPackage: (system, name) =>
        failing('depsdev', () => {
          const p = find(system, name);
          if (p === undefined || !p.found) return absent();
          const entry = (version: string, isDefault: boolean, days: number): unknown => ({
            versionKey: { system, name, version },
            publishedAt: iso(days),
            isDefault,
            isDeprecated: p.deprecated,
          });
          return ok({
            packageKey: { system, name },
            versions: [entry('1.0.0', false, p.releaseDays + 10), entry('2.0.0', true, p.releaseDays)],
          });
        }),
      getVersion: (system, name) =>
        failing('depsdev', () => {
          const p = find(system, name);
          return p === undefined ? absent() : ok(versionDoc(p));
        }),
      getVersionBatch: (requests) =>
        failing('depsdev', () =>
          ok({
            responses: requests.map((r) => {
              const p = find(r.system, r.name);
              return {
                request: { versionKey: { system: r.system, name: r.name, version: r.version } },
                version: p === undefined ? {} : versionDoc(p),
              };
            }),
          }),
        ),
      getAdvisory: (id) =>
        failing('depsdev', () => ok({ advisoryKey: { id }, cvss3Score: 1 + (id.length % 9) })),
    },
    osv: {
      queryBatch: (queries) =>
        failing('osv', () =>
          ok({
            results: queries.map((q) => {
              const eco = q.ecosystem === 'PyPI' ? 'pypi' : q.ecosystem === 'crates.io' ? 'cargo' : 'npm';
              const p = find(eco, q.name);
              return { vulns: p === undefined ? [] : vulnIds(p).map((id) => ({ id })) };
            }),
          }),
        ),
      getVulnerability: (id) =>
        failing('osv', () =>
          ok({
            id,
            aliases: [],
            database_specific: { severity: SEVERITIES[Number(id.slice(id.lastIndexOf('-') + 1)) % 4] },
          }),
        ),
    },
    npm: {
      getLatest: (name) =>
        failing('npm', () => {
          const p = find('npm', name);
          const maintainers = Array.from({ length: p?.maintainers ?? 0 }, (_, i) => ({ name: `m${i}` }));
          return ok({ maintainers });
        }),
    },
    cratesio: {
      getOwners: (name) =>
        failing('cratesio', () => {
          const p = find('cargo', name);
          const users = Array.from({ length: p?.maintainers ?? 0 }, (_, i) => ({ login: `u${i}`, kind: 'user' }));
          return ok({ users });
        }),
    },
    pypi: {
      getProject: (name) =>
        failing('pypi', () => {
          const p = find('pypi', name);
          const roles = Array.from({ length: p?.maintainers ?? 0 }, (_, i) => ({ role: 'Owner', user: `u${i}` }));
          return ok({ ownership: { roles, organization: null } });
        }),
    },
  };
}

interface RunOptions {
  readonly faults?: Faults;
  readonly discovery?: Discovery;
  readonly branch?: string | null;
  /** Dependency cap, default 300 (large enough that no generated world reaches it). */
  readonly maxDependencies?: number;
  /** Microtask ticks each source call waits before it runs (cycled), to vary the settling order. */
  readonly jitter?: readonly number[];
}

/** Wraps every async source method so that call n first yields `jitter[n % length]` microtask ticks. */
function withJitter(sources: ScanDeps['sources'], jitter: readonly number[]): ScanDeps['sources'] {
  let calls = 0;
  const wrap = (source: object): object =>
    Object.fromEntries(
      Object.entries(source).map(([name, fn]) => [
        name,
        name === 'hasToken'
          ? fn
          : async (...args: unknown[]): Promise<unknown> => {
              const ticks = jitter[calls++ % jitter.length] ?? 0;
              for (let i = 0; i < ticks; i++) await Promise.resolve();
              return (fn as (...a: unknown[]) => Promise<unknown>)(...args);
            },
      ]),
    );
  return Object.fromEntries(
    Object.entries(sources).map(([name, source]) => [name, wrap(source as object)]),
  ) as unknown as ScanDeps['sources'];
}

/** Runs the real `runScan` over the scripted ports. Everything settles in microtasks, no timer fires. */
function scanWorld(world: World, options: RunOptions = {}): Promise<ScanOutcome> {
  const runtime = createFakeRuntime(START_MS);
  const deps: ScanDeps = {
    sources: ((s) => (options.jitter === undefined ? s : withJitter(s, options.jitter)))(
      makeSources(world, options.faults ?? NO_FAULTS, options.discovery),
    ),
    clock: runtime.clock,
    timer: runtime.timer,
    random: runtime.random,
    logger: { log: () => undefined },
    scanCache: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
    config: { apiUrl: 'https://api.github.com', graphqlUrl: 'https://api.github.com/graphql', webHost: 'github.com' },
    limits: { maxManifests: 10, maxDependencies: options.maxDependencies ?? 300, maxAdvisoryDetails: 500 },
  };
  const input: ScanInput = {
    repo: { host: 'github.com', owner: 'owner', repo: 'repo', branch: options.branch ?? null },
    // Without an explicit list only the root manifests are scanned; `sub/package.json` must be asked for.
    manifests: world.extras?.sub === true ? [...manifestFiles(world).keys()] : [],
    asOf: AS_OF,
    startedAtMs: runtime.clock(),
  };
  return runScan(input, deps);
}

function resultOf(outcome: ScanOutcome): ScanResult {
  if (!outcome.ok) throw new Error(`scan failed: ${JSON.stringify(outcome.error)}`);
  return outcome.value;
}

const keyOf = (d: ScanResult['dependencies'][number]): string => `${d.dependency.ecosystem}:${d.dependency.name}`;

// ---------------------------------------------------------------------------------------------
// Harness sanity
// ---------------------------------------------------------------------------------------------

describe('scripted scan harness', () => {
  it('scans the generated manifests without failures and fills the facts', async () => {
    const world: World = {
      pkgs: [
        { ecosystem: 'npm', name: 'n0', pinned: true, found: true, releaseDays: 5, deprecated: false, repoIndex: 0, vulns: 2, maintainers: 2 },
        { ecosystem: 'pypi', name: 'p0', pinned: false, found: true, releaseDays: 7, deprecated: false, repoIndex: 1, vulns: 0, maintainers: 1 },
        { ecosystem: 'cargo', name: 'c0', pinned: true, found: true, releaseDays: 9, deprecated: true, repoIndex: null, vulns: 1, maintainers: 3 },
      ],
      repos: [
        { archived: true, commitDays: 3 },
        { archived: false, commitDays: 4 },
        { archived: false, commitDays: 5 },
      ],
    };
    const result = resultOf(await scanWorld(world));
    expect(result.dependencies.map(keyOf).sort()).toEqual(['cargo:c0', 'npm:n0', 'pypi:p0']);
    const facts = new Map(result.dependencies.map((d) => [keyOf(d), d.facts]));
    expect(facts.get('npm:n0')).toMatchObject({
      daysSinceLastRelease: 5,
      archived: true,
      daysSinceLastCommit: 3,
      openVulnerabilityCount: 2,
      maintainerCount: 2,
    });
    expect(facts.get('pypi:p0')).toMatchObject({ maintainerCount: 1, openVulnerabilityCount: 0 });
    expect(facts.get('cargo:c0')).toMatchObject({ deprecated: true, maintainerCount: 3, archived: null });
  });
});

// ---------------------------------------------------------------------------------------------
// Property 6 (orchestrator level)
// ---------------------------------------------------------------------------------------------

const hex40 = fc.stringMatching(/^[0-9a-f]{40}$/);

const repositoryBody: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 3, arbitrary: arbJson },
  {
    weight: 3,
    arbitrary: fc.record({
      full_name: fc.oneof(fc.constantFrom('Owner/Repo', 'a/b', 'a/b/c', '/x', 'x/', ''), arbJson),
      default_branch: fc.oneof(fc.constantFrom('main', 'dev', '', 'x'.repeat(300)), arbJson),
      private: fc.oneof(fc.boolean(), arbJson),
    }),
  },
);

const branchBody: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 3, arbitrary: arbJson },
  {
    weight: 3,
    arbitrary: fc.record({
      commit: fc.oneof(
        fc.record({
          sha: fc.oneof(hex40, hex40.map((s) => s.slice(1)), hex40.map((s) => `${s}0`), hex40.map((s) => s.toUpperCase()), arbJson),
        }),
        arbJson,
      ),
    }),
  },
);

/** Mostly `ok` with a JSON body; the other result kinds appear now and then. */
const discoveryResult = (body: fc.Arbitrary<unknown>): fc.Arbitrary<SourceResult> =>
  fc.oneof(
    { weight: 8, arbitrary: body.map((b): SourceResult => ok(b)) },
    { weight: 1, arbitrary: fc.constant(absent()) },
    { weight: 1, arbitrary: fc.constant<SourceResult>({ kind: 'unparsable', status: 200, headers: {} }) },
    { weight: 1, arbitrary: fc.constant<SourceResult>({ kind: 'failed', reason: 'http-error', status: 500, headers: null }) },
  );

const TYPED_ERRORS = ['repo-not-found', 'branch-not-found', 'upstream-unavailable'];

describe('runScan properties', () => {
  // Feature: scan-pipeline, Property 6: Repository and branch responses give a commit or a typed error
  // Validates: Requirements 3.11
  it('P6: repository and branch responses give a commit or a typed error', async () => {
    const emptyWorld: World = { pkgs: [], repos: [] };
    await fc.assert(
      fc.asyncProperty(
        discoveryResult(repositoryBody),
        discoveryResult(branchBody),
        fc.constantFrom<string | null>(null, 'main', 'dev'),
        async (repository, branch, requestedBranch) => {
          const outcome = await scanWorld(emptyWorld, { discovery: { repository, branch }, branch: requestedBranch });
          if (outcome.ok) {
            expect(outcome.value.repo.commitSha).toMatch(/^[0-9a-fA-F]{40}$/);
          } else {
            expect(TYPED_ERRORS).toContain(outcome.error.code);
          }
        },
      ),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 50: One failing source never fails the scan
  // Validates: Requirements 17.10
  it('P50: one failing source never fails the scan', async () => {
    await fc.assert(
      fc.asyncProperty(worldArb, faultsArb, async (world, faults) => {
        const outcome = await scanWorld(world, { faults });
        expect(outcome.ok).toBe(true);
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 51: Facts of failing sources are null
  // Validates: Requirements 17.11
  it('P51: facts of failing sources are null', async () => {
    // Facts per ecosystem and the sources each one is derived from (design R8 to R12).
    const sourcesOf = (eco: Eco): Record<keyof RawHealthFacts, readonly SourceName[]> => ({
      daysSinceLastRelease: ['depsdev'],
      deprecated: ['depsdev'],
      openVulnerabilityCount: ['depsdev', 'osv'],
      maxSeverity: ['depsdev', 'osv'],
      archived: ['depsdev', 'github'],
      daysSinceLastCommit: ['depsdev', 'github'],
      maintainerCount: eco === 'npm' ? ['npm'] : eco === 'cargo' ? ['cratesio'] : ['depsdev', 'pypi'],
    });
    await fc.assert(
      fc.asyncProperty(worldArb, faultsArb, async (world, generated) => {
        // Manifest downloads must succeed so that the same dependencies exist in both runs.
        const faults: Faults = { failed: generated.failed, githubManifest: false };
        const baseline = resultOf(await scanWorld(world));
        const degraded = resultOf(await scanWorld(world, { faults }));
        expect(baseline.dependencies).toHaveLength(world.pkgs.length);
        expect(degraded.dependencies.map(keyOf)).toEqual(baseline.dependencies.map(keyOf));
        const base = new Map(baseline.dependencies.map((d) => [keyOf(d), d.facts]));
        for (const dep of degraded.dependencies) {
          const expected = base.get(keyOf(dep));
          const required = sourcesOf(dep.dependency.ecosystem);
          for (const fact of Object.keys(required) as (keyof RawHealthFacts)[]) {
            const affected = required[fact].some((s) => faults.failed.has(s));
            expect([keyOf(dep), fact, dep.facts[fact]]).toEqual([
              keyOf(dep),
              fact,
              affected ? null : expected?.[fact],
            ]);
          }
        }
      }),
      cfg(),
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Scan output properties (P39, P55, P56)
// ---------------------------------------------------------------------------------------------

const extrasArb: fc.Arbitrary<Extras> = fc.record({
  git: fc.integer({ min: 0, max: 2 }),
  path: fc.integer({ min: 0, max: 2 }),
  devDup: fc.integer({ min: 0, max: 3 }),
  gitShadow: fc.boolean(),
  sub: fc.boolean(),
});

/** The base world plus git/path dependencies and targets shared across scopes and manifests. */
const extendedWorldArb: fc.Arbitrary<World> = fc
  .tuple(worldArb, extrasArb)
  .map(([world, extras]) => ({ ...world, extras }));

const NULL_KEYS: readonly (keyof RawHealthFacts)[] = [
  'daysSinceLastRelease',
  'daysSinceLastCommit',
  'archived',
  'deprecated',
  'openVulnerabilityCount',
  'maxSeverity',
  'maintainerCount',
];

describe('runScan output properties', () => {
  // Feature: scan-pipeline, Property 39: Unassessed dependencies and shared targets
  // Validates: Requirements 13.16
  it('P39: unassessed dependencies and shared targets', async () => {
    await fc.assert(
      fc.asyncProperty(
        extendedWorldArb,
        faultsArb,
        fc.option(fc.integer({ min: 1, max: 4 }), { nil: undefined }),
        async (world, generated, cap) => {
          const faults: Faults = { failed: generated.failed, githubManifest: false };
          const result = resultOf(await scanWorld(world, { faults, maxDependencies: cap }));
          expect(result.assessed).toHaveLength(result.dependencies.length);
          const skipped = new Set(result.capped.skipped.map((s) => `${s.ecosystem}:${s.name}`));
          const byTarget = new Map<string, { facts: RawHealthFacts; classification: unknown }>();
          result.dependencies.forEach((entry, i) => {
            const { dependency, facts } = entry;
            const { classification } = result.assessed[i] ?? { classification: undefined };
            const id = keyOf(entry);
            const unassessed = dependency.sourceKind !== 'registry' || skipped.has(id);
            if (unassessed) {
              expect([id, classification]).toEqual([id, null]);
              expect([id, facts]).toEqual([id, Object.fromEntries(NULL_KEYS.map((k) => [k, null]))]);
              return;
            }
            expect(classification).not.toBeNull();
            expect(classification).not.toBeUndefined();
            const first = byTarget.get(id);
            if (first === undefined) byTarget.set(id, { facts, classification });
            else {
              expect([id, facts]).toEqual([id, first.facts]);
              expect([id, classification]).toEqual([id, first.classification]);
            }
          });
        },
      ),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 55: Scan results are deterministic
  // Validates: Requirements 18.7
  it('P55: scan results are deterministic', async () => {
    await fc.assert(
      fc.asyncProperty(
        extendedWorldArb,
        faultsArb,
        fc.array(fc.integer({ min: 0, max: 6 }), { minLength: 1, maxLength: 8 }),
        fc.array(fc.integer({ min: 0, max: 6 }), { minLength: 1, maxLength: 8 }),
        async (world, faults, jitterA, jitterB) => {
          const first = await scanWorld(world, { faults, jitter: jitterA });
          const second = await scanWorld(world, { faults, jitter: jitterB });
          const plain = await scanWorld(world, { faults });
          expect(second).toEqual(first);
          expect(plain).toEqual(first);
        },
      ),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 56: The summary is the core summary
  // Validates: Requirements 18.8
  it('P56: the summary is the core summary', async () => {
    await fc.assert(
      fc.asyncProperty(extendedWorldArb, faultsArb, async (world, generated) => {
        const faults: Faults = { failed: generated.failed, githubManifest: false };
        const result = resultOf(await scanWorld(world, { faults }));
        expect(result.summary).toEqual(summarize(result.assessed));
      }),
      cfg(),
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Result shape (P57, P58)
// ---------------------------------------------------------------------------------------------

const FORMAT_OF: Readonly<Record<string, ManifestFormat>> = {
  'package.json': 'package.json',
  'requirements.txt': 'requirements.txt',
  'Cargo.toml': 'Cargo.toml',
};

/** Number of dependencies the core parsers find in the manifests of the world (the expected list length). */
function parsedDependencyCount(world: World): number {
  let total = 0;
  for (const [path, text] of manifestFiles(world)) {
    const format = FORMAT_OF[path.slice(path.lastIndexOf('/') + 1)];
    if (format !== undefined) total += parseManifest(text, format).dependencies.length;
  }
  return total;
}

describe('runScan result shape properties', () => {
  // Feature: scan-pipeline, Property 57: Result lists have matching lengths
  // Validates: Requirements 18.9
  it('P57: result lists have matching lengths', async () => {
    await fc.assert(
      fc.asyncProperty(
        extendedWorldArb,
        faultsArb,
        fc.option(fc.integer({ min: 1, max: 4 }), { nil: undefined }),
        async (world, generated, cap) => {
          const faults: Faults = { failed: generated.failed, githubManifest: false };
          const result = resultOf(await scanWorld(world, { faults, maxDependencies: cap }));
          const expected = parsedDependencyCount(world);
          expect(result.dependencies).toHaveLength(expected);
          expect(result.assessed).toHaveLength(expected);
        },
      ),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 58: Version fields are consistent
  // Validates: Requirements 18.12
  it('P58: version fields are consistent', async () => {
    await fc.assert(
      fc.asyncProperty(
        extendedWorldArb,
        faultsArb,
        fc.option(fc.integer({ min: 1, max: 4 }), { nil: undefined }),
        async (world, generated, cap) => {
          const faults: Faults = { failed: generated.failed, githubManifest: false };
          const result = resultOf(await scanWorld(world, { faults, maxDependencies: cap }));
          const byTarget = new Map<string, readonly [string | null, string | null]>();
          for (const entry of result.dependencies) {
            const id = keyOf(entry);
            const { lookupVersion, versionBasis } = entry;
            expect([id, lookupVersion === null]).toEqual([id, versionBasis === null]);
            // A git or path spec under a registry name is not a Lookup_Target: it is never looked up.
            if (entry.dependency.sourceKind !== 'registry') {
              expect([id, lookupVersion, versionBasis]).toEqual([id, null, null]);
              continue;
            }
            const seen = byTarget.get(id);
            if (seen === undefined) byTarget.set(id, [lookupVersion, versionBasis]);
            else expect([id, seen]).toEqual([id, [lookupVersion, versionBasis]]);
          }
        },
      ),
      cfg(),
    );
  });
});

describe('extended world sanity', () => {
  it('a fixed world with all extras and a small cap has git, path, cap-skipped and shared targets', async () => {
    const pkg = (ecosystem: Eco, i: number): Pkg => ({
      ecosystem,
      name: `${PREFIX[ecosystem]}${i}`,
      pinned: i % 2 === 0,
      found: true,
      releaseDays: 10,
      deprecated: false,
      repoIndex: 0,
      vulns: 1,
      maintainers: 2,
    });
    const world: World = {
      pkgs: [0, 1, 2].map((i) => pkg('npm', i)).concat([0, 1].map((i) => pkg('pypi', i)), [0, 1].map((i) => pkg('cargo', i))),
      repos: [
        { archived: false, commitDays: 1 },
        { archived: false, commitDays: 2 },
        { archived: false, commitDays: 3 },
      ],
      extras: { git: 1, path: 1, devDup: 2, gitShadow: true, sub: true },
    };
    const result = resultOf(await scanWorld(world, { maxDependencies: 4 }));
    expect(result.dependencies.some((d) => d.dependency.sourceKind === 'git')).toBe(true);
    expect(result.dependencies.some((d) => d.dependency.sourceKind === 'path')).toBe(true);
    expect(result.capped.skipped.length).toBeGreaterThan(0);
    const skipped = new Set(result.capped.skipped.map((s) => `${s.ecosystem}:${s.name}`));
    const counts = new Map<string, number>();
    for (const d of result.dependencies) {
      if (d.dependency.sourceKind === 'registry' && !skipped.has(keyOf(d))) {
        counts.set(keyOf(d), (counts.get(keyOf(d)) ?? 0) + 1);
      }
    }
    expect([...counts.values()].some((n) => n >= 2)).toBe(true);
  });
});
