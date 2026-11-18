import { describe, expect, it } from 'vitest';
import type { SourceHeaders } from '../../../pipeline/ports/http';
import { readGraphqlRateLimit, readRestRateLimit } from '../../../pipeline/mapping/rate-limit';

const NONE = { remaining: null, resetAt: null };

function gql(rateLimit: unknown): unknown {
  return { data: { rateLimit } };
}

describe('readGraphqlRateLimit', () => {
  // Validates: Requirements 14.2, 14.4, 3.7
  it('reads an integer remaining and an ISO resetAt', () => {
    expect(readGraphqlRateLimit(gql({ remaining: 4999, resetAt: '2024-01-01T00:00:00Z' }))).toEqual({
      remaining: 4999,
      resetAt: '2024-01-01T00:00:00Z',
    });
  });

  it('accepts zero remaining', () => {
    expect(readGraphqlRateLimit(gql({ remaining: 0 })).remaining).toBe(0);
  });

  it.each([-1, 1.5, NaN, Infinity, -0, '5', null, true, {}])('rejects remaining %j', (value) => {
    expect(readGraphqlRateLimit(gql({ remaining: value })).remaining).toBeNull();
  });

  it.each(['not a date', '', '2024-13-45T00:00:00Z', 1700000000, null])(
    'rejects resetAt %j',
    (value) => {
      expect(readGraphqlRateLimit(gql({ resetAt: value })).resetAt).toBeNull();
    },
  );

  it.each([undefined, null, 5, 'x', [], {}, { data: null }, { data: {} }, { data: { rateLimit: 3 } }])(
    'returns nulls for body %j',
    (body) => {
      expect(readGraphqlRateLimit(body)).toEqual(NONE);
    },
  );

  it('ignores inherited properties and throwing getters', () => {
    const inherited = Object.create({ data: { rateLimit: { remaining: 1 } } });
    expect(readGraphqlRateLimit(inherited)).toEqual(NONE);
    const throwing = {
      get data(): unknown {
        throw new Error('boom');
      },
    };
    expect(readGraphqlRateLimit(throwing)).toEqual(NONE);
  });
});

describe('readRestRateLimit', () => {
  // Validates: Requirements 14.2, 14.4, 3.7
  it('reads integer remaining and converts epoch seconds to an ISO instant', () => {
    const headers: SourceHeaders = {
      'x-ratelimit-remaining': '42',
      'x-ratelimit-reset': '1700000000',
    };
    expect(readRestRateLimit(headers)).toEqual({
      remaining: 42,
      resetAt: '2023-11-14T22:13:20Z',
    });
  });

  it('converts epoch zero and accepts remaining zero', () => {
    expect(
      readRestRateLimit({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '0' }),
    ).toEqual({ remaining: 0, resetAt: '1970-01-01T00:00:00Z' });
  });

  it('returns nulls for empty headers', () => {
    expect(readRestRateLimit({})).toEqual(NONE);
  });

  it.each(['', '-1', '1.5', '1e3', ' 5', '5 ', '+5', '0x10', 'abc', '99999999999999999999'])(
    'rejects header value %j',
    (value) => {
      expect(
        readRestRateLimit({ 'x-ratelimit-remaining': value, 'x-ratelimit-reset': value }),
      ).toEqual(NONE);
    },
  );

  it('rejects an epoch beyond year 9999 and accepts the last valid second', () => {
    expect(readRestRateLimit({ 'x-ratelimit-reset': '253402300800' }).resetAt).toBeNull();
    expect(readRestRateLimit({ 'x-ratelimit-reset': '253402300799' }).resetAt).toBe(
      '9999-12-31T23:59:59Z',
    );
  });

  it('reads each header independently', () => {
    expect(readRestRateLimit({ 'x-ratelimit-remaining': '7' })).toEqual({
      remaining: 7,
      resetAt: null,
    });
    expect(readRestRateLimit({ 'x-ratelimit-reset': '60' })).toEqual({
      remaining: null,
      resetAt: '1970-01-01T00:01:00Z',
    });
  });

  it('does not read inherited headers', () => {
    const headers = Object.create({ 'x-ratelimit-remaining': '3' }) as SourceHeaders;
    expect(readRestRateLimit(headers)).toEqual(NONE);
  });
});
