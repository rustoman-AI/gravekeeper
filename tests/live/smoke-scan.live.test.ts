import { afterAll, beforeAll, describe, expect } from 'vitest';
import { createProductionDeps } from '../../adapters/composition';
import { readRuntimeEnv } from '../../adapters/runtime/env';
import { createScanCache, handleScanRequest } from '../../pipeline';
import type { ApiDeps, RawScanRequest } from '../../pipeline';
import { readGithubConfig } from '../../pipeline/config/github-config';
import type { Deferrer } from '../../pipeline/ports/runtime';
import { liveIt } from './live-support';

// Live smoke scans: one real scan per fixture repository with the production stack.
// Skipped unless GRAVEKEEPER_LIVE_TESTS=1. The token is only read by the production
// adapters (GITHUB_TOKEN) and is never printed.

const REPOS = ['request/request', 'revmic/canopy', 'ajeetdsouza/zoxide'] as const;
const TIMEOUT = 90_000;
const L1_KEYS = [
  Symbol.for('gravekeeper.l1.upstream-cache'),
  Symbol.for('gravekeeper.l1.scan-cache'),
] as const;

const deferrer: Deferrer = {
  defer(work) {
    work.catch(() => undefined);
  },
};

function clearL1(): void {
  const holder = globalThis as unknown as Record<symbol, unknown>;
  for (const key of L1_KEYS) delete holder[key];
}

function buildDeps(): ApiDeps {
  const env = readRuntimeEnv();
  const parsed = readGithubConfig(env);
  if (!parsed.ok) throw new Error('invalid GitHub configuration');
  const { scanStore, ...rest } = createProductionDeps(env, deferrer, parsed.value);
  return { ...rest, scanCache: createScanCache(scanStore) };
}

function postRequest(repoUrl: string): RawScanRequest {
  const text = JSON.stringify({ repoUrl });
  const request = new Request('http://localhost/api/scan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: text,
  });
  return {
    method: 'POST',
    contentType: 'application/json',
    contentLength: String(new TextEncoder().encode(text).byteLength),
    body: request.body,
  };
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return out;
}

let previousCache: string | undefined;

describe('live smoke scans', () => {
  beforeAll(() => {
    previousCache = process.env.GRAVEKEEPER_RUNTIME_CACHE;
    process.env.GRAVEKEEPER_RUNTIME_CACHE = 'off';
  });

  afterAll(() => {
    if (previousCache === undefined) delete process.env.GRAVEKEEPER_RUNTIME_CACHE;
    else process.env.GRAVEKEEPER_RUNTIME_CACHE = previousCache;
    clearL1();
  });

  for (const repo of REPOS) {
    liveIt(
      `smoke scan ${repo}`,
      async () => {
        clearL1();
        const deps = buildDeps();
        const started = Date.now();
        const response = await handleScanRequest(postRequest(`https://github.com/${repo}`), deps);
        const durationMs = Date.now() - started;

        expect(response.status).toBe(200);
        expect(response.body.ok).toBe(true);
        if (!response.body.ok) return;
        const result = response.body;

        console.info(
          JSON.stringify({
            repo,
            grade: result.summary.grade,
            dependencies: result.dependencies.length,
            counts: result.summary.counts,
            unassessed: result.assessed.filter((a) => a.classification === null).length,
            sources: result.sources,
            notes: countBy(result.notes, (n) => n.code),
            durationMs,
          }),
        );
      },
      TIMEOUT,
    );
  }
});
