import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryCacheStore } from '../../adapters/cache/memory-cache-store';
import { createProductionDeps } from '../../adapters/composition';
import {
  GITHUB_DEFAULT_API_URL,
  GITHUB_DEFAULT_GRAPHQL_URL,
  GITHUB_DEFAULT_WEB_HOST,
} from '../../pipeline/constants';
import type { GithubConfig, RequestContext } from '../../pipeline/ports/http';
import type { Deferrer } from '../../pipeline/ports/runtime';

// Requirements 19.19, 20.1

const getCacheMock = vi.hoisted(() => vi.fn());
vi.mock('@vercel/functions', () => ({ getCache: getCacheMock }));

const UPSTREAM_L1_KEY = Symbol.for('gravekeeper.l1.upstream-cache');
const SCAN_L1_KEY = Symbol.for('gravekeeper.l1.scan-cache');
// Built at runtime so repository secret scans do not flag this fake fixture.
const TOKEN = ['ghp', 'fixture0not0a0real0token0value0000000000'].join('_');

const CONFIG: GithubConfig = {
  apiUrl: GITHUB_DEFAULT_API_URL,
  graphqlUrl: GITHUB_DEFAULT_GRAPHQL_URL,
  webHost: GITHUB_DEFAULT_WEB_HOST,
};

const globals = globalThis as unknown as Record<symbol, unknown>;

function clearSingletons(): void {
  delete globals[UPSTREAM_L1_KEY];
  delete globals[SCAN_L1_KEY];
}

function makeDeferrer(): Deferrer & { flush(): Promise<void> } {
  const pending: Promise<unknown>[] = [];
  return {
    defer: (work) => {
      pending.push(work);
    },
    flush: async () => {
      await Promise.all(pending);
    },
  };
}

function ctx(): RequestContext {
  return { signal: new AbortController().signal, deadlineAtMs: Date.now() + 60_000 };
}

beforeEach(() => {
  clearSingletons();
  getCacheMock.mockReset();
  getCacheMock.mockImplementation(() => ({
    get: async () => null,
    set: async () => undefined,
  }));
});

afterEach(() => {
  clearSingletons();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createProductionDeps L2 switch (19.19)', () => {
  it('off builds no RuntimeCacheStore and never calls getCache', async () => {
    const deferrer = makeDeferrer();
    const deps = createProductionDeps({ GRAVEKEEPER_RUNTIME_CACHE: 'off' }, deferrer, CONFIG);
    await deps.scanStore.set('k', { a: 1 }, 60, { l2Kind: 'scan' });
    await deferrer.flush();
    expect(await deps.scanStore.get('k', { l2Kind: 'scan' })).not.toBeNull(); // L1 still serves
    expect(await deps.scanStore.get('missing', { l2Kind: 'scan' })).toBeNull();
    expect(getCacheMock).not.toHaveBeenCalled();
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['"on"', 'on'],
    ['"OFF"', 'OFF'],
    ['"off " with space', 'off '],
    ['"0"', '0'],
  ])('%s enables L2', async (_label, value) => {
    const deferrer = makeDeferrer();
    const deps = createProductionDeps({ GRAVEKEEPER_RUNTIME_CACHE: value }, deferrer, CONFIG);
    expect(await deps.scanStore.get('miss', { l2Kind: 'scan' })).toBeNull();
    expect(getCacheMock).toHaveBeenCalled();
  });

  it('enabled L2 receives deferred writes for a keyed set', async () => {
    const deferrer = makeDeferrer();
    const deps = createProductionDeps({}, deferrer, CONFIG);
    await deps.scanStore.set('k', { a: 1 }, 60, { l2Kind: 'scan' });
    await deferrer.flush();
    expect(getCacheMock).toHaveBeenCalled();
  });
});

describe('createProductionDeps singletons (22.5)', () => {
  it('reuses the same L1 stores across two calls', async () => {
    const first = createProductionDeps({ GRAVEKEEPER_RUNTIME_CACHE: 'off' }, makeDeferrer(), CONFIG);
    const upstream = globals[UPSTREAM_L1_KEY];
    const scan = globals[SCAN_L1_KEY];
    expect(upstream).toBeInstanceOf(MemoryCacheStore);
    expect(scan).toBeInstanceOf(MemoryCacheStore);

    await first.scanStore.set('shared', { n: 1 }, 60);
    const second = createProductionDeps({ GRAVEKEEPER_RUNTIME_CACHE: 'off' }, makeDeferrer(), CONFIG);

    expect(globals[UPSTREAM_L1_KEY]).toBe(upstream);
    expect(globals[SCAN_L1_KEY]).toBe(scan);
    expect((await second.scanStore.get('shared'))?.value).toEqual({ n: 1 });
  });

  it('keeps the Upstream and Scan L1 stores distinct', async () => {
    createProductionDeps({ GRAVEKEEPER_RUNTIME_CACHE: 'off' }, makeDeferrer(), CONFIG);
    const upstream = globals[UPSTREAM_L1_KEY] as MemoryCacheStore;
    const scan = globals[SCAN_L1_KEY] as MemoryCacheStore;
    expect(upstream).not.toBe(scan);
    await scan.set('only-scan', 1, 60);
    expect(await upstream.get('only-scan')).toBeNull();
  });
});

describe('createProductionDeps token handling (20.1)', () => {
  it('sends the token only in the Authorization header of GitHub API and GraphQL requests', async () => {
    vi.stubEnv('GITHUB_TOKEN', TOKEN);
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    const calls: { url: string; headers: Record<string, string>; body: string | null }[] = [];
    vi.stubGlobal('fetch', async (input: unknown, init?: { headers?: Record<string, string>; body?: unknown }) => {
      calls.push({
        url: String(input),
        headers: { ...(init?.headers ?? {}) },
        body: typeof init?.body === 'string' ? init.body : null,
      });
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const deps = createProductionDeps({ GRAVEKEEPER_RUNTIME_CACHE: 'off' }, makeDeferrer(), CONFIG);
    const ref = { owner: 'o', repo: 'r' };
    const sha = 'a'.repeat(40);
    const gate = null as never;

    expect(deps.sources.github.hasToken()).toBe(true);
    await deps.sources.github.getRepository(ref, ctx(), gate);
    await deps.sources.github.getBranch(ref, 'main', ctx(), gate);
    await deps.sources.github.getTree(ref, sha, ctx(), gate);
    await deps.sources.github.getManifestText(ref, sha, 'package.json', null, ctx(), gate);
    await deps.sources.github.queryRepositories('query { viewer { login } }', {}, ctx(), gate);
    await deps.sources.npm.getLatest('left-pad', ctx());
    await deps.sources.npm.getVersion('left-pad', '1.3.0', ctx());

    expect(calls.length).toBeGreaterThanOrEqual(6);
    const authorized = calls.filter((c) =>
      Object.entries(c.headers).some(
        ([name, value]) => name.toLowerCase() === 'authorization' && value === `Bearer ${TOKEN}`,
      ),
    );
    const apiHost = new URL(GITHUB_DEFAULT_API_URL).host;
    const gqlHost = new URL(GITHUB_DEFAULT_GRAPHQL_URL).host;
    expect(authorized.length).toBe(
      calls.filter((c) => [apiHost, gqlHost].includes(new URL(c.url).host)).length,
    );
    expect(authorized.length).toBeGreaterThanOrEqual(4);
    for (const call of calls) {
      const host = new URL(call.url).host;
      if (![apiHost, gqlHost].includes(host)) {
        expect(JSON.stringify(call)).not.toContain(TOKEN);
      }
      // The token appears nowhere in a URL, a body, or a header other than Authorization.
      expect(call.url).not.toContain(TOKEN);
      expect(call.body ?? '').not.toContain(TOKEN);
      for (const [name, value] of Object.entries(call.headers)) {
        if (name.toLowerCase() !== 'authorization') expect(value).not.toContain(TOKEN);
      }
    }
    expect(calls.some((c) => c.url.includes('raw.githubusercontent.com'))).toBe(true);
    expect(calls.some((c) => c.url.includes('registry.npmjs.org'))).toBe(true);

    expect(logs.join('\n')).not.toContain(TOKEN);
  });

  it('keeps the token out of the returned dependencies, and sends no Authorization without a token', async () => {
    vi.stubEnv('GITHUB_TOKEN', TOKEN);
    const deps = createProductionDeps({ GRAVEKEEPER_RUNTIME_CACHE: 'off' }, makeDeferrer(), CONFIG);
    const serialized = JSON.stringify({
      clock: deps.clock(),
      env: deps.readEnv(),
      keys: Object.keys(deps),
      sourceKeys: Object.keys(deps.sources),
    });
    expect(serialized).not.toContain(TOKEN);
    expect(JSON.stringify(deps)).not.toContain(TOKEN);
    expect(String(deps.readEnv)).not.toContain(TOKEN);

    vi.stubEnv('GITHUB_TOKEN', '');
    const calls: Record<string, string>[] = [];
    vi.stubGlobal('fetch', async (_input: unknown, init?: { headers?: Record<string, string> }) => {
      calls.push({ ...(init?.headers ?? {}) });
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const noToken = createProductionDeps({ GRAVEKEEPER_RUNTIME_CACHE: 'off' }, makeDeferrer(), CONFIG);
    expect(noToken.sources.github.hasToken()).toBe(false);
    await noToken.sources.github.getRepository({ owner: 'o', repo: 'r' }, ctx(), null as never);
    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0]!).map((n) => n.toLowerCase())).not.toContain('authorization');
  });
});
