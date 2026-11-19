import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ADVISORY_URL_PREFIX } from '../../../pipeline/constants';
import type { SourceResult } from '../../../pipeline/ports';
import { runScan } from '../../../pipeline/scan/run-scan';
import type { ScanDeps, ScanResult } from '../../../pipeline/scan/types';
import { createFakeRuntime, runUntilSettled } from '../../support/fake-runtime';
import { cfg } from '../../support/fc-config';

const START_MS = 1_000_000;
const SHA = 'a'.repeat(40);
const DEADLINE_MS = 5_000;

const HEADERS = {};
const okResult = (body: unknown): SourceResult =>
  ({ kind: 'ok', status: 200, body, headers: HEADERS, fromCache: false }) as SourceResult;
const absentResult: SourceResult = { kind: 'absent', headers: HEADERS, fromCache: false };
const failedResult: SourceResult = { kind: 'failed', reason: 'network', status: null, headers: null };

type OsvOutcome =
  | { readonly kind: 'ids'; readonly vulns: readonly unknown[] }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'unavailable' };

interface Pkg {
  readonly name: string;
  readonly hasVersion: boolean;
  /** The same package is also listed under devDependencies (one Lookup_Target, two Dependencies). */
  readonly dup: boolean;
  readonly osv: OsvOutcome;
}

type Detail =
  | { readonly kind: 'ok'; readonly aliases: readonly unknown[]; readonly label: unknown }
  | { readonly kind: 'invalid-body' }
  | { readonly kind: 'absent' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'deadline' };

interface Scenario {
  readonly pkgs: readonly Pkg[];
  readonly details: ReadonlyMap<string, Detail>;
  readonly cap: number;
}

// --- generators -------------------------------------------------------------------------------

const idArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom('GHSA-1', 'GHSA-2', 'CVE-1', 'RUSTSEC-1', 'A', 'b') },
  { weight: 3, arbitrary: fc.string({ unit: 'binary', minLength: 1, maxLength: 6 }) },
  { weight: 1, arbitrary: fc.constantFrom('a%20b', 'x y', '%', 'a/b?c#d', 'é', '\u{1F480}') },
);
const rawIdArb: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 6, arbitrary: idArb },
  { weight: 1, arbitrary: fc.constant('') },
  { weight: 1, arbitrary: fc.oneof(fc.integer(), fc.constant(null), fc.constant(undefined), fc.boolean()) },
);
const vulnArb: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 8, arbitrary: rawIdArb.map((id) => ({ id })) },
  { weight: 1, arbitrary: fc.constantFrom(null, 7, 'x', []) },
);
const osvArb: fc.Arbitrary<OsvOutcome> = fc.oneof(
  { weight: 6, arbitrary: fc.array(vulnArb, { maxLength: 6 }).map((vulns): OsvOutcome => ({ kind: 'ids', vulns })) },
  { weight: 1, arbitrary: fc.constant<OsvOutcome>({ kind: 'invalid' }) },
  { weight: 1, arbitrary: fc.constant<OsvOutcome>({ kind: 'unavailable' }) },
);
const pkgsArb: fc.Arbitrary<readonly Pkg[]> = fc
  .array(
    fc.record({
      hasVersion: fc.boolean(),
      dup: fc.boolean(),
      osv: osvArb,
    }),
    { minLength: 1, maxLength: 3 },
  )
  .map((list) => list.map((p, i): Pkg => ({ ...p, name: `pkg${i}` })));

const aliasArb: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom('GHSA-1', 'CVE-1', 'CVE-2', 'LOW', '') },
  { weight: 2, arbitrary: fc.string({ maxLength: 4 }) },
  { weight: 1, arbitrary: fc.constantFrom(1, null) },
);
const labelArb: fc.Arbitrary<unknown> = fc.constantFrom('LOW', 'MODERATE', 'HIGH', 'CRITICAL', 'weird', undefined);

const detailFor = (id: string): fc.Arbitrary<Detail> =>
  fc.oneof(
    {
      weight: 5,
      arbitrary: fc
        .record({ aliases: fc.array(fc.oneof(aliasArb, fc.constant(id)), { maxLength: 5 }), label: labelArb })
        .map((d): Detail => ({ kind: 'ok', ...d })),
    },
    { weight: 1, arbitrary: fc.constant<Detail>({ kind: 'invalid-body' }) },
    { weight: 1, arbitrary: fc.constant<Detail>({ kind: 'absent' }) },
    { weight: 1, arbitrary: fc.constant<Detail>({ kind: 'failed' }) },
    { weight: 1, arbitrary: fc.constant<Detail>({ kind: 'deadline' }) },
  );

/** Distinct non-empty string ids of an OSV outcome, the same as the mapping reads them. */
function idsOf(osv: OsvOutcome): string[] {
  if (osv.kind !== 'ids') return [];
  const out = new Set<string>();
  for (const v of osv.vulns) {
    const id = typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as { id?: unknown }).id : undefined;
    if (typeof id === 'string' && id !== '') out.add(id);
  }
  return [...out];
}

const scenarioArb: fc.Arbitrary<Scenario> = fc.tuple(pkgsArb, fc.integer({ min: 0, max: 8 })).chain(([pkgs, cap]) => {
  const all = [...new Set(pkgs.flatMap((p) => idsOf(p.osv)))];
  return fc.tuple(...all.map((id) => detailFor(id))).map((list) => {
    const details = new Map<string, Detail>();
    all.forEach((id, i) => details.set(id, list[i] as Detail));
    return { pkgs, details, cap };
  });
});

// --- scripted sources and the scan ------------------------------------------------------------

function codePointCompare(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = (x[i] as string).codePointAt(0)! - (y[i] as string).codePointAt(0)!;
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

function makeSources(scenario: Scenario): ScanDeps['sources'] {
  const byName = new Map(scenario.pkgs.map((p) => [p.name, p]));
  const dependencies: Record<string, string> = {};
  const devDependencies: Record<string, string> = {};
  for (const p of scenario.pkgs) {
    dependencies[p.name] = '1.0.0';
    if (p.dup) devDependencies[p.name] = '^1.0.0';
  }
  const manifest = JSON.stringify({ dependencies, devDependencies });
  return {
    github: {
      hasToken: () => true,
      getRepository: () =>
        Promise.resolve(okResult({ full_name: 'Owner/Repo', default_branch: 'main', private: false })),
      getBranch: () => Promise.resolve(okResult({ commit: { sha: SHA } })),
      getTree: () =>
        Promise.resolve(
          okResult({
            tree: [{ path: 'package.json', type: 'blob', size: 100, sha: 'b'.repeat(40) }],
            truncated: false,
          }),
        ),
      getManifestText: () => Promise.resolve(okResult(manifest) as SourceResult<string>),
      queryRepositories: () =>
        Promise.resolve(
          okResult({
            data: {
              rateLimit: { remaining: 4000, resetAt: '2024-01-11T01:00:00.000Z' },
              r0: { nameWithOwner: 'x/y', isArchived: false, defaultBranchRef: { target: { committedDate: '2024-01-01T00:00:00Z' } } },
            },
          }),
        ),
    },
    depsdev: {
      getPackage: (_system, name) => {
        const p = byName.get(name);
        const versions =
          p?.hasVersion === true
            ? [
                {
                  versionKey: { system: 'NPM', name, version: '1.0.0' },
                  isDefault: true,
                  isDeprecated: false,
                  publishedAt: '2023-12-31T00:00:00Z',
                },
              ]
            : [];
        return Promise.resolve(okResult({ versions }));
      },
      getVersion: () => Promise.resolve(okResult({ relatedProjects: [] })),
      getVersionBatch: (requests) =>
        Promise.resolve(
          okResult({
            responses: requests.map((r) => ({
              request: { versionKey: { system: r.system.toUpperCase(), name: r.name, version: r.version } },
              version: { relatedProjects: [] },
            })),
          }),
        ),
      getAdvisory: () => Promise.resolve(absentResult),
    },
    osv: {
      queryBatch: (queries) => {
        const results = queries.map((q) => {
          const outcome = byName.get(q.name)?.osv;
          if (outcome === undefined || outcome.kind === 'invalid') return 'not-an-object';
          if (outcome.kind === 'unavailable') return {};
          return { vulns: outcome.vulns };
        });
        if (queries.some((q) => byName.get(q.name)?.osv.kind === 'unavailable')) {
          // One failed batch makes every target of it unavailable.
          return Promise.resolve(failedResult);
        }
        return Promise.resolve(okResult({ results }));
      },
      getVulnerability: (id) => {
        const detail = scenario.details.get(id);
        if (detail === undefined || detail.kind === 'absent') return Promise.resolve(absentResult);
        if (detail.kind === 'failed') return Promise.resolve(failedResult);
        if (detail.kind === 'deadline') return new Promise<SourceResult>(() => undefined);
        if (detail.kind === 'invalid-body') return Promise.resolve(okResult({}));
        return Promise.resolve(
          okResult({
            id,
            aliases: detail.aliases,
            ...(detail.label === undefined ? {} : { database_specific: { severity: detail.label } }),
          }),
        );
      },
    },
    npm: { getLatest: () => Promise.resolve(okResult({ maintainers: [{ name: 'a' }, { name: 'b' }] })) },
    cratesio: { getOwners: () => Promise.resolve(absentResult) },
    pypi: { getProject: () => Promise.resolve(absentResult) },
  };
}

async function scan(scenario: Scenario): Promise<ScanResult> {
  const runtime = createFakeRuntime(START_MS);
  const deps: ScanDeps = {
    sources: makeSources(scenario),
    clock: runtime.clock,
    timer: runtime.timer,
    random: runtime.random,
    logger: { log: () => undefined },
    scanCache: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
    config: { apiUrl: 'https://api.github.com', graphqlUrl: 'https://api.github.com/graphql', webHost: 'github.com' },
    limits: { maxManifests: 10, maxDependencies: 100, maxAdvisoryDetails: scenario.cap },
    deadlineMs: DEADLINE_MS,
  };
  const outcome = await runUntilSettled(
    runScan(
      {
        repo: { host: 'github.com', owner: 'owner', repo: 'repo', branch: null },
        manifests: [],
        asOf: '2024-01-11T00:00:00.000Z' as never,
        startedAtMs: runtime.clock(),
      },
      deps,
    ),
    runtime,
  );
  if (!outcome.ok) throw new Error(`scan failed: ${outcome.error.code}`);
  return outcome.value.result;
}

const LABELS: Readonly<Record<string, 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>> = {
  LOW: 'LOW',
  MODERATE: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
};

describe('scan advisories properties', () => {
  it('P10: Advisory entries mirror the OSV ids', async () => {
    // Feature: scan-accuracy, Property 10: Advisory entries mirror the OSV ids
    // Validates: Requirements 6.2, 6.5, 6.9, 6.10, 6.13, 6.15
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        const result = await scan(scenario);

        // Ids requested for detail: the first `cap` of the union over targets with a Selected_Version.
        const union = [
          ...new Set(scenario.pkgs.filter((p) => p.hasVersion).flatMap((p) => idsOf(p.osv))),
        ].sort(codePointCompare);
        // One failed OSV batch (all targets share it) leaves every target without a query result.
        const batchFailed = scenario.pkgs.some((p) => p.hasVersion && p.osv.kind === 'unavailable');
        const requested = new Set(union.slice(0, scenario.cap));

        for (const pkg of scenario.pkgs) {
          const deps = result.dependencies.filter((d) => d.dependency.name === pkg.name);
          expect(deps.length).toBe(pkg.dup ? 2 : 1);

          const expectedIds = pkg.hasVersion && !batchFailed ? idsOf(pkg.osv).sort(codePointCompare) : [];
          const first = deps[0]?.advisories ?? [];
          expect(first.length).toBe(expectedIds.length);
          expect(first.map((e) => e.id)).toEqual(expectedIds);
          for (const d of deps) expect(d.advisories).toEqual(first);

          for (const entry of first) {
            const suffix = entry.url.slice(ADVISORY_URL_PREFIX.length);
            expect(entry.url.startsWith(ADVISORY_URL_PREFIX)).toBe(true);
            expect(suffix).not.toMatch(/[/?#]/);
            expect(decodeURIComponent(suffix)).toBe(entry.id);
            expect(entry.aliases).not.toContain(entry.id);

            const detail = scenario.details.get(entry.id);
            if (requested.has(entry.id) && detail?.kind === 'ok') {
              const aliases = [
                ...new Set(
                  detail.aliases.filter((a): a is string => typeof a === 'string' && a !== '' && a !== entry.id),
                ),
              ].sort(codePointCompare);
              expect(entry.aliases).toEqual(aliases);
              expect(entry.severity).toBe(
                typeof detail.label === 'string' ? (LABELS[detail.label] ?? null) : null,
              );
            } else {
              expect(entry.aliases).toEqual([]);
              expect(entry.severity).toBeNull();
            }
          }
        }
      }),
      cfg(),
    );
  });
});
