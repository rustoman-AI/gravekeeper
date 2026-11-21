// resurrect-upgrade spec task 5.6: request counts of whole scans (Requirements 1.5, 1.6, 1.7,
// 1.9, 1.10, 3.4, 4.7). Scripted sources, as in run-scan-pyproject.test.ts and run-scan-hints.test.ts.
import { describe, expect, it } from 'vitest';
import { NPM_VERSION_DOCS_MAX } from '../../../pipeline/constants';
import type { IsoInstant } from '../../../pipeline/mapping';
import type { SourceResult } from '../../../pipeline/ports';
import { createScanProgress, runScan } from '../../../pipeline/scan/run-scan';
import type { ScanDeps, ScanInput, ScanResult } from '../../../pipeline/scan/types';
import { createFakeRuntime } from '../../support/fake-runtime';
import type { FakeRuntime } from '../../support/fake-runtime';

const SHA = 'a'.repeat(40);
const AS_OF = '2024-06-01T00:00:00.000Z' as IsoInstant;
const START_MS = Date.parse(AS_OF);
const VERSION_NOTICE = 'version document notice: moved to the new package';
const LATEST_NOTICE = 'latest document notice: no longer supported';

const ok = (body: unknown): SourceResult =>
  ({ kind: 'ok', status: 200, body, headers: {}, fromCache: false }) as SourceResult;
const absent: SourceResult = { kind: 'absent', headers: {}, fromCache: false };
const failed: SourceResult = { kind: 'failed', reason: 'http-error', status: 500, headers: null };

interface Scenario {
  /** Manifest path to the dependency names of that manifest. All are pinned to `1.0.0`. */
  readonly manifests: Readonly<Record<string, readonly string[]>>;
  /** Names whose checked version 1.0.0 is deprecated in the deps.dev document. */
  readonly deprecated: ReadonlySet<string>;
  /** The `version` of the `/latest` document of every package. */
  readonly latestVersion: string;
  /** True: the version document request fails. */
  readonly failVersionDocs: boolean;
}

interface Recorded {
  /** Ordered events: `package:<name>` and `version:<name>@<version>`. */
  events: string[];
  versionCalls: string[];
}

const names = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => `pkg-${String(i).padStart(2, '0')}`);

const manifestText = (deps: readonly string[]): string =>
  JSON.stringify({ dependencies: Object.fromEntries(deps.map((n) => [n, '1.0.0'])) });

function buildSources(scenario: Scenario, recorded: Recorded): ScanDeps['sources'] {
  const files: Record<string, string> = {};
  for (const [path, deps] of Object.entries(scenario.manifests)) files[path] = manifestText(deps);

  const github: ScanDeps['sources']['github'] = {
    hasToken: () => false,
    getRepository: () =>
      Promise.resolve(ok({ full_name: 'o/r', default_branch: 'main', private: false })),
    getBranch: () => Promise.resolve(ok({ commit: { sha: SHA } })),
    getTree: () =>
      Promise.resolve(
        ok({
          truncated: false,
          tree: Object.keys(files).map((path) => ({
            path,
            type: 'blob',
            size: 10,
            sha: 'f'.repeat(40),
          })),
        }),
      ),
    getManifestText: (_ref, _sha, path) =>
      Promise.resolve({
        kind: 'ok',
        status: 200,
        body: files[path] ?? '',
        headers: {},
        fromCache: false,
      } as SourceResult<string>),
    queryRepositories: () => Promise.resolve(ok({ data: {} })),
  };
  return {
    github,
    depsdev: {
      getPackage: (_system, name) => {
        recorded.events.push(`package:${name}`);
        return Promise.resolve(
          ok({
            versions: [
              {
                versionKey: { version: '1.0.0' },
                publishedAt: '2020-01-01T00:00:00Z',
                isDefault: false,
                isDeprecated: scenario.deprecated.has(name),
              },
              {
                versionKey: { version: '2.0.0' },
                publishedAt: '2021-01-01T00:00:00Z',
                isDefault: true,
                isDeprecated: false,
              },
            ],
          }),
        );
      },
      getVersion: () => Promise.resolve(failed),
      getVersionBatch: (requests) =>
        Promise.resolve(
          ok({
            responses: requests.map((r) => ({
              request: { versionKey: { system: 'NPM', name: r.name, version: r.version } },
              version: {},
            })),
          }),
        ),
      getAdvisory: () => Promise.resolve(absent),
    },
    osv: {
      queryBatch: (queries) => Promise.resolve(ok({ results: queries.map(() => ({})) })),
      getVulnerability: () => Promise.resolve(absent),
    },
    npm: {
      getVersion: (name: string, version: string) => {
        recorded.events.push(`version:${name}@${version}`);
        recorded.versionCalls.push(name);
        return Promise.resolve(
          scenario.failVersionDocs ? failed : ok({ deprecated: VERSION_NOTICE }),
        );
      },
      getLatest: (name: string) =>
        Promise.resolve(
          ok({
            version: scenario.latestVersion,
            maintainers: [],
            ...(scenario.deprecated.has(name) ? { deprecated: LATEST_NOTICE } : {}),
          }),
        ),
    } as ScanDeps['sources']['npm'],
    cratesio: { getOwners: () => Promise.resolve(absent) } as ScanDeps['sources']['cratesio'],
    pypi: { getProject: () => Promise.resolve(absent) },
  };
}

function makeDeps(runtime: FakeRuntime, scenario: Scenario, recorded: Recorded): ScanDeps {
  return {
    sources: buildSources(scenario, recorded),
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
    limits: { maxManifests: 10, maxDependencies: 300, maxAdvisoryDetails: 500 },
    progress: createScanProgress(),
  };
}

async function scan(
  partial: Partial<Scenario> & Pick<Scenario, 'manifests'>,
): Promise<{ result: ScanResult; recorded: Recorded }> {
  const scenario: Scenario = {
    deprecated: new Set(),
    latestVersion: '3.0.0',
    failVersionDocs: false,
    ...partial,
  };
  const runtime = createFakeRuntime(START_MS);
  const recorded: Recorded = { events: [], versionCalls: [] };
  const input: ScanInput = {
    repo: { host: 'github.com', owner: 'o', repo: 'r', branch: null },
    // Without an explicit list only the root manifest is scanned.
    manifests: Object.keys(scenario.manifests).sort(),
    asOf: AS_OF,
    startedAtMs: runtime.clock(),
  };
  const outcome = await runScan(input, makeDeps(runtime, scenario, recorded));
  if (!outcome.ok) throw new Error(`scan failed: ${outcome.error.code}`);
  return { result: outcome.value.result, recorded };
}

const rowsOf = (result: ScanResult, name: string) =>
  result.dependencies.filter((d) => d.dependency.name === name);

describe('npm version documents in a scripted scan (Requirements 1.5 to 1.10, 3.4, 4.7)', () => {
  it('sends no request when no target is deprecated (1.5)', async () => {
    const { recorded, result } = await scan({ manifests: { 'package.json': names(3) } });
    expect(recorded.versionCalls).toEqual([]);
    expect(result.sources.npm).toBe('ok');
  });

  it('sends one request for one deprecated target and uses its text as the hint (1.5, 3.4)', async () => {
    const { recorded, result } = await scan({
      manifests: { 'package.json': ['pkg-00', 'pkg-01'] },
      deprecated: new Set(['pkg-00']),
    });
    expect(recorded.versionCalls).toEqual(['pkg-00']);
    expect(rowsOf(result, 'pkg-00')[0]?.hints).toEqual([
      { kind: 'deprecation-notice', text: VERSION_NOTICE, sourceUrl: null },
    ]);
  });

  it('sends one request for a target listed in two manifests (1.6)', async () => {
    const { recorded, result } = await scan({
      manifests: { 'package.json': ['pkg-00'], 'sub/package.json': ['pkg-00'] },
      deprecated: new Set(['pkg-00']),
    });
    expect(rowsOf(result, 'pkg-00')).toHaveLength(2);
    expect(recorded.versionCalls).toEqual(['pkg-00']);
  });

  it('sends no request when the deprecated checked version is the latest (1.7)', async () => {
    const { recorded, result } = await scan({
      manifests: { 'package.json': ['pkg-00'] },
      deprecated: new Set(['pkg-00']),
      latestVersion: '1.0.0',
    });
    expect(recorded.versionCalls).toEqual([]);
    expect(rowsOf(result, 'pkg-00')[0]?.hints).toEqual([
      { kind: 'deprecation-notice', text: LATEST_NOTICE, sourceUrl: null },
    ]);
  });

  it('caps the requests at NPM_VERSION_DOCS_MAX for 45 deprecated targets (1.9)', async () => {
    const all = names(45);
    const { recorded } = await scan({
      manifests: { 'package.json': all },
      deprecated: new Set(all),
    });
    expect(recorded.versionCalls).toHaveLength(NPM_VERSION_DOCS_MAX);
    expect([...recorded.versionCalls].sort()).toEqual(all.slice(0, NPM_VERSION_DOCS_MAX));
  });

  it('marks npm partial and keeps the /latest hint when the request fails (1.10)', async () => {
    const { recorded, result } = await scan({
      manifests: { 'package.json': ['pkg-00'] },
      deprecated: new Set(['pkg-00']),
      failVersionDocs: true,
    });
    expect(recorded.versionCalls).toEqual(['pkg-00']);
    expect(result.sources.npm).toBe('partial');
    expect(rowsOf(result, 'pkg-00')[0]?.hints).toEqual([
      { kind: 'deprecation-notice', text: LATEST_NOTICE, sourceUrl: null },
    ]);
  });

  it('requests the version document after the deps.dev package answer (1.1)', async () => {
    const { recorded } = await scan({
      manifests: { 'package.json': ['pkg-00'] },
      deprecated: new Set(['pkg-00']),
    });
    const pkg = recorded.events.indexOf('package:pkg-00');
    const doc = recorded.events.indexOf('version:pkg-00@1.0.0');
    expect(pkg).toBeGreaterThanOrEqual(0);
    expect(doc).toBeGreaterThan(pkg);
  });

  it('gives a deprecated target an upgrade and a healthy target none (4.7)', async () => {
    const { result } = await scan({
      manifests: { 'package.json': ['pkg-00', 'pkg-01'] },
      deprecated: new Set(['pkg-00']),
    });
    expect(rowsOf(result, 'pkg-00')[0]?.upgrade).toEqual({
      version: '2.0.0',
      basis: 'registry-default',
    });
    expect(rowsOf(result, 'pkg-01')[0]).not.toHaveProperty('upgrade');
  });
});
