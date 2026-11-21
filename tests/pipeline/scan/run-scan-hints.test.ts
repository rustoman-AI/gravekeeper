// resurrect spec task 1.8: hints carried into the scan dependencies (Requirements 4.2, 4.3).
// Scripted sources, as in run-scan-pyproject.test.ts.
import { describe, expect, it } from 'vitest';
import type { IsoInstant } from '../../../pipeline/mapping';
import type { SourceResult } from '../../../pipeline/ports';
import { createScanProgress, runScan } from '../../../pipeline/scan/run-scan';
import type { ScanDeps, ScanInput, ScanResult } from '../../../pipeline/scan/types';
import { createFakeRuntime } from '../../support/fake-runtime';
import type { FakeRuntime } from '../../support/fake-runtime';

const SHA = 'a'.repeat(40);
const AS_OF = '2024-06-01T00:00:00.000Z' as IsoInstant;
const START_MS = Date.parse(AS_OF);
const NOTICE = 'this package is no longer supported';

const ok = (body: unknown): SourceResult =>
  ({ kind: 'ok', status: 200, body, headers: {}, fromCache: false }) as SourceResult;
const absent: SourceResult = { kind: 'absent', headers: {}, fromCache: false };
const failed: SourceResult = { kind: 'failed', reason: 'http-error', status: 500, headers: null };

const FILES: Readonly<Record<string, string>> = {
  'package.json': JSON.stringify({
    dependencies: { oldpkg: '1.0.0', gitpkg: 'git+https://github.com/o/gitpkg.git' },
    devDependencies: { oldpkg: '1.0.0' },
  }),
};

function buildSources(): ScanDeps['sources'] {
  const github: ScanDeps['sources']['github'] = {
    hasToken: () => false,
    getRepository: () =>
      Promise.resolve(ok({ full_name: 'o/r', default_branch: 'main', private: false })),
    getBranch: () => Promise.resolve(ok({ commit: { sha: SHA } })),
    getTree: () =>
      Promise.resolve(
        ok({
          truncated: false,
          tree: Object.keys(FILES).map((path) => ({
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
        body: FILES[path] ?? '',
        headers: {},
        fromCache: false,
      } as SourceResult<string>),
    queryRepositories: () => Promise.resolve(ok({ data: {} })),
  };
  return {
    github,
    depsdev: {
      getPackage: (_system, name) =>
        Promise.resolve(
          name === 'oldpkg'
            ? ok({
                versions: [
                  {
                    versionKey: { version: '1.0.0' },
                    publishedAt: '2020-01-01T00:00:00Z',
                    isDefault: true,
                    isDeprecated: false,
                  },
                ],
              })
            : absent,
        ),
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
      getLatest: (name) =>
        Promise.resolve(name === 'oldpkg' ? ok({ deprecated: NOTICE, maintainers: [] }) : absent),
    } as ScanDeps['sources']['npm'],
    cratesio: { getOwners: () => Promise.resolve(absent) } as ScanDeps['sources']['cratesio'],
    pypi: { getProject: () => Promise.resolve(absent) },
  };
}

function makeDeps(runtime: FakeRuntime): ScanDeps {
  return {
    sources: buildSources(),
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

async function scan(): Promise<ScanResult> {
  const runtime = createFakeRuntime(START_MS);
  const input: ScanInput = {
    repo: { host: 'github.com', owner: 'o', repo: 'r', branch: null },
    manifests: [],
    asOf: AS_OF,
    startedAtMs: runtime.clock(),
  };
  const outcome = await runScan(input, makeDeps(runtime));
  if (!outcome.ok) throw new Error(`scan failed: ${outcome.error.code}`);
  return outcome.value.result;
}

describe('scan hints (Requirements 4.2, 4.3)', () => {
  it('gives two dependencies of one target equal hints', async () => {
    const result = await scan();
    const rows = result.dependencies.filter((d) => d.dependency.name === 'oldpkg');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.hints).toEqual([
      { kind: 'deprecation-notice', text: NOTICE, sourceUrl: null },
    ]);
    expect(rows[1]?.hints).toEqual(rows[0]?.hints);
  });

  it('gives an unlooked git dependency an empty hints array', async () => {
    const result = await scan();
    const rows = result.dependencies.filter((d) => d.dependency.name === 'gitpkg');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.dependency.sourceKind).toBe('git');
    expect(rows[0]?.hints).toEqual([]);
  });
});

