import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
import { createScanCache } from '../../pipeline/scan/scan-cache';
import { runScan } from '../../pipeline/scan/run-scan';
import type { Result } from '../../core';
import type { ScanDeps, ScanError, ScanOutcome } from '../../pipeline/scan/types';
import { FixtureHttpClient } from '../support/fixture-http-client';
import { createFakeRuntime } from '../support/fake-runtime';

// Requirement 23.2, 23.3, 23.4, 23.5
// Replays every recorded repository set through the whole scan, twice, with empty caches.

const FIXTURES = join(__dirname, '..', 'fixtures');

interface RepoFixture {
  readonly name: string;
  readonly dir: string;
  readonly owner: string;
  readonly repo: string;
  readonly asOf: string;
}

function repositorySets(): RepoFixture[] {
  const sets: RepoFixture[] = [];
  for (const entry of readdirSync(FIXTURES, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '_supplementary') continue;
    const dir = join(FIXTURES, entry.name);
    if (!existsSync(join(dir, 'metadata.json'))) continue;
    const meta = JSON.parse(readFileSync(join(dir, 'metadata.json'), 'utf8')) as {
      kind: string;
      canonicalRepoUrl: string | null;
      asOf: string;
    };
    if (meta.kind !== 'npm' && meta.kind !== 'python' && meta.kind !== 'rust') continue;
    const [owner, repo] = new URL(meta.canonicalRepoUrl ?? '').pathname.split('/').filter(Boolean);
    sets.push({ name: entry.name, dir, owner: owner as string, repo: repo as string, asOf: meta.asOf });
  }
  return sets;
}

const clients: FixtureHttpClient[] = [];

afterEach(() => {
  const open = clients.splice(0);
  for (const client of open) client.assertNoMisses();
});

async function replay(set: RepoFixture): Promise<Result<ScanOutcome, ScanError>> {
  const parsed = readGithubConfig({});
  if (!parsed.ok) throw new Error('default GitHub configuration is invalid');
  const config = parsed.value;
  const startedAtMs = Date.parse(set.asOf);
  const runtime = createFakeRuntime(startedAtMs);
  const fixture = new FixtureHttpClient(set.dir);
  clients.push(fixture);
  const http = new CachingHttpClient(fixture, new MemoryCacheStore(runtime.clock));
  // The recorder held a token, so the GitHub source is built with tokenPresent = true.
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
  return runScan(
    {
      repo: { host: GITHUB_DEFAULT_WEB_HOST, owner: set.owner, repo: set.repo, branch: null },
      manifests: [],
      asOf: set.asOf,
      startedAtMs,
    },
    deps,
  );
}

describe('fixture scan replay', () => {
  const sets = repositorySets();

  it('finds the recorded repository sets', () => {
    expect(sets.length).toBeGreaterThan(0);
  });

  for (const set of sets) {
    it(`${set.name}: two replays are equal, ok, with an archived or deprecated dependency`, async () => {
      const first = await replay(set);
      const second = await replay(set);
      expect(first.ok).toBe(true);
      expect(second).toEqual(first);
      if (!first.ok) return;
      const flagged = first.value.result.dependencies.filter(
        (d) => d.facts.archived === true || d.facts.deprecated === true,
      );
      expect(flagged.length).toBeGreaterThan(0);
    });
    it(`${set.name}: versionBasis and advisories are consistent`, async () => {
      const outcome = await replay(set);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      const deps = outcome.value.result.dependencies;
      const counts: Record<string, number> = {};
      for (const d of deps) counts[String(d.versionBasis)] = (counts[String(d.versionBasis)] ?? 0) + 1;
      console.info(`versionBasis ${set.name}: ${JSON.stringify(counts)}`);
      for (const d of deps) {
        // lookupVersion and versionBasis are set together.
        expect(d.lookupVersion === null).toBe(d.versionBasis === null);
        // A positive open-vulnerability count comes with listed advisories.
        const open = d.facts.openVulnerabilityCount as number | null;
        if ((open ?? 0) > 0) expect(d.advisories.length).toBeGreaterThan(0);
        if (open === null) expect(d.advisories).toEqual([]);
      }
      if (set.name === 'request__request') {
        expect(deps.some((d) => d.versionBasis === 'resolved')).toBe(true);
      }
    });
  }
});
