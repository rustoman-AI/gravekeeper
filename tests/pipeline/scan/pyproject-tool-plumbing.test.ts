// resurrect spec task 3.2: pyprojectTool on manifest entries and in the validator (Requirements 5.4, 5.5, 5.6).
import { describe, expect, it } from 'vitest';
import type { IsoInstant } from '../../../pipeline/mapping';
import type { SourceResult } from '../../../pipeline/ports';
import { createScanProgress, runScan } from '../../../pipeline/scan/run-scan';
import { isScanResult } from '../../../pipeline/scan/scan-cache';
import type { ScanDeps, ScanInput, ScanResult } from '../../../pipeline/scan/types';
import { createFakeRuntime } from '../../support/fake-runtime';
import type { FakeRuntime } from '../../support/fake-runtime';

const SHA = 'a'.repeat(40);
const AS_OF = '2024-06-01T00:00:00.000Z' as IsoInstant;
const START_MS = Date.parse(AS_OF);

const ok = (body: unknown): SourceResult =>
  ({ kind: 'ok', status: 200, body, headers: {}, fromCache: false }) as SourceResult;
const absent: SourceResult = { kind: 'absent', headers: {}, fromCache: false };
const failed: SourceResult = { kind: 'failed', reason: 'http-error', status: 500, headers: null };

const FILES: Readonly<Record<string, string>> = {
  'package.json': JSON.stringify({ dependencies: { left: '1.0.0' } }),
  'requirements.txt': 'requests==2.0.0\n',
  'poetry/pyproject.toml': '[tool.poetry.dependencies]\npython = "^3.10"\nhttpx = "^0.27"\n',
  'pep/pyproject.toml': '[project]\nname = "x"\ndependencies = ["flask>=2"]\n',
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
      getPackage: () => Promise.resolve(absent),
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
      getVersion: () => Promise.resolve(absent),
      getLatest: () =>
        Promise.resolve(absent),
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
    manifests: Object.keys(FILES),
    asOf: AS_OF,
    startedAtMs: runtime.clock(),
  };
  const outcome = await runScan(input, makeDeps(runtime));
  if (!outcome.ok) throw new Error('scan failed: ' + outcome.error.code);
  return outcome.value.result;
}

describe('pyprojectTool plumbing (Requirements 5.4, 5.5, 5.6)', () => {
  it('sets pyprojectTool on the pyproject.toml entries only', async () => {
    const result = await scan();
    const tool = (path: string): unknown =>
      result.manifests.find((m) => m.path === path)?.pyprojectTool;
    expect(result.manifests).toHaveLength(4);
    expect(tool('poetry/pyproject.toml')).toBe('poetry');
    expect(tool('pep/pyproject.toml')).toBe('pep621');
    const others = result.manifests.filter((m) => !m.path.endsWith('pyproject.toml'));
    expect(others).toHaveLength(2);
    for (const m of others) expect('pyprojectTool' in m).toBe(false);
  });

  it('validator accepts a result without the field and rejects an unknown tool', async () => {
    const result = await scan();
    const plain = JSON.parse(JSON.stringify({
      ...result,
      manifests: result.manifests.map((m) => ({ path: m.path, format: m.format, warnings: m.warnings })),
    })) as unknown;
    expect(isScanResult(plain)).toBe(true);
    expect(isScanResult(JSON.parse(JSON.stringify(result)))).toBe(true);
    const bad = JSON.parse(JSON.stringify(result)) as { manifests: Record<string, unknown>[] };
    bad.manifests[0] = { ...bad.manifests[0], pyprojectTool: 'uv' };
    expect(isScanResult(bad)).toBe(false);
  });
});

