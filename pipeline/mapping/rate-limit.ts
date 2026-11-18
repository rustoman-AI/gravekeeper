// Requirement 14.2, 14.4, 3.7
import { parseIsoInstant } from './day-count';
import { readOwn } from './read-own';
import type { IsoInstant } from './types';

/** Structurally the same as the port's SourceHeaders (mappers may not import ports). */
type HeaderRecord = Readonly<Record<string, string>>;

export interface RateLimitReading {
  readonly remaining: number | null;
  readonly resetAt: IsoInstant | null;
}

/** Largest epoch second whose ISO form still has a four digit year. */
const MAX_EPOCH_SECONDS = 253402300799;

/** A base-10 whole number of at least 0 (a number or a digit string). */
function readInteger(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0) ? value : null;
  }
  if (typeof value === 'string' && /^[0-9]+$/.test(value)) {
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

function epochSecondsToIso(value: unknown): IsoInstant | null {
  const seconds = readInteger(value);
  if (seconds === null || seconds > MAX_EPOCH_SECONDS) return null;
  return new Date(seconds * 1000).toISOString().replace('.000Z', 'Z');
}

/**
 * GitHub_Budget reading from a GraphQL body: `data.rateLimit.remaining` when
 * an integer and `data.rateLimit.resetAt` when a valid ISO 8601 UTC instant.
 * The header fallback of EF-18 belongs to the caller. Total, never throws.
 */
export function readGraphqlRateLimit(body: unknown): RateLimitReading {
  const rateLimit = readOwn(readOwn(body, 'data'), 'rateLimit');
  const rawRemaining = readOwn(rateLimit, 'remaining');
  const remaining = typeof rawRemaining === 'number' ? readInteger(rawRemaining) : null;
  const rawResetAt = readOwn(rateLimit, 'resetAt');
  const resetAt =
    typeof rawResetAt === 'string' && parseIsoInstant(rawResetAt) !== null ? rawResetAt : null;
  return { remaining, resetAt };
}

/**
 * GitHub_Budget reading from REST headers `x-ratelimit-remaining` (integer)
 * and `x-ratelimit-reset` (integer epoch seconds). Total, never throws.
 */
export function readRestRateLimit(headers: HeaderRecord): RateLimitReading {
  return {
    remaining: readInteger(readOwn(headers, 'x-ratelimit-remaining')),
    resetAt: epochSecondsToIso(readOwn(headers, 'x-ratelimit-reset')),
  };
}
