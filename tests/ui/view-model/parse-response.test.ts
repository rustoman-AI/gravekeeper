import { describe, expect, it } from 'vitest';
import { parseScanResponse } from '../../../view-model/parse-response';
import { CACHE_STATUS_HEADER } from '../../../pipeline/constants';

const CODES = [
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

function headers(values: Record<string, string> = {}) {
  const lower = new Map(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name: string): string | null => lower.get(name.toLowerCase()) ?? null };
}

function advisory(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 'GHSA-1', aliases: ['CVE-1'], severity: 'HIGH', url: 'https://x.test/1', ...extra };
}

function entry(advisories: unknown[] = [], facts: unknown = {}): Record<string, unknown> {
  return { dependency: { name: 'a' }, facts, versionBasis: 'pinned', advisories };
}

function validResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ok: true,
    asOf: '2026-01-01T00:00:00Z',
    repo: { host: 'github.com', owner: 'o', repo: 'r', branch: 'main', defaultBranch: 'main' },
    discovery: {},
    manifests: [],
    dependencies: [entry()],
    assessed: [{}],
    summary: {},
    sources: { github: 'ok', depsdev: 'ok', osv: 'partial', npm: 'failed', cratesio: 'ok', pypi: 'ok' },
    capped: {},
    notes: [],
    ...overrides,
  };
}

function errorBody(code = 'invalid-url'): Record<string, unknown> {
  return { ok: false, error: { code, message: 'nope' } };
}

const malformed = { kind: 'failure', failure: { kind: 'malformed-response' } };

describe('parseScanResponse', () => {
  it('accepts a valid result', () => {
    const out = parseScanResponse(200, headers(), validResult());
    expect(out.kind).toBe('result');
  });

  it.each([
    ['empty', {}],
    ['invalid host', { host: 'a.xn--', owner: '', repo: '', branch: '/', defaultBranch: 'main' }],
    ['empty owner', { host: 'github.com', owner: '', repo: 'r', branch: 'main', defaultBranch: 'main' }],
    ['hostile repo name', { host: 'github.com', owner: 'o', repo: 'r/../x', branch: 'main', defaultBranch: 'main' }],
    ['empty branch', { host: 'github.com', owner: 'o', repo: 'r', branch: '', defaultBranch: 'main' }],
    ['host with path', { host: 'evil.test/x', owner: 'o', repo: 'r', branch: 'main', defaultBranch: 'main' }],
  ])('rejects a repo that fails validation (%s)', (_label, repo) => {
    expect(parseScanResponse(200, headers(), validResult({ repo }))).toEqual(malformed);
  });
  it('rejects mismatched dependencies and assessed lengths', () => {
    expect(parseScanResponse(200, headers(), validResult({ assessed: [] }))).toEqual(malformed);
  });

  it('rejects a dependency without advisories', () => {
    const dep = entry();
    delete dep['advisories'];
    expect(parseScanResponse(200, headers(), validResult({ dependencies: [dep] }))).toEqual(malformed);
  });

  it('rejects five source keys', () => {
    const sources = { github: 'ok', depsdev: 'ok', osv: 'ok', npm: 'ok', cratesio: 'ok' };
    expect(parseScanResponse(200, headers(), validResult({ sources }))).toEqual(malformed);
  });

  it('rejects a 200 with an error body and a 404 with a result body', () => {
    expect(parseScanResponse(200, headers(), errorBody())).toEqual(malformed);
    expect(parseScanResponse(404, headers(), validResult())).toEqual(malformed);
  });

  it.each(CODES)('accepts error code %s', (code) => {
    const out = parseScanResponse(400, headers(), errorBody(code));
    expect(out.kind).toBe('error');
  });

  it('rejects a tenth error code', () => {
    expect(parseScanResponse(400, headers(), errorBody('teapot'))).toEqual(malformed);
  });

  it.each([
    ['0', null],
    ['1', 1],
    ['86400', 86400],
    ['86401', null],
    ['1.5', null],
    ['abc', null],
  ])('Retry-After %s gives %s', (value, expected) => {
    const out = parseScanResponse(429, headers({ 'Retry-After': value }), errorBody());
    expect(out).toMatchObject({ kind: 'error', retryAfterSeconds: expected });
  });

  it('gives null for an absent Retry-After', () => {
    expect(parseScanResponse(429, headers(), errorBody())).toMatchObject({ retryAfterSeconds: null });
  });

  it.each([
    ['hit', 'hit'],
    ['miss', 'miss'],
    ['HIT', 'unknown'],
    [' hit', 'unknown'],
  ])('cache header %j gives %s', (value, expected) => {
    const out = parseScanResponse(200, headers({ [CACHE_STATUS_HEADER]: value }), validResult());
    expect(out).toMatchObject({ kind: 'result', cache: expected });
  });

  it('gives unknown for an absent cache header', () => {
    expect(parseScanResponse(200, headers(), validResult())).toMatchObject({ cache: 'unknown' });
  });

  it('turns facts of the wrong type into null', () => {
    const facts = {
      daysSinceLastRelease: '5',
      daysSinceLastCommit: -1,
      archived: 'yes',
      deprecated: 1,
      openVulnerabilityCount: 1.5,
      maxSeverity: 'SEVERE',
      maintainerCount: null,
    };
    const out = parseScanResponse(200, headers(), validResult({ dependencies: [entry([], facts)] }));
    if (out.kind !== 'result') throw new Error('expected result');
    expect(out.result.dependencies[0]?.facts).toEqual({
      daysSinceLastRelease: null,
      daysSinceLastCommit: null,
      archived: null,
      deprecated: null,
      openVulnerabilityCount: null,
      maxSeverity: null,
      maintainerCount: null,
    });
  });

  it('keeps valid facts unchanged', () => {
    const facts = { daysSinceLastRelease: 0, archived: false, maxSeverity: 'LOW', maintainerCount: 3 };
    const out = parseScanResponse(200, headers(), validResult({ dependencies: [entry([], facts)] }));
    if (out.kind !== 'result') throw new Error('expected result');
    expect(out.result.dependencies[0]?.facts).toMatchObject(facts);
  });

  it('drops an advisory without id', () => {
    const advisories = [advisory({ id: undefined }), advisory({ id: '' }), advisory()];
    const out = parseScanResponse(200, headers(), validResult({ dependencies: [entry(advisories)] }));
    if (out.kind !== 'result') throw new Error('expected result');
    expect(out.result.dependencies[0]?.advisories.map((a) => a.id)).toEqual(['GHSA-1']);
  });

  it.each([
    [null, 'counted'],
    ['informational', 'informational'],
    ['withdrawn', 'withdrawn'],
    ['other', 'unknown'],
    [7, 'unknown'],
  ])('narrows excluded %j to %s', (value, expected) => {
    const advisories = [advisory({ excluded: value })];
    const out = parseScanResponse(200, headers(), validResult({ dependencies: [entry(advisories)] }));
    if (out.kind !== 'result') throw new Error('expected result');
    expect(out.result.dependencies[0]?.advisories[0]?.exclusion).toBe(expected);
  });

  it('narrows an absent excluded to unknown without failing', () => {
    const out = parseScanResponse(200, headers(), validResult({ dependencies: [entry([advisory()])] }));
    if (out.kind !== 'result') throw new Error('expected result');
    expect(out.result.dependencies[0]?.advisories[0]?.exclusion).toBe('unknown');
  });

  it('ignores the cache header on an error response', () => {
    const out = parseScanResponse(400, headers({ [CACHE_STATUS_HEADER]: 'hit' }), errorBody());
    expect(out).not.toHaveProperty('cache');
  });
});
