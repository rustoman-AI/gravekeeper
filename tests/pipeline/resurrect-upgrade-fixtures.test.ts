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
import { semverCompare } from '../../pipeline/mapping/range-semver';
import type { NpmSource } from '../../pipeline/ports/npm-source';
import { createScanCache } from '../../pipeline/scan/scan-cache';
import { runScan } from '../../pipeline/scan/run-scan';
import type { ScanDeps, ScanResult } from '../../pipeline/scan/types';
import { FixtureHttpClient, loadFixtureSet } from '../support/fixture-http-client';
import { createFakeRuntime } from '../support/fake-runtime';

// resurrect-upgrade Requirements 9.3, 9.10
// Replays the re-recorded request/request set and checks the version notices and upgrades.

const SET = 'request__request';
const DIR = join(__dirname, '..', 'fixtures', SET);

interface Meta {
  readonly canonicalRepoUrl: string;
  readonly asOf: string;
}

const clients: FixtureHttpClient[] = [];

afterEach(() => {
  for (const client of clients.splice(0)) client.assertNoMisses();
});

async function replay(): Promise<{ result: ScanResult; getVersionCalls: string[] }> {
  const meta = JSON.parse(readFileSync(join(DIR, 'metadata.json'), 'utf8')) as Meta;
  const [owner, repo] = new URL(meta.canonicalRepoUrl).pathname.split('/').filter(Boolean) as [string, string];
  const parsed = readGithubConfig({});
  if (!parsed.ok) throw new Error('default GitHub configuration is invalid');
  const config = parsed.value;
  const startedAtMs = Date.parse(meta.asOf);
  const runtime = createFakeRuntime(startedAtMs);
  const fixture = new FixtureHttpClient(DIR);
  clients.push(fixture);
  const http = new CachingHttpClient(fixture, new MemoryCacheStore(runtime.clock));
  const realNpm = createNpmSource(http);
  const getVersionCalls: string[] = [];
  const npm: NpmSource = {
    ...realNpm,
    getVersion: (name, version, ctx) => {
      getVersionCalls.push(`${name}@${version}`);
      return realNpm.getVersion(name, version, ctx);
    },
  };
  const deps: ScanDeps = {
    sources: {
      github: createGithubSource(http, config, true),
      depsdev: createDepsDevSource(http),
      osv: createOsvSource(http),
      npm,
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
  if (!outcome.ok) throw new Error(`scan failed: ${outcome.error.code}`);
  return { result: outcome.value.result, getVersionCalls };
}

const set = loadFixtureSet(DIR);

function recordedBody(url: string): Record<string, unknown> {
  for (const entry of set.entries.values()) {
    if (entry.url === url) return JSON.parse(set.read(entry).response.bodyText) as Record<string, unknown>;
  }
  throw new Error(`no recorded response for ${url}`);
}

function recordedVersionDocUrls(): string[] {
  const urls: string[] = [];
  for (const entry of set.entries.values()) {
    if (entry.source === 'npm' && /^https:\/\/registry\.npmjs\.org\/.+/.test(entry.url) && !entry.url.endsWith('/latest')) {
      urls.push(entry.url);
    }
  }
  return urls;
}

/** The recorded default version of a package, from its recorded deps.dev document. */
function recordedDefault(pkg: string): string {
  const body = recordedBody(`https://api.deps.dev/v3/systems/npm/packages/${pkg}`) as {
    versions: { versionKey: { version: string }; isDefault?: boolean }[];
  };
  const found = body.versions.find((v) => v.isDefault === true);
  if (found === undefined) throw new Error(`no recorded default version for ${pkg}`);
  return found.versionKey.version;
}

describe('resurrect-upgrade over the re-recorded request/request set', () => {
  let first: { result: ScanResult; getVersionCalls: string[] } | undefined;
  async function once() {
    first ??= await replay();
    return first;
  }

  for (const pkg of ['uuid', 'rimraf']) {
    it(`${pkg} carries the recorded version notice and the registry default as upgrade`, async () => {
      const { result } = await once();
      const rows = result.dependencies.filter((d) => d.dependency.name === pkg);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        const checked = row.lookupVersion;
        expect(checked).not.toBeNull();
        const text = normalizeHintText(recordedBody(`https://registry.npmjs.org/${pkg}/${checked}`).deprecated);
        expect(text).not.toBeNull();
        expect(row.hints).toEqual([{ kind: 'deprecation-notice', text, sourceUrl: null }]);
        const def = recordedDefault(pkg);
        expect(row.upgrade).toEqual({ version: def, basis: 'registry-default' });
        expect(semverCompare(def, checked as string)).toBeGreaterThan(0);
      }
    });
  }

  it('har-validator carries its /latest hint and no upgrade', async () => {
    const { result } = await once();
    const text = normalizeHintText(recordedBody('https://registry.npmjs.org/har-validator/latest').deprecated);
    const rows = result.dependencies.filter((d) => d.dependency.name === 'har-validator');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.hints).toEqual([{ kind: 'deprecation-notice', text, sourceUrl: null }]);
      expect(row.upgrade).toBeUndefined();
    }
  });

  it('two replays are equal', async () => {
    const { result } = await once();
    const second = await replay();
    expect(second.result).toEqual(result);
  });

  it('no hint text or upgrade version contains a token prefix', async () => {
    const { result } = await once();
    for (const row of result.dependencies) {
      for (const hint of row.hints ?? []) expect(hint.text).not.toMatch(/ghp_|gho_|github_pat_/);
      expect(row.upgrade?.version ?? '').not.toMatch(/ghp_|gho_|github_pat_/);
    }
  });

  it('the number of recorded npm version documents equals the number of replayed getVersion calls', async () => {
    const { getVersionCalls } = await once();
    expect(recordedVersionDocUrls().length).toBeGreaterThan(0);
    expect(getVersionCalls.length).toBe(recordedVersionDocUrls().length);
  });
});
