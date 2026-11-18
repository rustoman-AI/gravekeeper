import {
  REDIRECT_MAX_HOPS,
  REQUEST_TOTAL_TIMEOUT_MS,
  RETRY_AFTER_MAX_MS,
  RETRY_BASE_DELAY_MS,
  RETRY_JITTER_RATIO,
  RETRY_MAX_ATTEMPTS,
  RETRY_MAX_DELAY_MS,
} from '../../pipeline/constants';
import type { AdapterReason, SourceHeaders, SourceName } from '../../pipeline/ports/http';

// Pure retry and redirect policy. No clock, timer or random access: every
// time and random value arrives as an argument (Requirement 15.10).

// Requirement 15.6
/** floor(b + r * RETRY_JITTER_RATIO * b), b = min(RETRY_BASE_DELAY_MS * 2^(n-1), RETRY_MAX_DELAY_MS). */
export function backoffDelayMs(attemptsMade: number, r: number): number {
  const n = Math.max(1, Math.floor(attemptsMade));
  const b = Math.min(RETRY_BASE_DELAY_MS * 2 ** (n - 1), RETRY_MAX_DELAY_MS);
  return Math.floor(b + r * RETRY_JITTER_RATIO * b);
}

// Requirement 15.7
/** Non-negative integer seconds only, else null. Values beyond the safe integer range saturate. */
export function parseRetryAfter(value: string | undefined): number | null {
  if (value === undefined) return null;
  const text = value.trim();
  if (!/^[0-9]+$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) ? n : Number.MAX_SAFE_INTEGER;
}

/** The result of one Attempt, as produced by the HTTP client. */
export type AttemptResult =
  | {
      readonly type: 'response';
      readonly status: number;
      readonly headers: SourceHeaders;
    }
  | { readonly type: 'network-error' }
  | { readonly type: 'timeout' }
  | { readonly type: 'deadline' }
  | { readonly type: 'oversize' }
  | { readonly type: 'redirect-refused' };

export interface DecideInput {
  readonly source: SourceName;
  /** Attempts made so far, including the one that produced `result` (>= 1). */
  readonly attempts: number;
  readonly result: AttemptResult;
  readonly notFound: 'absent' | 'failed';
  readonly now: number;
  /** Clock reading at the first send of the Work_Unit, or null when nothing was sent. */
  readonly firstSentAt: number | null;
  readonly deadlineAtMs: number;
  /** A value in [0, 1) from the injected random function. */
  readonly random: number;
  /** False when the gate would block the next attempt (GitHub_Budget below threshold). Pass true without a gate. */
  readonly gateAllows: boolean;
}

export type Decision =
  | { readonly kind: 'ok' }
  | { readonly kind: 'absent' }
  | { readonly kind: 'failed'; readonly reason: AdapterReason }
  | { readonly kind: 'retry'; readonly waitMs: number };

function headerValue(headers: SourceHeaders, name: string): string | undefined {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name) return headers[key];
  }
  return undefined;
}

// Requirements 15.4, 15.5, 15.6, 15.7, 15.8, 15.17
export function decideAfterAttempt(input: DecideInput): Decision {
  const { result } = input;

  if (result.type === 'deadline') return { kind: 'failed', reason: 'deadline' };
  if (result.type === 'oversize' || result.type === 'redirect-refused') {
    return { kind: 'failed', reason: 'http-error' };
  }

  let retryAfterHeader: string | undefined;
  let lastReason: AdapterReason;

  if (result.type === 'response') {
    const { status } = result;
    if (status >= 200 && status < 300) return { kind: 'ok' };
    if (status === 404) {
      return input.notFound === 'absent'
        ? { kind: 'absent' }
        : { kind: 'failed', reason: 'http-error' };
    }
    const retryAfter = headerValue(result.headers, 'retry-after');
    if (status === 429 || (status === 403 && input.source === 'github' && retryAfter !== undefined)) {
      lastReason = 'rate-limited';
      retryAfterHeader = retryAfter;
    } else if (status >= 500 && status <= 599) {
      lastReason = 'http-error';
    } else {
      return { kind: 'failed', reason: 'http-error' };
    }
  } else if (result.type === 'network-error') {
    lastReason = 'network';
  } else {
    lastReason = 'timeout';
  }

  if (input.attempts >= RETRY_MAX_ATTEMPTS) return { kind: 'failed', reason: lastReason };

  const retryAfterSeconds = parseRetryAfter(retryAfterHeader);
  const waitMs =
    retryAfterSeconds === null
      ? backoffDelayMs(input.attempts, input.random)
      : retryAfterSeconds * 1000;

  if (input.now + waitMs > input.deadlineAtMs) return { kind: 'failed', reason: 'deadline' };
  if (retryAfterSeconds !== null && waitMs > RETRY_AFTER_MAX_MS) {
    return { kind: 'failed', reason: 'rate-limited' };
  }
  if (input.firstSentAt !== null && input.now + waitMs > input.firstSentAt + REQUEST_TOTAL_TIMEOUT_MS) {
    return { kind: 'failed', reason: lastReason };
  }
  if (!input.gateAllows) return { kind: 'failed', reason: 'budget' };
  return { kind: 'retry', waitMs };
}

export type RedirectDecision =
  | { readonly kind: 'follow'; readonly url: string }
  | { readonly kind: 'refuse' };

// Requirements 15.9, 15.19, 15.20, 15.21
/**
 * `follow` only for a GET whose Location resolves (against currentUrl) to an
 * http or https URL with the origin of firstUrl, with fewer than
 * REDIRECT_MAX_HOPS redirects followed so far.
 */
export function resolveRedirect(
  firstUrl: string,
  currentUrl: string,
  location: string | undefined,
  hops: number,
  method: 'GET' | 'POST',
): RedirectDecision {
  if (method !== 'GET') return { kind: 'refuse' };
  if (hops >= REDIRECT_MAX_HOPS) return { kind: 'refuse' };
  if (location === undefined || location.trim() === '') return { kind: 'refuse' };
  try {
    const first = new URL(firstUrl);
    const target = new URL(location.trim(), currentUrl);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return { kind: 'refuse' };
    if (target.origin !== first.origin) return { kind: 'refuse' };
    return { kind: 'follow', url: target.href };
  } catch {
    return { kind: 'refuse' };
  }
}
