// Requirements 12.13, 12.14, 19.22
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MemoryCacheStore } from '../../../adapters/cache/memory-cache-store';
import { RuntimeCacheStore } from '../../../adapters/cache/runtime-cache-store';
import { TieredCacheStore } from '../../../adapters/cache/tiered-cache-store';
import { CachingHttpClient } from '../../../adapters/http/caching-http-client';
import { createCratesIoSource } from '../../../adapters/cratesio/cratesio-source';
import { createDepsDevSource } from '../../../adapters/depsdev/depsdev-source';
import { createGithubAuthorizer } from '../../../adapters/http/github-authorizer';
import { createHttpClient } from '../../../adapters/http/http-client';
import { createNpmSource } from '../../../adapters/npm/npm-source';
import type { Dependency, Scope } from '../../../core';
import {
  CONCURRENCY_CRATESIO,
  CONCURRENCY_DEPSDEV,
  CONCURRENCY_GITHUB,
  CONCURRENCY_NPM,
  CONCURRENCY_OSV,
  CONCURRENCY_PYPI,
  CRATESIO_MIN_INTERVAL_MS,
  CRATES_OWNERS_TTL_SECONDS,
  GITHUB_DEFAULT_API_URL,
  GITHUB_DEFAULT_GRAPHQL_URL,
  GITHUB_DEFAULT_WEB_HOST,
  PARTIAL_SCAN_TTL_SECONDS,
} from '../../../pipeline/constants';
import type { GithubConfig, SourceName } from '../../../pipeline/ports';
import { WorkLedger } from '../../../pipeline/scan/ledger';
import { createUnitRunner } from '../../../pipeline/scan/run-unit';
import { runRegistryStage } from '../../../pipeline/scan/stage-registries';
import { targetKey } from '../../../pipeline/scan/targets';
import type { LookupTarget } from '../../../pipeline/scan/types';
import { createCollectingLogger, createFakeL2 } from '../../support/arbitraries/l2';
import { createFakeRuntime, runUntilSettled } from '../../support/fake-runtime';
import { createScriptedFetch } from '../../support/scripted-fetch';

const START = 1_000_000;
const GH_CONFIG: GithubConfig = {
  apiUrl: GITHUB_DEFAULT_API_URL,
  graphqlUrl: GITHUB_DEFAULT_GRAPHQL_URL,
  webHost: GITHUB_DEFAULT_WEB_HOST,
};
const sha256Hex = (text: string): Promise<string> =>
  Promise.resolve(createHash('sha256').update(text).digest('hex'));

const OWNERS_BODY = JSON.stringify({ users: [{ login: 'alice', kind: 'user' }] });

function setup(missing: readonly string[] = []) {
  const runtime = createFakeRuntime(START);
  const scripted = createScriptedFetch((rawUrl) => {
    const url = new URL(rawUrl);
    if (url.hostname === 'crates.io') {
      const name = decodeURIComponent(url.pathname.split('/')[4] ?? '');
      if (missing.includes(name)) return { latencyMs: 0, response: { status: 404 } };
    }
    return {
      latencyMs: 0,
      response: {
        status: 200,
        headers: [['content-type', 'application/json']],
        body: { kind: 'text', text: url.hostname === 'crates.io' ? OWNERS_BODY : '{}' },
      },
    };
  }, runtime);
  const l2 = createFakeL2(runtime);
  const { logger } = createCollectingLogger();
  const l2Store = new RuntimeCacheStore({
    getCache: l2.getCache,
    sha256Hex,
    timer: runtime.timer,
    clock: runtime.clock,
    logger,
  });
  const pending: Promise<unknown>[] = [];
  const limiters: Record<SourceName, { concurrency: number; minIntervalMs: number }> = {
    github: { concurrency: CONCURRENCY_GITHUB, minIntervalMs: 0 },
    depsdev: { concurrency: CONCURRENCY_DEPSDEV, minIntervalMs: 0 },
    osv: { concurrency: CONCURRENCY_OSV, minIntervalMs: 0 },
    npm: { concurrency: CONCURRENCY_NPM, minIntervalMs: 0 },
    cratesio: { concurrency: CONCURRENCY_CRATESIO, minIntervalMs: CRATESIO_MIN_INTERVAL_MS },
    pypi: { concurrency: CONCURRENCY_PYPI, minIntervalMs: 0 },
  };
  const http = createHttpClient({
    fetchImpl: scripted.fetch,
    clock: runtime.clock,
    timer: runtime.timer,
    random: runtime.random,
    logger: { log: (): void => undefined },
    limiters,
    authorizer: createGithubAuthorizer(() => null, GH_CONFIG),
    secrets: () => [],
    userAgent: 'gravekeeper-test',
  });
  /** A new instance: empty L1, same L2. */
  const newStore = (): TieredCacheStore =>
    new TieredCacheStore({
      l1: new MemoryCacheStore(runtime.clock),
      l2: l2Store,
      deferrer: { defer: (p) => void pending.push(p) },
    });
  const settle = async (): Promise<void> => {
    await runUntilSettled(Promise.all(pending.splice(0)), runtime);
  };
  const advanceTo = (targetMs: number): void => {
    runtime.timer.setTimeout(() => undefined, targetMs - runtime.clock());
    while (runtime.clock() < targetMs && runtime.advanceToNextTimer()) {
      // fire timers until the clock reaches the target
    }
  };
  const cratesCalls = (): string[] =>
    scripted.calls
      .filter((c) => new URL(c.url).hostname === 'crates.io')
      .map((c) => decodeURIComponent(new URL(c.url).pathname.split('/')[4] ?? ''));

  const run = async (
    store: TieredCacheStore,
    names: readonly string[],
    scopes: Readonly<Record<string, Scope>> = {},
  ) => {
    const client = new CachingHttpClient(http, store);
    const sources = {
      depsdev: createDepsDevSource(client),
      npm: createNpmSource(client),
      cratesio: createCratesIoSource({ http: client, userAgent: 'gravekeeper-test' }),
    };
    const controller = new AbortController();
    const ledger = new WorkLedger();
    const targets: LookupTarget[] = names.map((name) => ({
      ecosystem: 'cargo',
      name,
      versionSpecs: ['1'],
    }));
    const dependencies: Dependency[] = names.map((name) => ({
      name,
      rawName: name,
      ecosystem: 'cargo',
      versionSpec: '1',
      scope: scopes[name] ?? 'runtime',
      sourceKind: 'registry',
    }));
    const result = await runUntilSettled(
      runRegistryStage({
        sources,
        runner: createUnitRunner(ledger, controller.signal),
        ctx: { signal: controller.signal, deadlineAtMs: 0 },
        targets,
        dependencies,
      }),
      runtime,
    );
    await settle();
    return result;
  };
  return { runtime, l2, newStore, run, advanceTo, cratesCalls, settle };
}

describe('crates.io owners with the caching client (R12.14)', () => {
  it('requests owners in scope order, then name, one at a time', async () => {
    const t = setup();
    const scopes: Record<string, Scope> = {
      zopt: 'optional',
      adev: 'dev',
      bbuild: 'build',
      zrun: 'runtime',
      arun: 'runtime',
      mdev: 'dev',
    };
    await t.run(t.newStore(), Object.keys(scopes), scopes);
    expect(t.cratesCalls()).toEqual(['arun', 'zrun', 'bbuild', 'adev', 'mdev', 'zopt']);
  });
});

describe('crates.io owners cache (R12.13)', () => {
  it('sends no request for an unexpired owners entry in L1', async () => {
    const t = setup();
    const store = t.newStore();
    await t.run(store, ['serde', 'rand']);
    expect(t.cratesCalls()).toEqual(['rand', 'serde']);
    const second = await t.run(store, ['serde', 'rand']);
    expect(t.cratesCalls()).toHaveLength(2);
    for (const name of ['serde', 'rand']) {
      expect(second.cratesOwners.get(targetKey('cargo', name))).toMatchObject({
        kind: 'ok',
        fromCache: true,
      });
    }
  });

  it('sends no request for an unexpired owners entry in L2 after the L1 is lost', async () => {
    const t = setup();
    await t.run(t.newStore(), ['serde']);
    expect(t.cratesCalls()).toEqual(['serde']);
    expect(t.l2.calls.some((c) => c.op === 'set')).toBe(true);
    const second = await t.run(t.newStore(), ['serde']);
    expect(t.cratesCalls()).toEqual(['serde']);
    expect(second.cratesOwners.get(targetKey('cargo', 'serde'))).toMatchObject({
      kind: 'ok',
      fromCache: true,
    });
  });

  it('reads a stored 404 marker as absent without a request, in L1 and in L2', async () => {
    const t = setup(['ghost']);
    const store = t.newStore();
    const first = await t.run(store, ['ghost']);
    expect(first.cratesOwners.get(targetKey('cargo', 'ghost'))).toMatchObject({ kind: 'absent' });
    expect(t.cratesCalls()).toEqual(['ghost']);

    const fromL1 = await t.run(store, ['ghost']);
    expect(fromL1.cratesOwners.get(targetKey('cargo', 'ghost'))).toMatchObject({
      kind: 'absent',
      fromCache: true,
    });
    const fromL2 = await t.run(t.newStore(), ['ghost']);
    expect(fromL2.cratesOwners.get(targetKey('cargo', 'ghost'))).toMatchObject({
      kind: 'absent',
      fromCache: true,
    });
    expect(t.cratesCalls()).toEqual(['ghost']);
  });
});

describe('owners entry lifetime against the partial Scan_Result (R19.22)', () => {
  it('keeps the owners entry after PARTIAL_SCAN_TTL_SECONDS and drops it after CRATES_OWNERS_TTL_SECONDS', async () => {
    expect(CRATES_OWNERS_TTL_SECONDS).toBeGreaterThan(PARTIAL_SCAN_TTL_SECONDS);
    const t = setup();
    const store = t.newStore();
    await t.run(store, ['serde']);
    // Stands in for a partial Scan_Result stored at the same instant.
    await store.set('partial-scan', { n: 1 }, PARTIAL_SCAN_TTL_SECONDS, { l2Kind: 'scan' });
    await t.settle();
    const storedAt = START; // the first crates.io request waits for no interval

    t.advanceTo(storedAt + (PARTIAL_SCAN_TTL_SECONDS + 1) * 1000 + 10);
    expect(await runUntilSettled(store.get('partial-scan', { l2Kind: 'scan' }), t.runtime)).toBeNull();
    await t.run(store, ['serde']);
    expect(t.cratesCalls()).toEqual(['serde']);
    await t.run(t.newStore(), ['serde']);
    expect(t.cratesCalls()).toEqual(['serde']);

    t.advanceTo(storedAt + CRATES_OWNERS_TTL_SECONDS * 1000 + 10);
    await t.run(t.newStore(), ['serde']);
    expect(t.cratesCalls()).toEqual(['serde', 'serde']);
  });
});
