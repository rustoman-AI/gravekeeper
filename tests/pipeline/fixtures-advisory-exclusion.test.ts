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
import { readGithubConfig } from '../../pipeline/config/github-config';
import { handleScanRequest } from '../../pipeline/api/handle-scan-request';
import type { ApiDeps, RawScanRequest } from '../../pipeline/api/handle-scan-request';
import { createScanCache } from '../../pipeline/scan/scan-cache';
import type { ScanResult } from '../../pipeline/scan/types';
import { FixtureHttpClient } from '../support/fixture-http-client';
import { createFakeRuntime } from '../support/fake-runtime';

// Requirement 22.5, 22.6, 22.7
// Replays every recorded repository set through handleScanRequest and checks the `excluded` field.

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

function requestFor(set: RepoFixture): RawScanRequest {
  const bytes = new TextEncoder().encode(JSON.stringify({ repoUrl: `https://github.com/${set.owner}/${set.repo}` }));
  return {
    method: 'POST',
    contentType: 'application/json',
    contentLength: null,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
  };
}

async function replay(set: RepoFixture): Promise<{ status: number; body: unknown }> {
  const parsed = readGithubConfig({});
  if (!parsed.ok) throw new Error('default GitHub configuration is invalid');
  const config = parsed.value;
  const runtime = createFakeRuntime(Date.parse(set.asOf));
  const fixture = new FixtureHttpClient(set.dir);
  clients.push(fixture);
  const http = new CachingHttpClient(fixture, new MemoryCacheStore(runtime.clock));
  const deps: ApiDeps = {
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
    deadlineMs: 300_000,
    readEnv: () => ({}),
  };
  const response = await handleScanRequest(requestFor(set), deps);
  return { status: response.status, body: response.body };
}

describe('fixture replay: advisory exclusion kind', () => {
  const sets = repositorySets();

  it('finds the recorded repository sets', () => {
    expect(sets.length).toBeGreaterThan(0);
  });

  for (const set of sets) {
    it(`${set.name}: the response carries excluded, and informational entries match the note`, async () => {
      const response = await replay(set);
      expect(response.status).toBe(200);
      const body = response.body as ScanResult;
      expect(body.ok).toBe(true);

      const informationalByPackage = new Map<string, string[]>();
      for (const d of body.dependencies) {
        const key = `${d.dependency.ecosystem}\u0000${d.dependency.name}`;
        for (const entry of d.advisories) {
          expect(['withdrawn', 'informational', null]).toContain(entry.excluded);
        }
        const ids = d.advisories.filter((e) => e.excluded === 'informational').map((e) => e.id);
        informationalByPackage.set(key, [...new Set(ids)].sort());
      }

      const noted = new Map<string, string[]>();
      for (const n of body.notes) {
        if (n.code !== 'informational-advisory-excluded') continue;
        const details = n.details as { ecosystem: string; name: string; ids: string[] };
        noted.set(`${details.ecosystem}\u0000${details.name}`, [...details.ids].sort());
      }

      for (const [key, ids] of informationalByPackage) {
        expect(ids).toEqual(noted.get(key) ?? []);
      }
      for (const key of noted.keys()) expect(informationalByPackage.has(key)).toBe(true);

      if (set.name.includes('zoxide')) expect(noted.size).toBeGreaterThan(0);
    });
  }
});
