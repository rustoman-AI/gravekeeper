// Feature: scan-accuracy, Property 11: The cache header is present on 200 only and never changes the body
// Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.7, 7.8
// Requirements 7.1, 7.2, 7.3, 7.4, 7.7, 7.8
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MemoryCacheStore } from '../../../adapters/cache/memory-cache-store';
import { handleScanRequest } from '../../../pipeline/api/handle-scan-request';
import type { ApiDeps, RawScanRequest } from '../../../pipeline/api/handle-scan-request';
import type { ApiResponse } from '../../../pipeline/api/scan-error';
import { CACHE_STATUS_HEADER } from '../../../pipeline/constants';
import type { SourceResult } from '../../../pipeline/ports';
import { createScanCache } from '../../../pipeline/scan/scan-cache';
import type { ScanDeps } from '../../../pipeline/scan/types';
import { createFakeRuntime, runUntilSettled } from '../../support/fake-runtime';
import { cfg } from '../../support/fc-config';

const START_MS = Date.parse('2024-06-01T00:00:00.000Z');
const LATER_MS = START_MS + 3_600_000;
const SHA = 'a'.repeat(40);
const PACKAGE_JSON = JSON.stringify({ dependencies: { 'left-pad': '1.0.0' } });

const ok = (body: unknown): SourceResult =>
  ({ kind: 'ok', status: 200, body, headers: {}, fromCache: false }) as SourceResult;
const absent: SourceResult = { kind: 'absent', headers: {}, fromCache: false };

type Upstream = 'ok' | 'repo-absent' | 'branch-absent';

function buildSources(upstream: Upstream): ScanDeps['sources'] {
  return {
    github: {
      hasToken: () => true,
      getRepository: () =>
        Promise.resolve(
          upstream === 'repo-absent' ? absent : ok({ full_name: 'Owner/Repo', default_branch: 'main', private: false }),
        ),
      getBranch: () => Promise.resolve(upstream === 'branch-absent' ? absent : ok({ commit: { sha: SHA } })),
      getTree: () =>
        Promise.resolve(
          ok({ truncated: false, tree: [{ path: 'package.json', type: 'blob', size: 10, sha: 'f'.repeat(40) }] }),
        ),
      getManifestText: () =>
        Promise.resolve({ kind: 'ok', status: 200, body: PACKAGE_JSON, headers: {}, fromCache: false } as SourceResult<string>),
      queryRepositories: () =>
        Promise.resolve(
          ok({
            data: {
              rateLimit: { remaining: 4000, resetAt: '2024-07-01T01:00:00.000Z' },
              r0: { nameWithOwner: 'x/y', isArchived: false, defaultBranchRef: { target: { committedDate: '2024-01-01T00:00:00Z' } } },
            },
          }),
        ),
    },
    depsdev: {
      getPackage: (_system: string, name: string) =>
        Promise.resolve(
          ok({
            versions: [
              { versionKey: { system: 'NPM', name, version: '1.0.0' }, isDefault: true, isDeprecated: false, publishedAt: '2023-12-31T00:00:00Z' },
            ],
          }),
        ),
      getVersion: () => Promise.resolve(absent),
      getVersionBatch: (requests: { system: string; name: string; version: string }[]) =>
        Promise.resolve(
          ok({
            responses: requests.map((r) => ({
              request: { versionKey: { system: r.system.toUpperCase(), name: r.name, version: r.version } },
              version: { relatedProjects: [{ relationType: 'SOURCE_REPO', projectKey: { id: 'github.com/acme/alpha' } }] },
            })),
          }),
        ),
      getAdvisory: () => Promise.resolve(absent),
    },
    osv: {
      queryBatch: (queries: unknown[]) => Promise.resolve(ok({ results: queries.map(() => ({})) })),
      getVulnerability: () => Promise.resolve(absent),
    },
    npm: { getVersion: () => Promise.resolve(absent), getLatest: () => Promise.resolve(ok({ maintainers: [{ name: 'a' }, { name: 'b' }] })) },
    cratesio: { getOwners: () => Promise.resolve(absent) },
    pypi: { getProject: () => Promise.resolve(absent) },
  } as unknown as ScanDeps['sources'];
}

function streamOf(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

const post = (body: unknown, over: Partial<RawScanRequest> = {}): RawScanRequest => ({
  method: 'POST',
  contentType: 'application/json',
  contentLength: null,
  body: streamOf(typeof body === 'string' ? body : JSON.stringify(body)),
  ...over,
});

interface Server {
  /** Number of Scan_Cache reads that returned a stored result. */
  hits: number;
  call(request: RawScanRequest, nowMs: number, upstream?: Upstream): Promise<ApiResponse>;
}

/** One route with its own Scan_Cache; the cache store clock stays at START_MS. */
function createServer(): Server {
  const scanCache = createScanCache(new MemoryCacheStore(() => START_MS));
  const server: Server = {
    hits: 0,
    async call(request, nowMs, upstream = 'ok') {
      const runtime = createFakeRuntime(nowMs);
      const deps: ApiDeps = {
        sources: buildSources(upstream),
        clock: runtime.clock,
        timer: runtime.timer,
        random: runtime.random,
        logger: { log: () => undefined },
        scanCache: {
          get: async (key) => {
            const found = await scanCache.get(key);
            if (found !== null) server.hits += 1;
            return found;
          },
          set: (key, value, ttl) => scanCache.set(key, value, ttl),
        },
        readEnv: () => ({}),
      };
      return runUntilSettled(handleScanRequest(request, deps), runtime);
    },
  };
  return server;
}

const arbCase = (word: string): fc.Arbitrary<string> =>
  fc
    .array(fc.boolean(), { minLength: word.length, maxLength: word.length })
    .map((flags) => [...word].map((ch, i) => (flags[i] === true ? ch.toUpperCase() : ch.toLowerCase())).join(''));

/** A spelling variant of github.com/Owner/Repo. */
const arbSpelling: fc.Arbitrary<string> = fc
  .record({
    scheme: fc.constantFrom('', 'http://', 'https://', 'HTTPS://'),
    www: fc.boolean(),
    hostUpper: fc.boolean(),
    owner: arbCase('Owner'),
    repo: arbCase('Repo'),
    git: fc.boolean(),
    slash: fc.boolean(),
    branch: fc.constantFrom(null, 'main'),
    pad: fc.constantFrom('', ' '),
  })
  .map((v) => {
    const host = (v.www ? 'www.' : '') + (v.hostUpper ? 'GitHub.com' : 'github.com');
    const tree = v.branch === null ? '' : '/tree/' + v.branch;
    return v.pad + v.scheme + host + '/' + v.owner + '/' + v.repo + (v.git ? '.git' : '') + tree + (v.slash ? '/' : '') + v.pad;
  });

const arbScenario = fc.oneof(
  fc.record({
    kind: fc.constant<'scan'>('scan'),
    repoUrl: arbSpelling,
    upstream: fc.constantFrom<Upstream>('ok', 'ok', 'repo-absent', 'branch-absent'),
  }),
  fc.record({
    kind: fc.constant<'rejected'>('rejected'),
    repoUrl: fc.constantFrom('https://example.com/o/r', 'not a url', '', 'https://github.com/o'),
    upstream: fc.constant<Upstream>('ok'),
  }),
);

describe('Cache_Status_Header', () => {
  it('Property 11: The cache header is present on 200 only and never changes the body', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbScenario,
        arbSpelling,
        fc.constantFrom('POST', 'GET', 'PUT'),
        fc.constantFrom<string | null>('application/json', 'text/plain', null),
        async (scenario, otherSpelling, method, contentType) => {
          const request = (url: string): RawScanRequest =>
            post({ repoUrl: url }, { method, contentType });
          const server = createServer();

          // Every response, 200 or not: the header exists if and only if the status is 200.
          const first = await server.call(request(scenario.repoUrl), START_MS, scenario.upstream);
          const second = await server.call(request(scenario.repoUrl), START_MS, scenario.upstream);
          for (const response of [first, second]) {
            const header = response.headers[CACHE_STATUS_HEADER];
            if (response.status === 200) {
              expect(header === 'hit' || header === 'miss').toBe(true);
              expect(response.cache).toBe(header);
            } else {
              expect(header).toBeUndefined();
              expect(response.cache).toBeNull();
            }
            expect(JSON.stringify(response.body)).not.toContain('fromCache');
          }

          const expectFresh = method === 'POST' && contentType === 'application/json' && scenario.kind === 'scan' && scenario.upstream === 'ok';
          if (!expectFresh) {
            expect(server.hits).toBe(0);
            return;
          }
          // A cold cache is a miss, the second identical scan a hit, and `hit` means the Scan_Cache answered.
          expect(first.status).toBe(200);
          expect(first.headers[CACHE_STATUS_HEADER]).toBe('miss');
          expect(second.status).toBe(200);
          expect(second.headers[CACHE_STATUS_HEADER]).toBe('hit');
          expect(server.hits).toBe(1);
          expect(JSON.stringify(second.body)).toBe(JSON.stringify(first.body));

          // A spelling variant at a later clock is a hit whose body equals the fresh scan at the cached asOf.
          const variant = await server.call(request(otherSpelling), LATER_MS);
          expect(variant.headers[CACHE_STATUS_HEADER]).toBe('hit');
          const fresh = await createServer().call(request(otherSpelling), START_MS);
          expect(fresh.headers[CACHE_STATUS_HEADER]).toBe('miss');
          expect(JSON.stringify(variant.body)).toBe(JSON.stringify(fresh.body));
        },
      ),
      cfg(),
    );
  });
});
