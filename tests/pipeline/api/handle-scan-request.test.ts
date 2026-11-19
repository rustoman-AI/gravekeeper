// Requirement 21.3, 21.13, 21.14, 21.15, 16.12, 16.13, 23.12 (case 11)
import { describe, expect, it } from 'vitest';
import { createDepsDevSource } from '../../../adapters/depsdev/depsdev-source';
import { createGithubSource } from '../../../adapters/github/github-source';
import { createHttpClient } from '../../../adapters/http/http-client';
import { createNpmSource } from '../../../adapters/npm/npm-source';
import { createOsvSource } from '../../../adapters/osv/osv-source';
import { handleScanRequest } from '../../../pipeline/api/handle-scan-request';
import type { ApiDeps, RawScanRequest } from '../../../pipeline/api/handle-scan-request';
import type { ApiResponse } from '../../../pipeline/api/scan-error';
import {
  BRANCH_MAX_LENGTH,
  SCAN_DEADLINE_MS,
  SCAN_RESPONSE_MARGIN_MS,
} from '../../../pipeline/constants';
import type { SourceName, SourceResult } from '../../../pipeline/ports';
import type { ScanDeps, ScanResult } from '../../../pipeline/scan/types';
import { createFakeRuntime, runUntilSettled } from '../../support/fake-runtime';
import type { FakeRuntime } from '../../support/fake-runtime';
import { createScriptedFetch } from '../../support/scripted-fetch';
import type { Step } from '../../support/scripted-fetch';

const START_MS = Date.parse('2024-06-01T00:00:00.000Z');
const SHA = 'a'.repeat(40);
const BOUND_MS = START_MS + SCAN_DEADLINE_MS + SCAN_RESPONSE_MARGIN_MS;
const PACKAGE_JSON = JSON.stringify({ dependencies: { 'left-pad': '1.0.0' } });

const ok = (body: unknown): SourceResult =>
  ({ kind: 'ok', status: 200, body, headers: {}, fromCache: false }) as SourceResult;
const absent: SourceResult = { kind: 'absent', headers: {}, fromCache: false };
const never = <T>(): Promise<T> => new Promise<T>(() => undefined);

function streamOf(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let sent = false;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent) return;
      sent = true;
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

const post = (body: unknown, extra: Partial<RawScanRequest> = {}): RawScanRequest => {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    method: 'POST',
    contentType: 'application/json',
    contentLength: null,
    body: streamOf(text),
    ...extra,
  };
};

interface Calls {
  github: string[];
  branches: string[];
  cacheSets: number;
  clockReads: number;
}

interface World {
  readonly sources: ScanDeps['sources'];
  readonly calls: Calls;
}

interface WorldOptions {
  /** Replaces the deps.dev package answer. */
  readonly depsdevPackage?: () => Promise<SourceResult>;
  readonly repository?: () => Promise<SourceResult>;
}

function buildWorld(options: WorldOptions = {}): World {
  const calls: Calls = { github: [], branches: [], cacheSets: 0, clockReads: 0 };
  const sources = {
    github: {
      hasToken: () => false,
      getRepository: () => {
        calls.github.push('repository');
        return (
          options.repository?.() ??
          Promise.resolve(ok({ full_name: 'o/r', default_branch: 'main', private: false }))
        );
      },
      getBranch: (_ref: unknown, branch: string) => {
        calls.github.push('branch');
        calls.branches.push(branch);
        return Promise.resolve(ok({ commit: { sha: SHA } }));
      },
      getTree: () => {
        calls.github.push('tree');
        return Promise.resolve(
          ok({ truncated: false, tree: [{ path: 'package.json', type: 'blob', size: 10, sha: 'f'.repeat(40) }] }),
        );
      },
      getManifestText: () =>
        Promise.resolve({
          kind: 'ok',
          status: 200,
          body: PACKAGE_JSON,
          headers: {},
          fromCache: false,
        } as SourceResult<string>),
      queryRepositories: () => Promise.resolve(ok({ data: {} })),
    },
    depsdev: {
      getPackage: options.depsdevPackage ?? (() => Promise.resolve(absent)),
      getVersion: () => Promise.resolve(absent),
      getVersionBatch: () => Promise.resolve(ok({ responses: [] })),
      getAdvisory: () => Promise.resolve(absent),
    },
    osv: {
      queryBatch: () => Promise.resolve(ok({ results: [{}] })),
      getVulnerability: () => Promise.resolve(absent),
    },
    npm: { getLatest: () => Promise.resolve(absent) },
    cratesio: { getOwners: () => Promise.resolve(absent) },
    pypi: { getProject: () => Promise.resolve(absent) },
  } as unknown as ScanDeps['sources'];
  return { sources, calls };
}

function makeDeps(
  sources: ScanDeps['sources'],
  runtime: FakeRuntime,
  calls: Calls,
  env: ReturnType<ApiDeps['readEnv']> = {},
): ApiDeps {
  return {
    sources,
    clock: () => {
      calls.clockReads += 1;
      return runtime.clock();
    },
    timer: runtime.timer,
    random: runtime.random,
    logger: { log: () => undefined },
    scanCache: {
      get: () => Promise.resolve(null),
      set: () => {
        calls.cacheSets += 1;
        return Promise.resolve();
      },
    },
    readEnv: () => env,
  };
}

async function run(request: RawScanRequest, world: World, env?: ReturnType<ApiDeps['readEnv']>) {
  const runtime = createFakeRuntime(START_MS);
  const response = await runUntilSettled(
    handleScanRequest(request, makeDeps(world.sources, runtime, world.calls, env)),
    runtime,
  );
  return { response, runtime };
}

const errorOf = (response: ApiResponse) => {
  if (response.body.ok) throw new Error('expected an error response');
  return response.body.error;
};

describe('handleScanRequest: validation order (R21.3, R21.13, R21.14)', () => {
  it('answers 405 with Allow: POST before the body is read or any source is called', async () => {
    const world = buildWorld();
    const body = streamOf('not json');
    const request: RawScanRequest = {
      method: 'GET',
      contentType: null,
      contentLength: null,
      body,
    };
    const { response } = await run(request, world);
    expect(response.status).toBe(405);
    expect(response.headers['Allow']).toBe('POST');
    expect(response.headers['Cache-Control']).toBe('no-store');
    expect(errorOf(response)).toMatchObject({
      code: 'invalid-request',
      details: { reason: 'method-not-allowed' },
    });
    expect(body.locked).toBe(false);
    expect(world.calls.github).toEqual([]);
    expect(world.calls.clockReads).toBe(0);
  });

  it('compares the method case-sensitively', async () => {
    const { response } = await run(post({ repoUrl: 'https://github.com/o/r' }, { method: 'post' }), buildWorld());
    expect(response.status).toBe(405);
  });

  it('checks the media type (415) before the body size and the JSON', async () => {
    const { response } = await run(post('{', { contentType: 'text/plain', contentLength: '999999999' }), buildWorld());
    expect(response.status).toBe(415);
    expect(errorOf(response)).toMatchObject({ details: { reason: 'unsupported-media-type' } });
  });

  it('checks the declared size (413) before the JSON', async () => {
    const { response } = await run(post('{', { contentLength: '999999999' }), buildWorld());
    expect(response.status).toBe(413);
    expect(errorOf(response)).toMatchObject({ details: { reason: 'body-too-large' } });
  });

  it('checks the JSON (400 invalid-json) before the body shape', async () => {
    const { response } = await run(post('{'), buildWorld());
    expect(response.status).toBe(400);
    expect(errorOf(response)).toMatchObject({ details: { reason: 'invalid-json' } });
  });

  it('reports a body shape error without reading the clock or calling a source', async () => {
    const world = buildWorld();
    const { response } = await run(post({ repoUrl: 'https://github.com/o/r', extra: 1 }), world);
    expect(errorOf(response)).toMatchObject({ details: { reason: 'unknown-field', field: 'body' } });
    expect(world.calls.clockReads).toBe(0);
    expect(world.calls.github).toEqual([]);
  });

  it('returns the configuration error (500) before invalid-url', async () => {
    const world = buildWorld();
    const { response } = await run(post({ repoUrl: 'not a url' }), world, { GITHUB_API_URL: 'ftp://nope' });
    expect(response.status).toBe(500);
    expect(errorOf(response).code).toBe('internal-error');
    expect(world.calls.clockReads).toBe(0);
  });

  it('returns invalid-url for a bad repoUrl when the configuration is valid', async () => {
    const { response } = await run(post({ repoUrl: 'https://example.com/o/r' }), buildWorld());
    expect(response.status).toBe(400);
    expect(errorOf(response)).toMatchObject({ code: 'invalid-url', details: { part: 'host' } });
  });

  it('returns the URL error before the branch checks', async () => {
    const { response } = await run(post({ repoUrl: 'https://example.com/o/r', branch: '-bad' }), buildWorld());
    expect(errorOf(response)).toMatchObject({ code: 'invalid-url', details: { part: 'host' } });
  });

  it('returns invalid-url with part branch for an invalid body branch, before branch-conflict', async () => {
    const world = buildWorld();
    const { response } = await run(
      post({ repoUrl: 'https://github.com/o/r/tree/dev', branch: 'a..b' }),
      world,
    );
    expect(response.status).toBe(400);
    expect(errorOf(response)).toMatchObject({ code: 'invalid-url', details: { part: 'branch' } });
    expect(world.calls.clockReads).toBe(0);
  });

  it.each(['', '-x', 'a b', 'a~b', 'a?b', 'x.lock', 'a@{b', 'a'.repeat(BRANCH_MAX_LENGTH + 1)])(
    'rejects the body branch %j as invalid-url (part branch)',
    async (branch) => {
      const { response } = await run(post({ repoUrl: 'https://github.com/o/r', branch }), buildWorld());
      expect(errorOf(response)).toMatchObject({ code: 'invalid-url', details: { part: 'branch' } });
    },
  );

  it('accepts a maximum-length body branch together with a long repoUrl (no synthetic URL limit)', async () => {
    const world = buildWorld();
    const branch = 'b'.repeat(BRANCH_MAX_LENGTH);
    const owner = 'o'.repeat(39);
    const repoUrl = `https://github.com/${owner}/${'r'.repeat(100)}/`;
    const { response } = await run(post({ repoUrl, branch }), world);
    expect(world.calls.branches).toEqual([branch]);
    expect(response.status).not.toBe(400);
  });

  it('returns branch-conflict when URL and body branches differ, with no upstream request', async () => {
    const world = buildWorld();
    const { response } = await run(
      post({ repoUrl: 'https://github.com/o/r/tree/dev', branch: 'main' }),
      world,
    );
    expect(response.status).toBe(400);
    expect(errorOf(response)).toMatchObject({
      code: 'invalid-request',
      details: { reason: 'branch-conflict', field: 'branch' },
    });
    expect(world.calls.github).toEqual([]);
  });
});

describe('handleScanRequest: branch passed to the pipeline (R21.14 e, R21.15)', () => {
  it.each([
    { name: 'from the URL only', repoUrl: 'https://github.com/o/r/tree/feat%2Fx', branch: undefined, expected: 'feat/x' },
    { name: 'from the body only', repoUrl: 'https://github.com/o/r', branch: 'release/1', expected: 'release/1' },
    { name: 'shared by URL and body', repoUrl: 'https://github.com/o/r/tree/dev', branch: 'dev', expected: 'dev' },
    { name: 'absent (default branch)', repoUrl: 'https://github.com/o/r', branch: undefined, expected: 'main' },
  ])('uses the branch $name', async ({ repoUrl, branch, expected }) => {
    const world = buildWorld();
    const body = branch === undefined ? { repoUrl } : { repoUrl, branch };
    const { response } = await run(post(body), world);
    expect(response.status).toBe(200);
    expect(world.calls.branches).toEqual([expected]);
  });

  it('reads the clock once and uses it for asOf', async () => {
    const world = buildWorld();
    const { response } = await run(post({ repoUrl: 'https://github.com/o/r' }), world);
    expect(world.calls.clockReads).toBeGreaterThanOrEqual(1);
    if (!response.body.ok) throw new Error('expected ok');
    expect(response.body.asOf).toBe(new Date(START_MS).toISOString());
  });
});

describe('handleScanRequest: response margin (R16.12, R16.13)', () => {
  it('answers deadline-exceeded (504) no later than the margin when discovery never settles', async () => {
    const world = buildWorld({ repository: () => never() });
    const { response, runtime } = await run(post({ repoUrl: 'https://github.com/o/r' }), world);
    expect(response.status).toBe(504);
    expect(errorOf(response).code).toBe('deadline-exceeded');
    expect(runtime.clock()).toBeLessThanOrEqual(BOUND_MS);
    expect(runtime.clock()).toBeGreaterThanOrEqual(START_MS + SCAN_DEADLINE_MS);
  });

  it('answers a partial result no later than the margin when a later stage never settles, and stores nothing late', async () => {
    let release: (value: SourceResult) => void = () => undefined;
    const late = new Promise<SourceResult>((resolve) => {
      release = resolve;
    });
    const world = buildWorld({ depsdevPackage: () => late });
    const { response, runtime } = await run(post({ repoUrl: 'https://github.com/o/r' }), world);
    expect(response.status).toBe(200);
    expect(runtime.clock()).toBeLessThanOrEqual(BOUND_MS);
    const body = response.body as { ok: true } & Omit<ScanResult, 'ok'>;
    expect(body.sources.depsdev).not.toBe('ok');
    expect(body.notes.map((n) => n.code)).toContain('scan-deadline-reached');

    // A late answer must neither throw nor reach the Scan_Cache.
    release(absent);
    await runtime.flush();
    while (runtime.advanceToNextTimer()) await runtime.flush();
    expect(world.calls.cacheSets).toBe(0);
  });
});

describe('R23.12 case 11: upstream that never responds, through the real HTTP client', () => {
  it('aborts at Scan_Start + SCAN_DEADLINE_MS and answers a partial result within the margin', async () => {
    const runtime = createFakeRuntime(START_MS);
    const json = (body: unknown, latencyMs = 5000): Step => ({
      latencyMs,
      response: {
        status: 200,
        headers: [['content-type', 'application/json']],
        body: { kind: 'text', text: JSON.stringify(body) },
      },
    });
    const scripted = createScriptedFetch((url): Step => {
      if (url === 'https://api.github.com/repos/o/r') {
        return json({ full_name: 'o/r', default_branch: 'main', private: false });
      }
      if (url.startsWith('https://api.github.com/repos/o/r/branches/')) return json({ commit: { sha: SHA } });
      if (url.startsWith('https://api.github.com/repos/o/r/git/trees/')) {
        return json({ truncated: false, tree: [{ path: 'package.json', type: 'blob', size: 10, sha: 'f'.repeat(40) }] });
      }
      if (url.startsWith('https://raw.githubusercontent.com/')) {
        return { latencyMs: 0, response: { status: 200, body: { kind: 'text', text: PACKAGE_JSON } } };
      }
      return { latencyMs: 'never', response: 'network-error' };
    }, runtime);
    const names: SourceName[] = ['github', 'depsdev', 'osv', 'npm', 'cratesio', 'pypi'];
    const client = createHttpClient({
      fetchImpl: scripted.fetch,
      clock: runtime.clock,
      timer: runtime.timer,
      random: runtime.random,
      logger: { log: () => undefined },
      limiters: Object.fromEntries(names.map((n) => [n, { concurrency: 4, minIntervalMs: 0 }])) as Record<
        SourceName,
        { concurrency: number; minIntervalMs: number }
      >,
      authorizer: () => null,
      secrets: () => [],
      userAgent: 'gravekeeper-test',
    });
    const config = {
      apiUrl: 'https://api.github.com',
      graphqlUrl: 'https://api.github.com/graphql',
      webHost: 'github.com',
    };
    const world = buildWorld();
    const sources = {
      ...world.sources,
      github: createGithubSource(client, config, false),
      depsdev: createDepsDevSource(client),
      osv: createOsvSource(client),
      npm: createNpmSource(client),
    } as ScanDeps['sources'];

    const response = await runUntilSettled(
      handleScanRequest(post({ repoUrl: 'https://github.com/o/r' }), makeDeps(sources, runtime, world.calls)),
      runtime,
    );

    expect(runtime.clock()).toBeLessThanOrEqual(BOUND_MS);
    expect(runtime.clock()).toBeGreaterThanOrEqual(START_MS + SCAN_DEADLINE_MS);
    expect(response.status).toBe(200);
    const body = response.body as { ok: true } & Omit<ScanResult, 'ok'>;
    expect(body.sources.depsdev).toBe('partial');
    expect(body.notes.filter((n) => n.code === 'scan-deadline-reached')).toHaveLength(1);
    const aborted = scripted.calls.filter((c) => c.abortedAtMs !== null);
    // Earlier aborts are per-request timeouts (REQUEST_TIMEOUT_MS); the request in flight at 25 s is cut by the deadline.
    expect(aborted.map((c) => c.abortedAtMs)).toContain(START_MS + SCAN_DEADLINE_MS);
    expect(world.calls.cacheSets).toBe(0);
  });

  it('answers deadline-exceeded (504) when the never-responding upstream is GitHub discovery', async () => {
    const runtime = createFakeRuntime(START_MS);
    // Repository and branch answer after 7 s each, so the tree request starts at 14 s. Its own
    // 20 s total timeout would end at 34 s, so only the scan deadline (25 s) can abort it.
    const slow = (body: unknown): Step => ({
      latencyMs: 7000,
      response: {
        status: 200,
        headers: [['content-type', 'application/json']],
        body: { kind: 'text', text: JSON.stringify(body) },
      },
    });
    const scripted = createScriptedFetch((url): Step => {
      if (url === 'https://api.github.com/repos/o/r') {
        return slow({ full_name: 'o/r', default_branch: 'main', private: false });
      }
      if (url.startsWith('https://api.github.com/repos/o/r/branches/')) return slow({ commit: { sha: SHA } });
      return { latencyMs: 'never', response: 'network-error' };
    }, runtime);
    const names: SourceName[] = ['github', 'depsdev', 'osv', 'npm', 'cratesio', 'pypi'];
    const client = createHttpClient({
      fetchImpl: scripted.fetch,
      clock: runtime.clock,
      timer: runtime.timer,
      random: runtime.random,
      logger: { log: () => undefined },
      limiters: Object.fromEntries(names.map((n) => [n, { concurrency: 4, minIntervalMs: 0 }])) as Record<
        SourceName,
        { concurrency: number; minIntervalMs: number }
      >,
      authorizer: () => null,
      secrets: () => [],
      userAgent: 'gravekeeper-test',
    });
    const world = buildWorld();
    const sources = {
      ...world.sources,
      github: createGithubSource(
        client,
        { apiUrl: 'https://api.github.com', graphqlUrl: 'https://api.github.com/graphql', webHost: 'github.com' },
        false,
      ),
    } as ScanDeps['sources'];
    const response = await runUntilSettled(
      handleScanRequest(post({ repoUrl: 'https://github.com/o/r' }), makeDeps(sources, runtime, world.calls)),
      runtime,
    );
    expect(response.status).toBe(504);
    expect(errorOf(response).code).toBe('deadline-exceeded');
    expect(runtime.clock()).toBeLessThanOrEqual(BOUND_MS);
    expect(world.calls.cacheSets).toBe(0);
  });
});
