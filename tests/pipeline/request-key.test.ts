import { describe, expect, it } from 'vitest';
import type { HttpRequest } from '../../pipeline/ports/http';
import { canonicalJson, requestKey } from '../../pipeline/ports/request-key';

const base: HttpRequest = {
  source: 'github',
  method: 'GET',
  url: 'https://api.github.com/repos/a/b',
  headers: {},
  body: null,
  auth: 'none',
  notFound: 'absent',
  cache: null,
  gate: null,
};

describe('canonicalJson', () => {
  // Requirement 19.3
  it('is independent of object key order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('sorts keys by code point, astral after high BMP and "10" before "2"', () => {
    expect(canonicalJson({ '\u{1F600}': 1, '\uFFFF': 2 })).toBe('{"\uFFFF":2,"\u{1F600}":1}');
    expect(canonicalJson({ '2': 1, '10': 2 })).toBe('{"10":2,"2":1}');
  });

  it('keeps array order', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
  });

  it('distinguishes values that a naive join would conflate', () => {
    const values: unknown[] = [
      ['a,b'],
      ['a', 'b'],
      { a: null },
      {},
      [],
      '1',
      1,
      null,
      'null',
      [[]],
      [{}],
      { a: { b: 1 } },
      { 'a":{"b': 1 },
    ];
    const keys = values.map(canonicalJson);
    expect(new Set(keys).size).toBe(values.length);
  });

  it('handles nulls, omitted members and non-finite numbers', () => {
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}');
    expect(canonicalJson([undefined])).toBe('[null]');
    expect(canonicalJson(Number.NaN)).toBe('null');
  });

  // Requirement 19.3
  it('keeps an own __proto__ key as data and does not touch the prototype', () => {
    const parsed: unknown = JSON.parse('{"__proto__":{"x":1},"a":2}');
    expect(canonicalJson(parsed)).toBe('{"__proto__":{"x":1},"a":2}');
    expect(canonicalJson(JSON.parse('{"__proto__":1}'))).not.toBe(canonicalJson({}));
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});

describe('requestKey', () => {
  // Requirement 19.4, 23.3
  it('ignores headers and auth: requests differing only in headers share a key', () => {
    const withToken: HttpRequest = { ...base, headers: { Authorization: 'Bearer secret-token' } };
    const withAccept: HttpRequest = { ...base, headers: { Accept: 'x' } };
    const a = requestKey(withToken);
    const b = requestKey(withAccept);
    expect(a).toBe(b);
    expect(a).not.toContain('secret-token');
    expect(a).not.toContain('Authorization');
  });

  it('is canonicalJson of ["req", source, method, url, body]', () => {
    expect(requestKey(base)).toBe(canonicalJson(['req', 'github', 'GET', base.url, null]));
    expect(requestKey(base)).toBe('["req","github","GET","https://api.github.com/repos/a/b",null]');
  });

  it('differs when source, method, url or body differ', () => {
    const k = requestKey(base);
    expect(requestKey({ ...base, source: 'osv' })).not.toBe(k);
    expect(requestKey({ ...base, method: 'POST' })).not.toBe(k);
    expect(requestKey({ ...base, url: `${base.url}/x` })).not.toBe(k);
    expect(requestKey({ ...base, body: '{}' })).not.toBe(k);
    expect(requestKey({ ...base, body: '' })).not.toBe(k);
  });

  it('does not conflate url and body boundaries', () => {
    const a = requestKey({ ...base, url: 'https://h/a', body: 'b' });
    const b = requestKey({ ...base, url: 'https://h/ab', body: null });
    expect(a).not.toBe(b);
  });
});
