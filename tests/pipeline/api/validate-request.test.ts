import { describe, expect, it } from 'vitest';
import {
  checkMediaType,
  findBranchConflict,
  validateRequestBody,
} from '../../../pipeline/api/validate-request';
import type { InvalidRequestError } from '../../../pipeline/api/validate-request';
import { DISCOVERY_MAX_MANIFESTS } from '../../../pipeline/constants';
import { renderErrorMessage } from '../../../pipeline/scan/messages';

function failure(text: string): InvalidRequestError {
  const r = validateRequestBody(text);
  if (r.ok) throw new Error('expected failure');
  return r.error;
}

function expectDetails(e: InvalidRequestError, details: InvalidRequestError['details']): void {
  expect(e.code).toBe('invalid-request');
  expect(e.details).toEqual(details);
  expect(e.message).toBe(renderErrorMessage('invalid-request', details, ''));
}

describe('checkMediaType', () => {
  it.each([
    'application/json',
    'application/json; charset=utf-8',
    'Application/JSON ;charset=UTF-8',
    '  application/json  ',
  ])('accepts %j', (ct) => {
    expect(checkMediaType(ct).ok).toBe(true);
  });

  it.each([null, undefined, '', 'text/plain', 'application/jsonp', 'application/json-patch+json', 'text/json'])(
    'rejects %j with unsupported-media-type',
    (ct) => {
      const r = checkMediaType(ct);
      expect(r.ok).toBe(false);
      if (!r.ok) expectDetails(r.error, { reason: 'unsupported-media-type' });
    },
  );
});

describe('validateRequestBody', () => {
  it('accepts a minimal body', () => {
    const r = validateRequestBody('{"repoUrl":"https://github.com/a/b"}');
    expect(r).toEqual({
      ok: true,
      value: { repoUrl: 'https://github.com/a/b', branch: undefined, manifests: undefined },
    });
  });

  it('accepts all fields and exactly the manifest limit', () => {
    const manifests = Array.from({ length: DISCOVERY_MAX_MANIFESTS }, (_, i) => `m${i}`);
    const r = validateRequestBody(JSON.stringify({ repoUrl: 'u', branch: 'main', manifests }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.branch).toBe('main');
      expect(r.value.manifests).toEqual(manifests);
    }
  });

  it('accepts an empty manifests list and an empty branch string', () => {
    const r = validateRequestBody('{"repoUrl":"u","branch":"","manifests":[]}');
    expect(r.ok).toBe(true);
  });

  it.each(['{not json', '', 'undefined'])('invalid-json for %j', (text) => {
    expectDetails(failure(text), { reason: 'invalid-json' });
  });

  it.each(['[]', '"s"', '5', 'null', 'true'])('body not an object: %s', (text) => {
    expectDetails(failure(text), { reason: 'invalid-type', field: 'body' });
  });

  it('unknown field, name not echoed', () => {
    const e = failure('{"repoUrl":"u","SecretName":1}');
    expectDetails(e, { reason: 'unknown-field', field: 'body' });
    expect(e.message).not.toContain('SecretName');
    expect(JSON.stringify(e)).not.toContain('SecretName');
  });

  it('__proto__ key is an unknown field and does not pollute', () => {
    const e = failure('{"repoUrl":"u","__proto__":{"polluted":true}}');
    expectDetails(e, { reason: 'unknown-field', field: 'body' });
    expect(e.message).not.toContain('__proto__');
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('missing repoUrl', () => {
    expectDetails(failure('{}'), { reason: 'missing-field', field: 'repoUrl' });
    expectDetails(failure('{"branch":"x"}'), { reason: 'missing-field', field: 'repoUrl' });
  });

  it('wrong types per field', () => {
    expectDetails(failure('{"repoUrl":1}'), { reason: 'invalid-type', field: 'repoUrl' });
    expectDetails(failure('{"repoUrl":null}'), { reason: 'invalid-type', field: 'repoUrl' });
    expectDetails(failure('{"repoUrl":"u","branch":1}'), { reason: 'invalid-type', field: 'branch' });
    expectDetails(failure('{"repoUrl":"u","branch":null}'), { reason: 'invalid-type', field: 'branch' });
    expectDetails(failure('{"repoUrl":"u","manifests":"a"}'), { reason: 'invalid-type', field: 'manifests' });
    expectDetails(failure('{"repoUrl":"u","manifests":["a",2]}'), {
      reason: 'invalid-type',
      field: 'manifests',
    });
  });

  it('manifests over the limit (duplicates count)', () => {
    const manifests = Array.from({ length: DISCOVERY_MAX_MANIFESTS + 1 }, () => 'same');
    expectDetails(failure(JSON.stringify({ repoUrl: 'u', manifests })), {
      reason: 'too-many-items',
      field: 'manifests',
    });
  });

  describe('check order', () => {
    it('non-object body before unknown field / missing field', () => {
      expect(failure('[]').details).toEqual({ reason: 'invalid-type', field: 'body' });
    });

    it('unknown field before missing repoUrl', () => {
      expect(failure('{"x":1}').details).toEqual({ reason: 'unknown-field', field: 'body' });
    });

    it('unknown field before type errors', () => {
      expect(failure('{"repoUrl":1,"x":1}').details).toEqual({ reason: 'unknown-field', field: 'body' });
    });

    it('missing repoUrl before wrong types of other fields', () => {
      expect(failure('{"branch":1,"manifests":1}').details).toEqual({
        reason: 'missing-field',
        field: 'repoUrl',
      });
    });

    it('type errors in order repoUrl, branch, manifests', () => {
      expect(failure('{"repoUrl":1,"branch":1,"manifests":1}').details).toEqual({
        reason: 'invalid-type',
        field: 'repoUrl',
      });
      expect(failure('{"repoUrl":"u","branch":1,"manifests":1}').details).toEqual({
        reason: 'invalid-type',
        field: 'branch',
      });
    });

    it('type error before too-many-items', () => {
      const manifests = [...Array.from({ length: DISCOVERY_MAX_MANIFESTS }, () => 'a'), 1];
      expect(failure(JSON.stringify({ repoUrl: 'u', manifests })).details).toEqual({
        reason: 'invalid-type',
        field: 'manifests',
      });
    });
  });
});

describe('findBranchConflict', () => {
  const text = 'The request is not valid: the URL and the branch field name different branches.';

  it('reports a conflict with the exact message and details', () => {
    const e = findBranchConflict('main', 'dev');
    expect(e).not.toBeNull();
    if (e === null) return;
    expectDetails(e, { reason: 'branch-conflict', field: 'branch' });
    expect(e.message).toBe(text);
    expect(e.message).not.toContain('main');
    expect(e.message).not.toContain('dev');
  });

  it('is case-sensitive', () => {
    expect(findBranchConflict('Main', 'main')).not.toBeNull();
  });

  it('returns null when equal or either side is absent', () => {
    expect(findBranchConflict('main', 'main')).toBeNull();
    expect(findBranchConflict(undefined, 'main')).toBeNull();
    expect(findBranchConflict('main', null)).toBeNull();
    expect(findBranchConflict(undefined, null)).toBeNull();
  });
});
