import { describe, expect, it } from 'vitest';
import { respond, scanErrorStatus } from '../../../pipeline/api/scan-error';
import type { IsoInstant } from '../../../pipeline/mapping';
import { renderErrorMessage } from '../../../pipeline/scan/messages';
import type { ScanErrorBody } from '../../../pipeline/scan/types';

const HOST = 'github.com';
const asOf = '2025-01-01T00:00:00.000Z' as IsoInstant;
const at = (iso: string): IsoInstant => iso as IsoInstant;

type Reason = Extract<ScanErrorBody, { code: 'invalid-request' }>['details']['reason'];

function invalidRequest(reason: Reason): ScanErrorBody {
  const details = { reason };
  return { code: 'invalid-request', message: renderErrorMessage('invalid-request', details, HOST), details };
}
function upstream(resetAt?: string): ScanErrorBody {
  const details = resetAt === undefined ? { source: 'github' as const } : { source: 'github' as const, resetAt: at(resetAt) };
  return { code: 'upstream-unavailable', message: renderErrorMessage('upstream-unavailable', details, HOST), details };
}
function fail(error: ScanErrorBody) {
  return respond({ ok: false, error }, asOf);
}

const invalidUrl: ScanErrorBody = {
  code: 'invalid-url',
  message: renderErrorMessage('invalid-url', { part: 'host' }, HOST),
  details: { part: 'host' },
};
const tooMany: ScanErrorBody = {
  code: 'too-many-manifests',
  message: renderErrorMessage('too-many-manifests', { limit: 5, candidates: ['a/package.json'] }, HOST),
  details: { limit: 5, candidates: ['a/package.json'] },
};
const manifestNotFound: ScanErrorBody = {
  code: 'manifest-not-found',
  message: renderErrorMessage('manifest-not-found', { path: 'a/package.json', candidates: ['b/package.json'] }, HOST),
  details: { path: 'a/package.json', candidates: ['b/package.json'] },
};
const repoNotFound: ScanErrorBody = {
  code: 'repo-not-found',
  message: renderErrorMessage('repo-not-found', undefined, HOST),
};
const branchNotFound: ScanErrorBody = {
  code: 'branch-not-found',
  message: renderErrorMessage('branch-not-found', { branch: 'dev' }, HOST),
  details: { branch: 'dev' },
};
const deadline: ScanErrorBody = {
  code: 'deadline-exceeded',
  message: renderErrorMessage('deadline-exceeded', undefined, HOST),
};
const internal: ScanErrorBody = {
  code: 'internal-error',
  message: renderErrorMessage('internal-error', undefined, HOST),
};

describe('scanErrorStatus (R21.6)', () => {
  const rows: ReadonlyArray<readonly [string, ScanErrorBody, number]> = [
    ['invalid-request invalid-json', invalidRequest('invalid-json'), 400],
    ['invalid-request invalid-type', invalidRequest('invalid-type'), 400],
    ['invalid-request unknown-field', invalidRequest('unknown-field'), 400],
    ['invalid-request missing-field', invalidRequest('missing-field'), 400],
    ['invalid-request too-many-items', invalidRequest('too-many-items'), 400],
    ['invalid-request branch-conflict', invalidRequest('branch-conflict'), 400],
    ['invalid-request body-too-large', invalidRequest('body-too-large'), 413],
    ['invalid-request unsupported-media-type', invalidRequest('unsupported-media-type'), 415],
    ['invalid-request method-not-allowed', invalidRequest('method-not-allowed'), 405],
    ['invalid-url', invalidUrl, 400],
    ['too-many-manifests', tooMany, 400],
    ['manifest-not-found', manifestNotFound, 404],
    ['repo-not-found', repoNotFound, 404],
    ['branch-not-found', branchNotFound, 404],
    ['upstream-unavailable with later resetAt', upstream('2025-01-01T00:01:00.000Z'), 503],
    ['upstream-unavailable without resetAt', upstream(), 502],
    ['deadline-exceeded', deadline, 504],
    ['internal-error', internal, 500],
  ];
  it.each(rows)('%s', (_name, error, status) => {
    expect(scanErrorStatus(error, asOf)).toBe(status);
    expect(fail(error).status).toBe(status);
  });

  it('upstream-unavailable with resetAt equal to or before asOf is 502', () => {
    expect(scanErrorStatus(upstream(asOf), asOf)).toBe(502);
    expect(scanErrorStatus(upstream('2024-12-31T23:59:59.000Z'), asOf)).toBe(502);
  });
});

describe('Retry-After (R21.6, R21.13)', () => {
  it('is the whole seconds until resetAt', () => {
    expect(fail(upstream('2025-01-01T00:01:00.000Z')).headers['Retry-After']).toBe('60');
  });
  it('rounds up fractional seconds', () => {
    expect(fail(upstream('2025-01-01T00:00:01.001Z')).headers['Retry-After']).toBe('2');
    expect(fail(upstream('2025-01-01T00:00:59.999Z')).headers['Retry-After']).toBe('60');
  });
  it('is at least 1', () => {
    expect(fail(upstream('2025-01-01T00:00:00.001Z')).headers['Retry-After']).toBe('1');
  });
  it('is absent when resetAt is not later than asOf', () => {
    expect(fail(upstream(asOf)).headers).not.toHaveProperty('Retry-After');
    expect(fail(upstream('2024-12-31T00:00:00.000Z')).headers).not.toHaveProperty('Retry-After');
  });
  it('is absent when resetAt is missing and for other statuses', () => {
    expect(fail(upstream()).headers).not.toHaveProperty('Retry-After');
    expect(fail(deadline).headers).not.toHaveProperty('Retry-After');
  });
});

describe('Allow header (R21.6)', () => {
  it('is POST on 405 only', () => {
    expect(fail(invalidRequest('method-not-allowed')).headers['Allow']).toBe('POST');
    expect(fail(invalidRequest('invalid-json')).headers).not.toHaveProperty('Allow');
    expect(fail(internal).headers).not.toHaveProperty('Allow');
  });
});

describe('response shape (R21.5, R21.7, R21.9)', () => {
  const errors = [
    invalidRequest('method-not-allowed'),
    invalidUrl,
    tooMany,
    manifestNotFound,
    repoNotFound,
    branchNotFound,
    upstream('2025-01-01T00:01:00.000Z'),
    upstream(),
    deadline,
    internal,
  ];

  it('sets Content-Type and Cache-Control on every error response', () => {
    for (const error of errors) {
      const { headers } = fail(error);
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Cache-Control']).toBe('no-store');
    }
  });

  it('returns the error body unchanged, with details omitted rather than null', () => {
    for (const error of errors) {
      const response = fail(error);
      expect(response.body).toEqual({ ok: false, error });
      const out = (response.body as { error: Record<string, unknown> }).error;
      expect('details' in out).toBe('details' in error);
      expect(out['details']).not.toBeNull();
    }
    expect(fail(repoNotFound).body).toEqual({ ok: false, error: { code: 'repo-not-found', message: repoNotFound.message } });
    expect(JSON.stringify(fail(deadline).body)).not.toContain('details');
  });

  it('uses the rendered message of the table', () => {
    expect(fail(repoNotFound).body).toMatchObject({
      error: { message: 'This repository does not exist or is not public.' },
    });
  });

  it('answers 200 with the same headers and no Allow or Retry-After for a success body', () => {
    const body = { ok: true } as unknown as Parameters<typeof respond>[0];
    const response = respond(body, asOf);
    expect(response.status).toBe(200);
    expect(response.headers).toEqual({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Gravekeeper-Cache': 'miss' });
    expect(response.cache).toBe('miss');
    expect(response.body).toBe(body);
  });
});
