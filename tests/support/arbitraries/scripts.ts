import * as fc from 'fast-check';
import {
  MAX_RESPONSE_BYTES,
  REQUEST_TIMEOUT_MS,
  REQUEST_TOTAL_TIMEOUT_MS,
  RETRY_AFTER_MAX_MS,
  SCAN_DEADLINE_MS,
} from '../../../pipeline/constants';
import type { ScriptedBody, ScriptedResponse, Step } from '../scripted-fetch';

// Requirement 15.9, 15.19, 15.21, 16.13, 23.1: scripted per-source steps.

/** Latencies on both sides of every timeout boundary, plus 'never'. */
export const latencyMs: fc.Arbitrary<number | 'never'> = fc.oneof(
  { weight: 4, arbitrary: fc.integer({ min: 0, max: 300 }) },
  {
    weight: 4,
    arbitrary: fc
      .constantFrom(REQUEST_TIMEOUT_MS, REQUEST_TOTAL_TIMEOUT_MS, SCAN_DEADLINE_MS)
      .chain((boundary) => fc.integer({ min: -2, max: 2 }).map((delta) => Math.max(0, boundary + delta))),
  },
  { weight: 1, arbitrary: fc.integer({ min: 0, max: SCAN_DEADLINE_MS + 5000 }) },
  { weight: 1, arbitrary: fc.constant('never' as const) },
);

/** Latency strictly below REQUEST_TIMEOUT_MS. */
export const fastLatencyMs: fc.Arbitrary<number> = fc.integer({ min: 0, max: REQUEST_TIMEOUT_MS - 1 });

/** Retry-After header values: seconds, HTTP dates, and malformed text. */
export const retryAfterValue: fc.Arbitrary<string> = fc.oneof(
  fc.integer({ min: 0, max: 10 }).map(String),
  fc
    .constantFrom(RETRY_AFTER_MAX_MS, RETRY_AFTER_MAX_MS + 1000)
    .chain((ms) => fc.integer({ min: -1, max: 1 }).map((d) => String(Math.max(0, Math.round(ms / 1000) + d)))),
  fc.integer({ min: 11, max: 100000 }).map(String),
  fc.constantFrom('-1', '1.5', '1e3', '', ' ', 'abc', 'Wed, 21 Oct 2015 07:28:00 GMT', 'Thu, 01 Jan 1970 00:00:00 GMT', '99999999999999999999'),
);

export interface BudgetHeaders {
  readonly limit: number;
  readonly remaining: number;
  readonly resetEpochSeconds: number;
}

const budgetHeaders: fc.Arbitrary<BudgetHeaders> = fc.record({
  limit: fc.integer({ min: 1, max: 5000 }),
  remaining: fc.oneof(fc.integer({ min: 0, max: 20 }), fc.integer({ min: 0, max: 5000 })),
  resetEpochSeconds: fc.integer({ min: 0, max: 4_000_000_000 }),
});

/** A sequence of GitHub rate-limit header sets, one per response. */
export const budgetHeaderSequence: fc.Arbitrary<readonly BudgetHeaders[]> = fc.array(budgetHeaders, {
  minLength: 1,
  maxLength: 8,
});

export function budgetHeaderPairs(h: BudgetHeaders): readonly (readonly [string, string])[] {
  return [
    ['x-ratelimit-limit', String(h.limit)],
    ['x-ratelimit-remaining', String(h.remaining)],
    ['x-ratelimit-reset', String(h.resetEpochSeconds)],
  ];
}

/** Bodies: small JSON, empty, and oversize (just over MAX_RESPONSE_BYTES, streamed). */
export const scriptedBody: fc.Arbitrary<ScriptedBody | undefined> = fc.oneof(
  { weight: 5, arbitrary: fc.constant<ScriptedBody>({ kind: 'text', text: '{}' }) },
  { weight: 2, arbitrary: fc.jsonValue().map((v): ScriptedBody => ({ kind: 'text', text: JSON.stringify(v) })) },
  { weight: 1, arbitrary: fc.constant(undefined) },
  {
    weight: 1,
    arbitrary: fc
      .integer({ min: -1, max: 2 })
      .map((d): ScriptedBody => ({ kind: 'size', size: MAX_RESPONSE_BYTES + d })),
  },
);

export const oversizeBody: fc.Arbitrary<ScriptedBody> = fc
  .integer({ min: 1, max: 100000 })
  .map((extra): ScriptedBody => ({ kind: 'size', size: MAX_RESPONSE_BYTES + extra }));

const successStatus = fc.constantFrom(200, 200, 200, 201, 204);
const failureStatus = fc.constantFrom(400, 401, 403, 404, 408, 409, 410, 422, 429, 500, 502, 503, 504);

function withBody(
  status: number,
  headers: readonly (readonly [string, string])[],
  body: ScriptedBody | undefined,
): ScriptedResponse {
  return body === undefined ? { status, headers } : { status, headers, body };
}

const retryAfterHeader: fc.Arbitrary<readonly (readonly [string, string])[]> = fc.oneof(
  fc.constant([] as readonly (readonly [string, string])[]),
  retryAfterValue.map((v): readonly (readonly [string, string])[] => [['Retry-After', v]]),
);

const successResponse: fc.Arbitrary<ScriptedResponse> = fc
  .tuple(successStatus, scriptedBody, fc.option(budgetHeaders, { nil: undefined }))
  .map(([status, body, budget]) =>
    withBody(status, [['content-type', 'application/json'], ...(budget ? budgetHeaderPairs(budget) : [])], body),
  );

const failureResponse: fc.Arbitrary<ScriptedResponse> = fc
  .tuple(failureStatus, retryAfterHeader, fc.option(budgetHeaders, { nil: undefined }))
  .map(([status, retryAfter, budget]) =>
    withBody(status, [...retryAfter, ...(budget ? budgetHeaderPairs(budget) : [])], { kind: 'text', text: '{}' }),
  );

export interface StepOptions {
  /** Percent (0 to 100) of steps that fail (network error or error status). Default 30. */
  readonly failurePercent?: number;
}

/** One scripted step. Failures are network errors, error statuses (some with Retry-After) and 'never'. */
export function scriptStep(options: StepOptions = {}): fc.Arbitrary<Step> {
  const failurePercent = Math.min(100, Math.max(0, options.failurePercent ?? 30));
  const failure: fc.Arbitrary<Step> = fc.oneof(
    fc.record({ latencyMs, response: fc.constant('network-error' as const) }),
    fc.record({ latencyMs, response: failureResponse }),
  );
  const success: fc.Arbitrary<Step> = fc.record({ latencyMs, response: successResponse });
  return fc
    .integer({ min: 0, max: 99 })
    .chain((roll) => (roll < failurePercent ? failure : success));
}

/** A per-source script: attempt N uses step N, the last step repeats (see `scriptFromSteps`). */
export function sourceScript(options: StepOptions & { readonly maxSteps?: number } = {}): fc.Arbitrary<readonly Step[]> {
  return fc.array(scriptStep(options), { minLength: 1, maxLength: options.maxSteps ?? 6 });
}

/** Steps that always fail with a retryable network error, at the given latency. */
export const networkErrorStep = (latency: number | 'never' = 0): Step => ({
  latencyMs: latency,
  response: 'network-error',
});
