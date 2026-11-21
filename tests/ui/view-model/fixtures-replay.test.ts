import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MemoryCacheStore } from '../../../adapters/cache/memory-cache-store';
import { CachingHttpClient } from '../../../adapters/http/caching-http-client';
import { createCratesIoSource } from '../../../adapters/cratesio/cratesio-source';
import { createDepsDevSource } from '../../../adapters/depsdev/depsdev-source';
import { createGithubSource } from '../../../adapters/github/github-source';
import { createNpmSource } from '../../../adapters/npm/npm-source';
import { createOsvSource } from '../../../adapters/osv/osv-source';
import { createPypiSource } from '../../../adapters/pypi/pypi-source';
import { uniquePackages } from '../../../core';
import {
  GITHUB_DEFAULT_WEB_HOST,
  OSV_MAX_ADVISORY_DETAILS,
  SCAN_MAX_DEPENDENCIES,
  SCAN_MAX_MANIFESTS,
} from '../../../pipeline/constants';
import { readGithubConfig } from '../../../pipeline/config/github-config';
import { createScanCache } from '../../../pipeline/scan/scan-cache';
import { runScan } from '../../../pipeline/scan/run-scan';
import type { ScanDeps } from '../../../pipeline/scan/types';
import { buildHeaderModel } from '../../../view-model/header';
import { buildPackageRows } from '../../../view-model/package-rows';
import { parseScanResponse } from '../../../view-model/parse-response';
import { createFakeRuntime } from '../../support/fake-runtime';
import { FixtureHttpClient } from '../../support/fixture-http-client';

// Requirements 19.6, 5.2, 7.11
// Replays the recorded repository sets through the scan, the response boundary and the view-model.

const FIXTURES = join(__dirname, '..', '..', 'fixtures');

const CASES = [
  { name: 'request__request', owner: 'request', repo: 'request', rows: 40 },
  { name: 'revmic__canopy', owner: 'revmic', repo: 'canopy', rows: 6 },
  { name: 'ajeetdsouza__zoxide', owner: 'ajeetdsouza', repo: 'zoxide', rows: 20 },
  { name: 'psf__requests', owner: 'psf', repo: 'requests', rows: 17 },
] as const;

async function replayToParsed(name: string, owner: string, repo: string) {
  const dir = join(FIXTURES, name);
  const meta = JSON.parse(readFileSync(join(dir, 'metadata.json'), 'utf8')) as { asOf: string };
  const parsedConfig = readGithubConfig({});
  if (!parsedConfig.ok) throw new Error('default GitHub configuration is invalid');
  const config = parsedConfig.value;
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
      cratesio: createCratesIoSource({ http, userAgent: 'gravekeeper-fixture-replay' }),
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
      repo: { host: GITHUB_DEFAULT_WEB_HOST, owner, repo, branch: null },
      manifests: [],
      asOf: meta.asOf,
      startedAtMs,
    },
    deps,
  );
  fixture.assertNoMisses();
  if (!outcome.ok) throw new Error(`scan failed: ${JSON.stringify(outcome.error)}`);
  // Through JSON, as on the wire.
  const wire: unknown = JSON.parse(JSON.stringify({ ...outcome.value.result, ok: true }));
  const parsed = parseScanResponse(200, { get: () => null }, wire);
  if (parsed.kind !== 'result') throw new Error(`response did not parse: ${parsed.kind}`);
  return parsed.result;
}

describe('view-model fixture replay', () => {
  for (const c of CASES) {
    it(`${c.name}: N, M, B, F, H and the row count agree with the summary`, async () => {
      const result = await replayToParsed(c.name, c.owner, c.repo);
      const rows = buildPackageRows(result);
      const header = buildHeaderModel(result, rows);

      // Independent values: counts from the summary, B and F from the ruleIds of DEAD packages.
      const dead = uniquePackages(result.assessed).filter((g) => g.classification?.status === 'DEAD');
      const b = dead.filter((g) =>
        (g.classification?.reasons ?? []).some((r) => r.ruleId === '8.1' || r.ruleId === '8.2'),
      ).length;
      const f = dead.length - b;
      const h = result.summary.counts.HAUNTED;
      const m = result.summary.assessed;

      console.info(
        `${c.name}: B=${b} F=${f} H=${h} N=${b + f + h} M=${m} rows=${rows.length} DEAD=${result.summary.counts.DEAD}`,
      );

      expect(b + f).toBe(result.summary.counts.DEAD);
      expect(h).toBe(result.summary.counts.HAUNTED);
      expect(rows).toHaveLength(c.rows);

      expect(header.headline).not.toBeNull();
      expect(header.headline).toMatchObject({ n: b + f + h, m, buried: b, forgotten: f, haunted: h });
      expect(header.counts).toMatchObject({ buried: b, forgotten: f, haunted: h, dead: result.summary.counts.DEAD });
    });
  }
});
