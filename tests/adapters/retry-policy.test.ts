import { describe, expect, it } from 'vitest';
import {
  backoffDelayMs,
  decideAfterAttempt,
  parseRetryAfter,
  resolveRedirect,
  type AttemptResult,
  type DecideInput,
} from '../../adapters/http/retry-policy';
import {
  REDIRECT_MAX_HOPS,
  REQUEST_TOTAL_TIMEOUT_MS,
  RETRY_AFTER_MAX_MS,
  RETRY_MAX_ATTEMPTS,
  SCAN_DEADLINE_MS,
} from '../../pipeline/constants';

const resp = (status: number, headers: Record<string, string> = {}): AttemptResult => ({
  type: 'response',
  status,
  headers,
});

function decide(result: AttemptResult, over: Partial<DecideInput> = {}) {
  return decideAfterAttempt({
    source: 'depsdev',
    attempts: 1,
    result,
    notFound: 'absent',
    now: 1000,
    firstSentAt: 1000,
    deadlineAtMs: SCAN_DEADLINE_MS,
    random: 0,
    gateAllows: true,
    ...over,
  });
}

describe('backoffDelayMs (15.6)', () => {
  it('doubles from the base and caps at the max, jitter on top', () => {
    expect(backoffDelayMs(1, 0)).toBe(250);
    expect(backoffDelayMs(2, 0)).toBe(500);
    expect(backoffDelayMs(3, 0)).toBe(1000);
    expect(backoffDelayMs(10, 0)).toBe(4000);
    expect(backoffDelayMs(1, 0.5)).toBe(275);
    expect(backoffDelayMs(10, 0.999)).toBe(Math.floor(4000 + 0.999 * 0.2 * 4000));
  });
});

describe('parseRetryAfter (15.7)', () => {
  it('accepts non-negative integers including 0', () => {
    expect(parseRetryAfter('0')).toBe(0);
    expect(parseRetryAfter('5')).toBe(5);
  });
  it('ignores dates, negatives, decimals, empty and absent', () => {
    expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT')).toBeNull();
    expect(parseRetryAfter('-1')).toBeNull();
    expect(parseRetryAfter('1.5')).toBeNull();
    expect(parseRetryAfter('')).toBeNull();
    expect(parseRetryAfter(undefined)).toBeNull();
  });
});

describe('decideAfterAttempt decision table', () => {
  it('2xx is ok after one attempt (15.5)', () => {
    expect(decide(resp(200))).toEqual({ kind: 'ok' });
    expect(decide(resp(204))).toEqual({ kind: 'ok' });
  });

  it('404 is absent or failed depending on notFound (15.5)', () => {
    expect(decide(resp(404), { notFound: 'absent' })).toEqual({ kind: 'absent' });
    expect(decide(resp(404), { notFound: 'failed' })).toEqual({ kind: 'failed', reason: 'http-error' });
  });

  it('other 4xx fails without retry (15.5)', () => {
    for (const s of [400, 401, 410, 422]) {
      expect(decide(resp(s))).toEqual({ kind: 'failed', reason: 'http-error' });
    }
  });

  it('other non-retriable statuses and 3xx fail as http-error (15.5)', () => {
    expect(decide(resp(302))).toEqual({ kind: 'failed', reason: 'http-error' });
    expect(decide(resp(600))).toEqual({ kind: 'failed', reason: 'http-error' });
  });

  it('429 retries with backoff and is rate-limited when exhausted (15.4)', () => {
    expect(decide(resp(429))).toEqual({ kind: 'retry', waitMs: 250 });
    expect(decide(resp(429), { attempts: RETRY_MAX_ATTEMPTS })).toEqual({
      kind: 'failed',
      reason: 'rate-limited',
    });
  });

  it('5xx retries and fails http-error when exhausted (15.4)', () => {
    expect(decide(resp(500), { attempts: 2, random: 0.5 })).toEqual({ kind: 'retry', waitMs: 550 });
    expect(decide(resp(599))).toEqual({ kind: 'retry', waitMs: 250 });
    expect(decide(resp(503), { attempts: RETRY_MAX_ATTEMPTS })).toEqual({
      kind: 'failed',
      reason: 'http-error',
    });
  });

  it('network error and timeout retry, and fail with their own reason when exhausted (15.4)', () => {
    expect(decide({ type: 'network-error' })).toEqual({ kind: 'retry', waitMs: 250 });
    expect(decide({ type: 'timeout' })).toEqual({ kind: 'retry', waitMs: 250 });
    expect(decide({ type: 'network-error' }, { attempts: RETRY_MAX_ATTEMPTS })).toEqual({
      kind: 'failed',
      reason: 'network',
    });
    expect(decide({ type: 'timeout' }, { attempts: RETRY_MAX_ATTEMPTS })).toEqual({
      kind: 'failed',
      reason: 'timeout',
    });
  });

  it('oversize, redirect-refused are http-error without retry; deadline is deadline (15.15, 15.19, 15.20)', () => {
    expect(decide({ type: 'oversize' })).toEqual({ kind: 'failed', reason: 'http-error' });
    expect(decide({ type: 'redirect-refused' })).toEqual({ kind: 'failed', reason: 'http-error' });
    expect(decide({ type: 'deadline' })).toEqual({ kind: 'failed', reason: 'deadline' });
  });

  it('makes no further attempt once the budget gate blocks it (15.17)', () => {
    expect(decide(resp(500), { source: 'github', gateAllows: false })).toEqual({
      kind: 'failed',
      reason: 'budget',
    });
    expect(decide(resp(500), { source: 'github', gateAllows: true })).toEqual({ kind: 'retry', waitMs: 250 });
  });
});

describe('Retry-After (15.7, 15.8)', () => {
  it('Retry-After 0 retries with a zero wait', () => {
    expect(decide(resp(429, { 'Retry-After': '0' }))).toEqual({ kind: 'retry', waitMs: 0 });
  });

  it('header name is case-insensitive', () => {
    expect(decide(resp(429, { 'retry-after': '2' }))).toEqual({ kind: 'retry', waitMs: 2000 });
  });

  it('waits exactly RETRY_AFTER_MAX_MS but refuses anything above as rate-limited', () => {
    const max = RETRY_AFTER_MAX_MS / 1000;
    expect(decide(resp(429, { 'Retry-After': String(max) }))).toEqual({
      kind: 'retry',
      waitMs: RETRY_AFTER_MAX_MS,
    });
    expect(decide(resp(429, { 'Retry-After': String(max + 1) }))).toEqual({
      kind: 'failed',
      reason: 'rate-limited',
    });
    // A saturated value ends after the scan deadline, which criterion 8 checks first.
    expect(decide(resp(429, { 'Retry-After': '99999999999999999999999' }))).toEqual({
      kind: 'failed',
      reason: 'deadline',
    });
  });

  it('ignores a date-form value and uses backoff', () => {
    expect(decide(resp(429, { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' }), { random: 0.5 })).toEqual({
      kind: 'retry',
      waitMs: 275,
    });
  });

  it('ignores Retry-After on other statuses', () => {
    expect(decide(resp(503, { 'Retry-After': '3' }))).toEqual({ kind: 'retry', waitMs: 250 });
    expect(decide(resp(400, { 'Retry-After': '3' }))).toEqual({ kind: 'failed', reason: 'http-error' });
  });

  it('GitHub 403 with Retry-After is a throttle: retries, rate-limited when exhausted', () => {
    expect(decide(resp(403, { 'Retry-After': '2' }), { source: 'github' })).toEqual({
      kind: 'retry',
      waitMs: 2000,
    });
    expect(
      decide(resp(403, { 'Retry-After': '2' }), { source: 'github', attempts: RETRY_MAX_ATTEMPTS }),
    ).toEqual({ kind: 'failed', reason: 'rate-limited' });
  });

  it('GitHub 403 without Retry-After is final http-error', () => {
    expect(decide(resp(403), { source: 'github' })).toEqual({ kind: 'failed', reason: 'http-error' });
    expect(decide(resp(403, { 'x-ratelimit-remaining': '0' }), { source: 'github' })).toEqual({
      kind: 'failed',
      reason: 'http-error',
    });
  });

  it('403 with Retry-After on a non-GitHub source is final http-error', () => {
    expect(decide(resp(403, { 'Retry-After': '2' }), { source: 'npm' })).toEqual({
      kind: 'failed',
      reason: 'http-error',
    });
  });
});

describe('deadline and total timeout (15.6, 15.8)', () => {
  it('backoff ending after the scan deadline fails as deadline', () => {
    expect(decide(resp(500), { now: SCAN_DEADLINE_MS - 249, firstSentAt: SCAN_DEADLINE_MS - 300 })).toEqual({ kind: 'failed', reason: 'deadline' });
  });

  it('backoff ending exactly at the scan deadline is allowed', () => {
    expect(decide(resp(500), { now: SCAN_DEADLINE_MS - 250, firstSentAt: SCAN_DEADLINE_MS - 300 })).toEqual({ kind: 'retry', waitMs: 250 });
  });

  it('Retry-After ending after the scan deadline fails as deadline, even when also above the max', () => {
    expect(decide(resp(429, { 'Retry-After': '2' }), { now: SCAN_DEADLINE_MS - 1999 })).toEqual({
      kind: 'failed',
      reason: 'deadline',
    });
    expect(decide(resp(429, { 'Retry-After': '60' }), { now: SCAN_DEADLINE_MS - 1000 })).toEqual({
      kind: 'failed',
      reason: 'deadline',
    });
  });

  it('backoff ending after the total timeout fails with the last reason', () => {
    const first = 0;
    const now = REQUEST_TOTAL_TIMEOUT_MS - 249;
    expect(decide(resp(500), { now, firstSentAt: first })).toEqual({ kind: 'failed', reason: 'http-error' });
    expect(decide({ type: 'timeout' }, { now, firstSentAt: first })).toEqual({
      kind: 'failed',
      reason: 'timeout',
    });
    expect(decide(resp(500), { now: REQUEST_TOTAL_TIMEOUT_MS - 250, firstSentAt: first })).toEqual({
      kind: 'retry',
      waitMs: 250,
    });
  });

  it('Retry-After ending after the total timeout fails as rate-limited', () => {
    expect(
      decide(resp(429, { 'Retry-After': '2' }), { now: REQUEST_TOTAL_TIMEOUT_MS - 1999, firstSentAt: 0 }),
    ).toEqual({ kind: 'failed', reason: 'rate-limited' });
  });
});

describe('resolveRedirect (15.9, 15.19, 15.20)', () => {
  const first = 'https://api.github.com/repos/a/b';

  it('follows a same-origin absolute Location', () => {
    expect(resolveRedirect(first, first, 'https://api.github.com/repositories/1', 0, 'GET')).toEqual({
      kind: 'follow',
      url: 'https://api.github.com/repositories/1',
    });
  });

  it('resolves a relative Location against the current URL', () => {
    expect(resolveRedirect(first, first, '/repositories/1', 0, 'GET')).toEqual({
      kind: 'follow',
      url: 'https://api.github.com/repositories/1',
    });
  });

  it('follows up to REDIRECT_MAX_HOPS hops and refuses beyond', () => {
    const loc = 'https://api.github.com/x';
    expect(resolveRedirect(first, first, loc, REDIRECT_MAX_HOPS - 1, 'GET').kind).toBe('follow');
    expect(resolveRedirect(first, first, loc, REDIRECT_MAX_HOPS, 'GET').kind).toBe('refuse');
  });

  it('refuses a different host, scheme or port', () => {
    expect(resolveRedirect(first, first, 'https://evil.example/x', 0, 'GET').kind).toBe('refuse');
    expect(resolveRedirect(first, first, 'http://api.github.com/x', 0, 'GET').kind).toBe('refuse');
    expect(resolveRedirect(first, first, 'https://api.github.com:8443/x', 0, 'GET').kind).toBe('refuse');
  });

  it('refuses a missing, empty or unparsable Location', () => {
    expect(resolveRedirect(first, first, undefined, 0, 'GET').kind).toBe('refuse');
    expect(resolveRedirect(first, first, '   ', 0, 'GET').kind).toBe('refuse');
    expect(resolveRedirect(first, first, 'http://[bad', 0, 'GET').kind).toBe('refuse');
  });

  it('refuses a non-http(s) scheme', () => {
    expect(resolveRedirect(first, first, 'ftp://api.github.com/x', 0, 'GET').kind).toBe('refuse');
    expect(resolveRedirect(first, first, 'javascript:alert(1)', 0, 'GET').kind).toBe('refuse');
  });

  it('refuses a redirect of a non-GET request', () => {
    expect(resolveRedirect(first, first, 'https://api.github.com/x', 0, 'POST').kind).toBe('refuse');
  });

  it('checks every hop against the origin of the first URL', () => {
    const current = 'https://api.github.com/a';
    expect(resolveRedirect(first, current, 'https://other.example/b', 1, 'GET').kind).toBe('refuse');
  });
});
