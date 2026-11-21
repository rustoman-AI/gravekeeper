// Feature: scan-pipeline, Property 64: The route always answers with the declared union
// Requirement 21.12 (with 21.3, 21.5, 21.6, 21.9, 21.13)
import * as fc from 'fast-check';
import { describe, it } from 'vitest';
import { handleScanRequest } from '../../../pipeline/api/handle-scan-request';
import type { ApiDeps, RawScanRequest } from '../../../pipeline/api/handle-scan-request';
import type { ApiResponse } from '../../../pipeline/api/scan-error';
import { isValidBranchName } from '../../../pipeline/url/parse-repo-url';
import { CACHE_STATUS_HEADER, REQUEST_BODY_MAX_BYTES } from '../../../pipeline/constants';
import type { SourceResult } from '../../../pipeline/ports';
import type { ScanDeps } from '../../../pipeline/scan/types';
import { createFakeRuntime, runUntilSettled } from '../../support/fake-runtime';
import { cfg } from '../../support/fc-config';

const START_MS = Date.parse('2024-06-01T00:00:00.000Z');
const SHA = 'a'.repeat(40);
const PACKAGE_JSON = JSON.stringify({ dependencies: { 'left-pad': '1.0.0' } });

const ok = (body: unknown): SourceResult =>
  ({ kind: 'ok', status: 200, body, headers: {}, fromCache: false }) as SourceResult;
const absent: SourceResult = { kind: 'absent', headers: {}, fromCache: false };

type Upstream = 'ok' | 'repo-absent' | 'branch-absent';

function buildSources(upstream: Upstream): ScanDeps['sources'] {
  return {
    github: {
      hasToken: () => false,
      getRepository: () =>
        Promise.resolve(
          upstream === 'repo-absent' ? absent : ok({ full_name: 'o/r', default_branch: 'main', private: false }),
        ),
      getBranch: () => Promise.resolve(upstream === 'branch-absent' ? absent : ok({ commit: { sha: SHA } })),
      getTree: () =>
        Promise.resolve(
          ok({ truncated: false, tree: [{ path: 'package.json', type: 'blob', size: 10, sha: 'f'.repeat(40) }] }),
        ),
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
      getPackage: () => Promise.resolve(absent),
      getVersion: () => Promise.resolve(absent),
      getVersionBatch: () => Promise.resolve(ok({ responses: [] })),
      getAdvisory: () => Promise.resolve(absent),
    },
    osv: {
      queryBatch: () => Promise.resolve(ok({ results: [{}] })),
      getVulnerability: () => Promise.resolve(absent),
    },
    npm: { getVersion: () => Promise.resolve(absent), getLatest: () => Promise.resolve(absent) },
    cratesio: { getOwners: () => Promise.resolve(absent) },
    pypi: { getProject: () => Promise.resolve(absent) },
  } as unknown as ScanDeps['sources'];
}

function streamOfChunks(bytes: Uint8Array, chunkSize: number): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}

interface Scenario {
  readonly method: string;
  readonly contentType: string | null;
  readonly contentLength: string | null;
  readonly bytes: Uint8Array;
  readonly hasBody: boolean;
  readonly chunkSize: number;
  readonly upstream: Upstream;
  readonly badConfig: boolean;
}

const enc = (text: string): Uint8Array => new TextEncoder().encode(text);

const arbMethod = fc.oneof(
  fc.constantFrom('POST', 'GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'post', 'Post', 'pOST', ''),
  fc.string({ maxLength: 12 }),
  fc.constant('POST'),
  fc.constant('POST'),
);

const arbContentType = fc.oneof(
  fc.constant<string | null>(null),
  fc.constantFrom(
    'application/json',
    'application/json; charset=utf-8',
    'Application/JSON',
    'application/json;charset=UTF-8',
    'application/jsonx',
    'application/problem+json',
    'text/plain',
    'text/json',
    'multipart/form-data; boundary=x',
    '',
    ' application/json ',
  ),
  fc.string({ maxLength: 30 }),
);

const arbRepoUrl = fc.oneof(
  fc.constantFrom(
    'https://github.com/o/r',
    'https://github.com/o/r/',
    'https://github.com/o/r/tree/dev',
    'https://github.com/o/r/tree/feat%2Fx',
    'https://example.com/o/r',
    'https://github.com/o',
    'https://github.com/o/r/issues',
    'not a url',
    '',
  ),
  fc.string({ maxLength: 40 }),
);

const arbBranch = fc.oneof(
  fc.constantFrom('main', 'dev', 'release/1', '', '-x', 'a..b', 'a b', 'x.lock'),
  fc.string({ maxLength: 20 }),
);

const arbManifests = fc.oneof(
  fc.constant([] as unknown[]),
  fc.constant(['package.json']),
  fc.constant(['missing/package.json']),
  fc.array(fc.string({ maxLength: 12 }), { maxLength: 60 }),
  fc.array(fc.jsonValue(), { maxLength: 3 }),
);

const arbRequestObject = fc
  .record(
    {
      repoUrl: fc.oneof(arbRepoUrl, fc.jsonValue()),
      branch: fc.oneof(arbBranch, fc.jsonValue()),
      manifests: fc.oneof(arbManifests, fc.jsonValue()),
      extra: fc.jsonValue(),
    },
    { requiredKeys: [] },
  )
  .map((r) => {
    const { extra, ...rest } = r;
    return extra === undefined || rest.repoUrl === undefined ? rest : { ...rest, extra };
  });

const arbPlainRequest = fc
  .record({ repoUrl: arbRepoUrl, branch: fc.option(arbBranch, { nil: undefined }) })
  .map((r) => (r.branch === undefined ? { repoUrl: r.repoUrl } : r));

const arbOkishJson = fc.oneof(
  fc.constant({ repoUrl: 'https://github.com/o/r' }),
  arbPlainRequest,
  arbRequestObject,
);

const arbBytes: fc.Arbitrary<Uint8Array> = fc.oneof(
  { weight: 4, arbitrary: arbOkishJson.map((v) => enc(JSON.stringify(v))) },
  { weight: 2, arbitrary: fc.jsonValue().map((v) => enc(JSON.stringify(v))) },
  { weight: 2, arbitrary: fc.string({ maxLength: 80 }).map(enc) },
  { weight: 2, arbitrary: fc.uint8Array({ maxLength: 120 }) },
  { weight: 1, arbitrary: fc.constant(new Uint8Array(0)) },
  { weight: 1, arbitrary: fc.constantFrom('{', '[', 'null', '1', '"s"', '\ufeff{}').map(enc) },
  // Valid JSON padded with whitespace to a size around REQUEST_BODY_MAX_BYTES.
  {
    weight: 3,
    arbitrary: fc.tuple(arbOkishJson, fc.integer({ min: -4, max: 4 })).map(([value, delta]) => {
      const head = enc(JSON.stringify(value));
      const size = Math.max(head.length, REQUEST_BODY_MAX_BYTES + delta);
      const out = new Uint8Array(size).fill(0x20);
      out.set(head, 0);
      return out;
    }),
  },
  // Pure random bytes around the limit.
  {
    weight: 1,
    arbitrary: fc
      .integer({ min: -2, max: 2 })
      .chain((delta) => fc.uint8Array({ minLength: REQUEST_BODY_MAX_BYTES + delta, maxLength: REQUEST_BODY_MAX_BYTES + delta })),
  },
);

const arbScenario: fc.Arbitrary<Scenario> = fc
  .record({
    method: arbMethod,
    contentType: fc.oneof(
      { weight: 3, arbitrary: fc.constant<string | null>('application/json') },
      { weight: 2, arbitrary: arbContentType },
    ),
    bytes: arbBytes,
    hasBody: fc.boolean(),
    chunkSize: fc.constantFrom(1, 7, 1024, 100_000),
    lengthMode: fc.constantFrom('none', 'exact', 'over', 'under', 'junk', 'huge'),
    junk: fc.string({ maxLength: 12 }),
    upstream: fc.constantFrom<Upstream>('ok', 'ok', 'ok', 'repo-absent', 'branch-absent'),
    badConfig: fc.constantFrom(false, false, false, true),
  })
  .map(({ lengthMode, junk, hasBody, bytes, chunkSize, ...rest }) => {
    const n = bytes.length;
    const contentLength =
      lengthMode === 'none'
        ? null
        : lengthMode === 'exact'
          ? String(n)
          : lengthMode === 'over'
            ? String(n + REQUEST_BODY_MAX_BYTES)
            : lengthMode === 'under'
              ? String(Math.max(0, n - 1))
              : lengthMode === 'huge'
                ? '99999999999999999999999'
                : junk;
    return { ...rest, contentLength, bytes, hasBody, chunkSize };
  });

const RESULT_KEYS = [
  'asOf',
  'assessed',
  'capped',
  'dependencies',
  'discovery',
  'manifests',
  'notes',
  'ok',
  'repo',
  'sources',
  'summary',
];
const ERROR_CODES = [
  'invalid-request',
  'invalid-url',
  'too-many-manifests',
  'manifest-not-found',
  'repo-not-found',
  'branch-not-found',
  'upstream-unavailable',
  'deadline-exceeded',
  'internal-error',
];
const STATUSES = [200, 400, 404, 405, 413, 415, 500, 502, 503, 504];
const REASONS = [
  'invalid-json',
  'invalid-type',
  'unknown-field',
  'missing-field',
  'too-many-items',
  'branch-conflict',
  'body-too-large',
  'unsupported-media-type',
  'method-not-allowed',
];
const REASONS_WITH_FIELD = ['invalid-type', 'unknown-field', 'missing-field', 'too-many-items', 'branch-conflict'];
const FIELDS = ['body', 'repoUrl', 'branch', 'manifests'];
const PARTS = ['url', 'host', 'path', 'owner', 'repository', 'branch'];
const SOURCES = ['github', 'depsdev', 'osv', 'npm', 'cratesio', 'pypi'];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const keysOf = (v: Record<string, unknown>): string[] => Object.keys(v).sort();

/** Returns a description of the first violation of R21.12, or null. */
function violation(response: ApiResponse): string | null {
  const { status, headers, body } = response;
  if (!STATUSES.includes(status)) return `status ${String(status)} is outside the declared set`;
  if (headers['Content-Type'] !== 'application/json') return 'Content-Type is not application/json';
  if (headers['Cache-Control'] !== 'no-store') return 'Cache-Control is not no-store';
  if ((headers['Allow'] !== undefined) !== (status === 405)) return 'Allow is present iff status is 405';
  if (headers['Allow'] !== undefined && headers['Allow'] !== 'POST') return 'Allow is not POST';
  if (headers['Retry-After'] !== undefined && status !== 503) return 'Retry-After on a non-503 status';
  if (status === 503 && !/^[1-9]\d*$/.test(headers['Retry-After'] ?? '')) return '503 without a valid Retry-After';
  const allowedHeaders = ['Content-Type', 'Cache-Control', 'Allow', 'Retry-After', CACHE_STATUS_HEADER];
  if (Object.keys(headers).some((h) => !allowedHeaders.includes(h))) return 'unexpected header';
  const cacheHeader = headers[CACHE_STATUS_HEADER];
  if ((cacheHeader !== undefined) !== (status === 200)) return 'cache header is present iff status is 200';
  if (cacheHeader !== undefined && cacheHeader !== 'hit' && cacheHeader !== 'miss') return 'cache header is neither hit nor miss';
  if (response.cache !== (cacheHeader ?? null)) return 'cache field differs from the cache header';

  const raw: unknown = body;
  if (!isRecord(raw)) return 'body is not an object';
  if (raw['ok'] === true) {
    if (status !== 200) return 'ok body with a non-200 status';
    const keys = keysOf(raw);
    if (JSON.stringify(keys) !== JSON.stringify(RESULT_KEYS)) return `ok body keys ${keys.join(',')}`;
    return null;
  }
  if (raw['ok'] !== false) return 'ok is neither true nor false';
  if (status === 200) return 'error body with status 200';
  if (JSON.stringify(keysOf(raw)) !== JSON.stringify(['error', 'ok'])) return 'error body has extra keys';
  const error = raw['error'];
  if (!isRecord(error)) return 'error is not an object';
  const code = error['code'];
  if (typeof code !== 'string' || !ERROR_CODES.includes(code)) return `unknown code ${String(code)}`;
  if (typeof error['message'] !== 'string' || error['message'] === '') return 'message is not a non-empty string';
  const extra = Object.keys(error).filter((k) => !['code', 'message', 'details'].includes(k));
  if (extra.length > 0) return `error has extra keys ${extra.join(',')}`;
  const hasDetails = 'details' in error;
  const details = error['details'];
  if (hasDetails && !isRecord(details)) return 'details is present but not an object';
  const d = isRecord(details) ? details : {};
  const dKeys = keysOf(d);
  const onlyKeys = (allowed: string[]) => dKeys.every((k) => allowed.includes(k));

  switch (code) {
    case 'invalid-request': {
      if (!hasDetails) return 'invalid-request without details';
      const reason = d['reason'];
      if (typeof reason !== 'string' || !REASONS.includes(reason)) return `bad reason ${String(reason)}`;
      if (!onlyKeys(['reason', 'field'])) return 'invalid-request details has extra keys';
      const field = d['field'];
      if (REASONS_WITH_FIELD.includes(reason)) {
        if (typeof field !== 'string' || !FIELDS.includes(field)) return `reason ${reason} needs a valid field`;
      } else if (field !== undefined) return `reason ${reason} must not carry a field`;
      const expected =
        reason === 'method-not-allowed' ? 405 : reason === 'unsupported-media-type' ? 415 : reason === 'body-too-large' ? 413 : 400;
      return status === expected ? null : `invalid-request/${reason} with status ${String(status)}`;
    }
    case 'invalid-url':
      if (!hasDetails || !onlyKeys(['part']) || typeof d['part'] !== 'string' || !PARTS.includes(d['part'])) {
        return 'invalid-url details';
      }
      return status === 400 ? null : 'invalid-url status';
    case 'too-many-manifests':
      if (!hasDetails || !onlyKeys(['limit', 'candidates']) || typeof d['limit'] !== 'number' || !isStringArray(d['candidates'])) return 'too-many-manifests details';
      return status === 400 ? null : 'too-many-manifests status';
    case 'manifest-not-found':
      if (!hasDetails || !onlyKeys(['path', 'candidates']) || typeof d['path'] !== 'string' || !isStringArray(d['candidates'])) return 'manifest-not-found details';
      return status === 404 ? null : 'manifest-not-found status';
    case 'branch-not-found':
      if (!hasDetails || !onlyKeys(['branch']) || typeof d['branch'] !== 'string') return 'branch-not-found details';
      return status === 404 ? null : 'branch-not-found status';
    case 'repo-not-found':
      if (hasDetails) return 'repo-not-found must have no details';
      return status === 404 ? null : 'repo-not-found status';
    case 'upstream-unavailable': {
      if (!hasDetails || !onlyKeys(['source', 'resetAt'])) return 'upstream-unavailable details';
      if (typeof d['source'] !== 'string' || !SOURCES.includes(d['source'])) return 'upstream-unavailable source';
      if (d['resetAt'] !== undefined && typeof d['resetAt'] !== 'string') return 'resetAt is not a string';
      return status === 502 || status === 503 ? null : 'upstream-unavailable status';
    }
    case 'deadline-exceeded':
      if (hasDetails) return 'deadline-exceeded must have no details';
      return status === 504 ? null : 'deadline-exceeded status';
    default:
      if (hasDetails) return 'internal-error must have no details';
      return status === 500 ? null : 'internal-error status';
  }
}

async function answer(s: Scenario): Promise<ApiResponse> {
  const runtime = createFakeRuntime(START_MS);
  const request: RawScanRequest = {
    method: s.method,
    contentType: s.contentType,
    contentLength: s.contentLength,
    body: s.hasBody ? streamOfChunks(s.bytes, s.chunkSize) : null,
  };
  const deps: ApiDeps = {
    sources: buildSources(s.upstream),
    clock: runtime.clock,
    timer: runtime.timer,
    random: runtime.random,
    logger: { log: () => undefined },
    scanCache: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
    readEnv: () => (s.badConfig ? { GITHUB_API_URL: 'ftp://nope' } : {}),
  };
  return runUntilSettled(handleScanRequest(request, deps), runtime);
}

describe('handleScanRequest properties', () => {
  // Feature: scan-pipeline, Property 64: The route always answers with the declared union
  // **Validates: Requirements 21.12**
  it('P64: answers every request with the declared union, status table and headers, and never throws', async () => {
    await fc.assert(
      fc.asyncProperty(arbScenario, async (scenario) => {
        const response = await answer(scenario);
        const problem = violation(response);
        if (problem !== null) {
          throw new Error(`${problem}: ${JSON.stringify({ status: response.status, headers: response.headers, body: response.body }).slice(0, 600)}`);
        }
      }),
      cfg(),
    );
  });
});

// Feature: scan-pipeline, Property 65: Branch from the body and the URL
// Requirement 21.15
const BRANCH_ATOMS = ['a', 'b', 'Z', '0', '-', '_', '.', '/', '%', '%41', '#', '?', '@', '{', 'é', '日', '😀', 'ß'];
const arbBranchName: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...BRANCH_ATOMS), { minLength: 1, maxLength: 10 })
  .map((parts) => parts.join(''))
  .filter(isValidBranchName);

const encodeBranch = (branch: string, style: 'component' | 'keep-slash'): string =>
  style === 'component'
    ? encodeURIComponent(branch)
    : branch.split('/').map(encodeURIComponent).join('/');

interface BranchScenario {
  readonly bodyBranch: string | undefined;
  readonly urlBranch: string | undefined;
  readonly style: 'component' | 'keep-slash';
  readonly trailingSlash: boolean;
}

const arbBranchScenario: fc.Arbitrary<BranchScenario> = fc
  .record({
    first: arbBranchName,
    second: arbBranchName,
    shape: fc.constantFrom('body-only', 'url-only', 'neither', 'equal', 'different'),
    style: fc.constantFrom<'component' | 'keep-slash'>('component', 'keep-slash'),
    trailingSlash: fc.boolean(),
  })
  .map(({ first, second, shape, style, trailingSlash }) => {
    const other = second === first ? `${second}x` : second;
    switch (shape) {
      case 'body-only':
        return { bodyBranch: first, urlBranch: undefined, style, trailingSlash };
      case 'url-only':
        return { bodyBranch: undefined, urlBranch: first, style, trailingSlash };
      case 'neither':
        return { bodyBranch: undefined, urlBranch: undefined, style, trailingSlash };
      case 'equal':
        return { bodyBranch: first, urlBranch: first, style, trailingSlash };
      default:
        return { bodyBranch: first, urlBranch: other, style, trailingSlash };
    }
  });

async function answerBranch(s: BranchScenario): Promise<{ response: ApiResponse; upstreamCalls: number; branches: string[] }> {
  const runtime = createFakeRuntime(START_MS);
  let upstreamCalls = 0;
  const branches: string[] = [];
  const base = buildSources('ok');
  const sources = Object.fromEntries(
    Object.entries(base as unknown as Record<string, Record<string, (...args: unknown[]) => unknown>>).map(
      ([name, source]) => [
        name,
        Object.fromEntries(
          Object.entries(source).map(([method, fn]) => [
            method,
            (...args: unknown[]) => {
              if (method !== 'hasToken') upstreamCalls += 1;
              if (name === 'github' && method === 'getBranch') branches.push(args[1] as string);
              return fn(...args);
            },
          ]),
        ),
      ],
    ),
  ) as unknown as ScanDeps['sources'];
  const treePart =
    s.urlBranch === undefined ? '' : `/tree/${encodeBranch(s.urlBranch, s.style)}${s.trailingSlash ? '/' : ''}`;
  const repoUrl = `https://github.com/o/r${treePart}`;
  const payload = s.bodyBranch === undefined ? { repoUrl } : { repoUrl, branch: s.bodyBranch };
  const request: RawScanRequest = {
    method: 'POST',
    contentType: 'application/json',
    contentLength: null,
    body: streamOfChunks(enc(JSON.stringify(payload)), 1024),
  };
  const deps: ApiDeps = {
    sources,
    clock: runtime.clock,
    timer: runtime.timer,
    random: runtime.random,
    logger: { log: () => undefined },
    scanCache: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
    readEnv: () => ({}),
  };
  const response = await runUntilSettled(handleScanRequest(request, deps), runtime);
  return { response, upstreamCalls, branches };
}

describe('handleScanRequest branch resolution', () => {
  // Feature: scan-pipeline, Property 65: Branch from the body and the URL
  // **Validates: Requirements 21.15**
  it('P65: uses the body branch, else the URL branch, and rejects unequal pairs without an upstream request', async () => {
    await fc.assert(
      fc.asyncProperty(arbBranchScenario, async (s) => {
        const { response, upstreamCalls, branches } = await answerBranch(s);
        const conflict = s.bodyBranch !== undefined && s.urlBranch !== undefined && s.bodyBranch !== s.urlBranch;
        const detail = JSON.stringify({ s, status: response.status, body: response.body, branches }).slice(0, 600);
        if (conflict) {
          const body = response.body as { ok?: boolean; error?: { code?: string; details?: { reason?: string; field?: string } } };
          if (
            response.status !== 400 ||
            body.ok !== false ||
            body.error?.code !== 'invalid-request' ||
            body.error.details?.reason !== 'branch-conflict' ||
            body.error.details.field !== 'branch'
          ) {
            throw new Error(`expected branch-conflict: ${detail}`);
          }
          if (upstreamCalls !== 0) throw new Error(`upstream request after a conflict: ${detail}`);
          return;
        }
        const expected = s.bodyBranch ?? s.urlBranch ?? 'main';
        if (response.status !== 200) throw new Error(`expected a result: ${detail}`);
        if (branches.length === 0 || branches.some((b) => b !== expected)) {
          throw new Error(`requested branch differs from ${JSON.stringify(expected)}: ${detail}`);
        }
      }),
      cfg(),
    );
  });
});
