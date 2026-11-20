import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MemoryCacheStore } from '../adapters/cache/memory-cache-store';
import { CachingHttpClient } from '../adapters/http/caching-http-client';
import { createCratesIoSource } from '../adapters/cratesio/cratesio-source';
import { createDepsDevSource } from '../adapters/depsdev/depsdev-source';
import { createGithubSource } from '../adapters/github/github-source';
import { createNpmSource } from '../adapters/npm/npm-source';
import { createOsvSource } from '../adapters/osv/osv-source';
import { createPypiSource } from '../adapters/pypi/pypi-source';
import {
  GITHUB_DEFAULT_WEB_HOST,
  OSV_MAX_ADVISORY_DETAILS,
  SCAN_MAX_DEPENDENCIES,
  SCAN_MAX_MANIFESTS,
} from '../pipeline/constants';
import { readGithubConfig } from '../pipeline/config/github-config';
import { createScanCache } from '../pipeline/scan/scan-cache';
import { runScan } from '../pipeline/scan/run-scan';
import type { ScanDeps, ScanResult } from '../pipeline/scan/types';
import { FixtureHttpClient } from '../tests/support/fixture-http-client';
import { createFakeRuntime } from '../tests/support/fake-runtime';
import {
  advisoriesOfEveryExclusion,
  buildScanResult,
  result300,
  result301,
} from '../tests/support/ui/scan-result-builder';

// Requirement 20.1, 19.5
// Writes the JSON bodies the e2e suite hands to `route.fulfill` for POST /api/scan. Makes no network request:
// the replay uses recorded responses and fails on any unrecorded request.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT_DIR = join(ROOT, 'tests', 'e2e', '.generated');

const RECORDED: ReadonlyArray<{ readonly dir: string; readonly file: string }> = [
  { dir: 'request__request', file: 'scan-request.json' },
  { dir: 'revmic__canopy', file: 'scan-canopy.json' },
  { dir: 'ajeetdsouza__zoxide', file: 'scan-zoxide.json' },
];

async function replay(fixtureName: string): Promise<ScanResult> {
  const dir = join(ROOT, 'tests', 'fixtures', fixtureName);
  const meta = JSON.parse(readFileSync(join(dir, 'metadata.json'), 'utf8')) as {
    canonicalRepoUrl: string | null;
    asOf: string;
  };
  const [owner, repo] = new URL(meta.canonicalRepoUrl ?? '').pathname.split('/').filter(Boolean);
  const parsed = readGithubConfig({});
  if (!parsed.ok) throw new Error('default GitHub configuration is invalid');
  const config = parsed.value;
  const startedAtMs = Date.parse(meta.asOf);
  const runtime = createFakeRuntime(startedAtMs);
  const fixture = new FixtureHttpClient(dir);
  const http = new CachingHttpClient(fixture, new MemoryCacheStore(runtime.clock));
  const deps: ScanDeps = {
    sources: {
      github: createGithubSource(http, config, true),
      depsdev: createDepsDevSource(http),
      osv: createOsvSource(http),
      npm: createNpmSource(http),
      cratesio: createCratesIoSource({ http, userAgent: 'gravekeeper-fixture-export' }),
      pypi: createPypiSource(http),
    },
    clock: runtime.clock,
    timer: runtime.timer,
    random: runtime.random,
    logger: { log: () => undefined },
    scanCache: createScanCache(new MemoryCacheStore(runtime.clock)),
    config,
    limits: {
      maxManifests: SCAN_MAX_MANIFESTS,
      maxDependencies: SCAN_MAX_DEPENDENCIES,
      maxAdvisoryDetails: OSV_MAX_ADVISORY_DETAILS,
    },
    deadlineMs: 300_000,
  };
  const outcome = await runScan(
    {
      repo: { host: GITHUB_DEFAULT_WEB_HOST, owner: owner as string, repo: repo as string, branch: null },
      manifests: [],
      asOf: meta.asOf,
      startedAtMs,
    },
    deps,
  );
  // An unrecorded request is a failure, never a network call.
  fixture.assertNoMisses();
  if (!outcome.ok) throw new Error(`replay of ${fixtureName} failed: ${JSON.stringify(outcome.error)}`);
  return { ...outcome.value.result, ok: true };
}

function syntheticRestless(): ScanResult {
  return buildScanResult([
    { name: 'restless-one', kind: 'restless-both' },
    { name: 'ghost-one', kind: 'ghost', advisories: advisoriesOfEveryExclusion() },
    { name: 'buried-one', kind: 'buried' },
    { name: 'forgotten-one', kind: 'forgotten' },
    { name: 'lantern-one', kind: 'alive' },
    { name: 'unmarked-one', kind: 'unassessed-no-data' },
  ]);
}

function write(outDir: string, file: string, body: unknown): string {
  const path = join(outDir, file);
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  return path;
}

/** Writes every e2e scan fixture into `outDir` and returns the written paths. */
export async function exportScanFixtures(outDir: string = DEFAULT_OUT_DIR): Promise<string[]> {
  mkdirSync(outDir, { recursive: true });
  const written: string[] = [];
  for (const { dir, file } of RECORDED) written.push(write(outDir, file, await replay(dir)));
  written.push(write(outDir, 'scan-synthetic-restless.json', syntheticRestless()));
  written.push(write(outDir, 'scan-synthetic-300.json', result300()));
  written.push(write(outDir, 'scan-synthetic-301.json', result301()));
  return written;
}

const entry = process.argv[1];
if (entry !== undefined && existsSync(entry) && resolve(entry) === fileURLToPath(import.meta.url)) {
  exportScanFixtures()
    .then((paths) => {
      for (const p of paths) {
        const body = JSON.parse(readFileSync(p, 'utf8')) as ScanResult;
        const unique = new Set(body.dependencies.map((d) => `${d.dependency.ecosystem}:${d.dependency.name}`)).size;
        console.log(`${p} (${unique} packages)`);
      }
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
