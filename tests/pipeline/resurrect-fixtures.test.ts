import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { MemoryCacheStore } from '../../adapters/cache/memory-cache-store';
import { CachingHttpClient } from '../../adapters/http/caching-http-client';
import { createCratesIoSource } from '../../adapters/cratesio/cratesio-source';
import { createDepsDevSource } from '../../adapters/depsdev/depsdev-source';
import { createGithubSource } from '../../adapters/github/github-source';
import { createNpmSource } from '../../adapters/npm/npm-source';
import { createOsvSource } from '../../adapters/osv/osv-source';
import { createPypiSource } from '../../adapters/pypi/pypi-source';
import {
  GITHUB_DEFAULT_WEB_HOST,
  OSV_MAX_ADVISORY_DETAILS,
  SCAN_MAX_DEPENDENCIES,
  SCAN_MAX_MANIFESTS,
} from '../../pipeline/constants';
import { readGithubConfig } from '../../pipeline/config/github-config';
import { normalizeHintText } from '../../pipeline/mapping/hint-text';
import { createScanCache } from '../../pipeline/scan/scan-cache';
import { runScan } from '../../pipeline/scan/run-scan';
import type { ScanDeps, ScanResult } from '../../pipeline/scan/types';
import { FixtureHttpClient, loadFixtureSet } from '../support/fixture-http-client';
import { createFakeRuntime } from '../support/fake-runtime';

// Resurrect requirements 2.1, 2.4, 3.1, 4.2, 12.6
// Replays the recorded repository sets through the scan and checks the upstream hints.

const FIXTURES = join(__dirname, '..', 'fixtures');
const SET_NAMES = ['request__request', 'ajeetdsouza__zoxide', 'psf__requests', 'revmic__canopy'] as const;

interface Meta {
  readonly canonicalRepoUrl: string;
  readonly asOf: string;
}

const clients: FixtureHttpClient[] = [];

afterEach(() => {
  for (const client of clients.splice(0)) client.assertNoMisses();
});

function metaOf(name: string): Meta {
  return JSON.parse(readFileSync(join(FIXTURES, name, 'metadata.json'), 'utf8')) as Meta;
}

async function replay(name: string): Promise<ScanResult> {
  const dir = join(FIXTURES, name);
  const meta = metaOf(name);
  const [owner, repo] = new URL(meta.canonicalRepoUrl).pathname.split('/').filter(Boolean) as [string, string];
  const parsed = readGithubConfig({});
  if (!parsed.ok) throw new Error('default GitHub configuration is invalid');
  const config = parsed.value;
  const startedAtMs = Date.parse(meta.asOf);
  const runtime = createFakeRuntime(startedAtMs);
  const fixture = new FixtureHttpClient(dir);
  clients.push(fixture);
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
  if (!outcome.ok) throw new Error(`scan of ${name} failed: ${outcome.error.code}`);
  return outcome.value.result;
}

/** The recorded `deprecated` text of an npm package, read from its recorded `latest` response. */
function recordedDeprecation(name: string, pkg: string): string | null {
  const set = loadFixtureSet(join(FIXTURES, name));
  const url = `https://registry.npmjs.org/${pkg}/latest`;
  for (const entry of set.entries.values()) {
    if (entry.source !== 'npm' || entry.url !== url) continue;
    const body = JSON.parse(set.read(entry).response.bodyText) as { deprecated?: unknown };
    return normalizeHintText(body.deprecated);
  }
  throw new Error(`no recorded npm response for ${pkg}`);
}

/** The recorded `deprecated` text of one npm version document. */
function recordedVersionDeprecation(name: string, pkg: string, version: string | null): string | null {
  const set = loadFixtureSet(join(FIXTURES, name));
  const url = `https://registry.npmjs.org/${pkg}/${version}`;
  for (const entry of set.entries.values()) {
    if (entry.source !== 'npm' || entry.url !== url) continue;
    const body = JSON.parse(set.read(entry).response.bodyText) as { deprecated?: unknown };
    return normalizeHintText(body.deprecated);
  }
  throw new Error(`no recorded npm version document for ${pkg}@${version}`);
}

function rowsOf(result: ScanResult, pkg: string): ScanResult['dependencies'] {
  const rows = result.dependencies.filter((d) => d.dependency.name === pkg);
  expect(rows.length).toBeGreaterThan(0);
  return rows;
}

describe('resurrect hints over the recorded sets', () => {
  const results = new Map<string, ScanResult>();

  async function resultOf(name: string): Promise<ScanResult> {
    let result = results.get(name);
    if (result === undefined) {
      result = await replay(name);
      results.set(name, result);
    }
    return result;
  }

  for (const pkg of ['har-validator', 'phantomjs-prebuilt', 'karma-phantomjs-launcher']) {
    it(`request__request: ${pkg} carries one deprecation-notice with the recorded text`, async () => {
      const text = recordedDeprecation('request__request', pkg);
      expect(text).not.toBeNull();
      for (const row of rowsOf(await resultOf('request__request'), pkg)) {
        expect(row.hints).toEqual([{ kind: 'deprecation-notice', text, sourceUrl: null }]);
      }
    });
  }

  it('request__request: request, when it is a dependency, carries the recorded text', async () => {
    const result = await resultOf('request__request');
    const rows = result.dependencies.filter((d) => d.dependency.name === 'request');
    for (const row of rows) {
      const text = recordedDeprecation('request__request', 'request');
      expect(row.hints).toEqual([{ kind: 'deprecation-notice', text, sourceUrl: null }]);
    }
  });

  // resurrect-upgrade R9.3: the /latest document of uuid and rimraf carries no notice, but the
  // re-recorded version document of the checked version does; the hint is that recorded text.
  for (const pkg of ['uuid', 'rimraf']) {
    it(`request__request: ${pkg} carries the recorded notice of its checked version`, async () => {
      expect(recordedDeprecation('request__request', pkg)).toBeNull();
      for (const row of rowsOf(await resultOf('request__request'), pkg)) {
        const text = recordedVersionDeprecation('request__request', pkg, row.lookupVersion);
        expect(text).not.toBeNull();
        expect(row.hints).toEqual([{ kind: 'deprecation-notice', text, sourceUrl: null }]);
      }
    });
  }

  it('ajeetdsouza__zoxide: bincode carries one advisory-notice for RUSTSEC-2025-0141', async () => {
    const result = await resultOf('ajeetdsouza__zoxide');
    for (const row of rowsOf(result, 'bincode')) {
      expect(row.hints).toHaveLength(1);
      const hint = row.hints?.[0];
      expect(hint?.kind).toBe('advisory-notice');
      expect(hint?.sourceUrl).toBe('https://osv.dev/vulnerability/RUSTSEC-2025-0141');
      expect(Array.from(hint?.text ?? '').length).toBeLessThanOrEqual(600);
      expect(hint?.text.startsWith('Due to a doxxing')).toBe(true);
    }
  });

  it('two replays of every set are equal', async () => {
    for (const name of SET_NAMES) {
      const first = await replay(name);
      const second = await replay(name);
      expect(second).toEqual(first);
    }
  });

  it('no hint text of any set contains a token prefix', async () => {
    for (const name of SET_NAMES) {
      const result = await resultOf(name);
      for (const row of result.dependencies) {
        for (const hint of row.hints ?? []) {
          expect(hint.text).not.toMatch(/ghp_|gho_|github_pat_/);
        }
      }
    }
  });
});
