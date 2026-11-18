import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createHttpClient } from '../../adapters/http/http-client';
import { createGithubAuthorizer } from '../../adapters/http/github-authorizer';
import { backoffDelayMs, parseRetryAfter } from '../../adapters/http/retry-policy';
import {
  REQUEST_TIMEOUT_MS,
  REQUEST_TOTAL_TIMEOUT_MS,
  RETRY_AFTER_MAX_MS,
  REDIRECT_MAX_HOPS,
  RETRY_MAX_ATTEMPTS,
} from '../../pipeline/constants';
import type { HttpRequest, RequestContext, SourceName, WorkUnitOutcome } from '../../pipeline/ports/http';
import { ORIGIN, chainScript, expectedFollowableHops, redirectChain } from '../support/arbitraries/redirects';
import { sourceScript, scriptStep } from '../support/arbitraries/scripts';
import { createFakeRuntime, runUntilSettled } from '../support/fake-runtime';
import { cfg } from '../support/fc-config';
import { createScriptedFetch, scriptFromSteps, type Step } from '../support/scripted-fetch';

// ---------------------------------------------------------------------------
// Shared harness (reused by later properties in this file)
// ---------------------------------------------------------------------------

const SOURCES: readonly SourceName[] = ['github', 'depsdev', 'osv', 'npm', 'cratesio', 'pypi'];
const FAR = 10_000_000;
const URL_A = 'https://registry.npmjs.org/a';

const arbSource: fc.Arbitrary<SourceName> = fc.constantFrom(...SOURCES);
const arbNotFound: fc.Arbitrary<HttpRequest['notFound']> = fc.constantFrom('absent', 'failed');
const arbFailurePercent: fc.Arbitrary<number> = fc.constantFrom(0, 10, 30, 60, 90, 100);

function makeRequest(source: SourceName, notFound: HttpRequest['notFound']): HttpRequest {
  return {
    source,
    method: 'GET',
    url: URL_A,
    headers: {},
    body: null,
    auth: source === 'github' ? 'github' : 'none',
    notFound,
    cache: null,
    gate: null,
  };
}

interface RunResult {
  readonly outcome: WorkUnitOutcome;
  /** Fetch calls made for the Work_Unit (one per attempt, no redirects scripted). */
  readonly fetchCalls: number;
}

/** Runs one Work_Unit through the real client against a scripted fetch and fake runtime. */
async function runWorkUnit(
  steps: readonly Step[],
  source: SourceName,
  notFound: HttpRequest['notFound'],
  deadlineAtMs: number = FAR,
): Promise<RunResult> {
  const runtime = createFakeRuntime(0, [0.5]);
  const scripted = createScriptedFetch(scriptFromSteps(steps), runtime);
  const limiters = Object.fromEntries(SOURCES.map((n) => [n, { concurrency: 4, minIntervalMs: 0 }])) as Record<
    SourceName,
    { concurrency: number; minIntervalMs: number }
  >;
  const client = createHttpClient({
    fetchImpl: scripted.fetch,
    clock: runtime.clock,
    timer: runtime.timer,
    random: runtime.random,
    logger: { log: () => undefined },
    limiters,
    authorizer: () => null,
    secrets: () => [],
    userAgent: 'gravekeeper-test',
  });
  const ctx: RequestContext = { signal: new AbortController().signal, deadlineAtMs };
  const outcome = await runUntilSettled(client.execute(makeRequest(source, notFound), ctx), runtime);
  return { outcome, fetchCalls: scripted.calls.length };
}

/** Attempts reported by an outcome (every outcome kind carries `attempts`). */
function attemptsOf(outcome: WorkUnitOutcome): number {
  return outcome.attempts;
}

/** Deadlines: far away, and tight ones that can cut retries short. */
const arbDeadline: fc.Arbitrary<number> = fc.oneof(
  fc.constant(FAR),
  fc.integer({ min: 0, max: 30_000 }),
);

/** True when the step's outcome is one the policy retries (429, 5xx, network error, timeout, GitHub throttle). */
function isRetriableFirst(step: Step, source: SourceName): boolean {
  if (step.response === 'network-error') return true;
  if (step.latencyMs === 'never' || step.latencyMs >= REQUEST_TIMEOUT_MS) return true; // timeout
  const { status, headers } = step.response;
  if (status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  if (source === 'github' && status === 403) {
    return (headers ?? []).some(([name]) => name.toLowerCase() === 'retry-after');
  }
  return false;
}

// ---------------------------------------------------------------------------
// Properties 42 and 43
// ---------------------------------------------------------------------------

describe('http client attempt counts', () => {
  // Feature: scan-pipeline, Property 42: Attempts per Work_Unit are bounded
  // Validates: Requirements 15.11
  it('P42 attempts per Work_Unit are bounded', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbFailurePercent.chain((p) => sourceScript({ failurePercent: p, maxSteps: 6 })),
        arbSource,
        arbNotFound,
        arbDeadline,
        async (steps, source, notFound, deadlineAtMs) => {
          const { outcome, fetchCalls } = await runWorkUnit(steps, source, notFound, deadlineAtMs);
          expect(fetchCalls).toBeLessThanOrEqual(RETRY_MAX_ATTEMPTS);
          expect(attemptsOf(outcome)).toBeLessThanOrEqual(RETRY_MAX_ATTEMPTS);
          expect(attemptsOf(outcome)).toBe(fetchCalls);
        },
      ),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 43: Non-retriable first outcomes get exactly one attempt
  // Validates: Requirements 15.12
  it('P43 non-retriable first outcomes get exactly one attempt', async () => {
   await fc.assert(
      fc.asyncProperty(
        arbSource.chain((source) =>
          fc.tuple(
            fc.constant(source),
            arbNotFound,
            arbFailurePercent.chain((p) =>
              fc.tuple(
                scriptStep({ failurePercent: p }).filter((s) => !isRetriableFirst(s, source)),
                fc.array(scriptStep({ failurePercent: p }), { maxLength: 5 }),
              ),
            ),
          ),
        ),
        async ([source, notFound, [first, rest]]) => {
          const { outcome, fetchCalls } = await runWorkUnit([first, ...rest], source, notFound);
          expect(fetchCalls).toBe(1);
          expect(attemptsOf(outcome)).toBe(1);
        },
      ),
      cfg(),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 46
// ---------------------------------------------------------------------------

/** A retriable response or network error, with the Retry-After seconds (429 only) it carries. */
interface WaitStep {
  readonly step: Step;
  /** Retry-After header text on a 429, else null. */
  readonly retryAfter: string | null;
}

function waitStep(retryAfter: fc.Arbitrary<string | null>): fc.Arbitrary<WaitStep> {
  const latency = fc.integer({ min: 0, max: 200 });
  return fc.oneof(
    fc.tuple(latency, fc.integer({ min: 500, max: 599 })).map(
      ([latencyMs, status]): WaitStep => ({ step: { latencyMs, response: { status } }, retryAfter: null }),
    ),
    latency.map((latencyMs): WaitStep => ({ step: { latencyMs, response: 'network-error' }, retryAfter: null })),
    fc.tuple(latency, retryAfter).map(
      ([latencyMs, value]): WaitStep => ({
        step: {
          latencyMs,
          response: { status: 429, headers: value === null ? [] : [['Retry-After', value]] },
        },
        retryAfter: value,
      }),
    ),
  );
}

/** Small Retry-After values (or none), so earlier waits stay far from the deadline. */
const arbPrefixRetryAfter: fc.Arbitrary<string | null> = fc.oneof(
  fc.constant(null),
  fc.integer({ min: 0, max: 3 }).map(String),
);

/** Any Retry-After: absent, invalid, small, around RETRY_AFTER_MAX_MS, or huge. */
const arbLastRetryAfter: fc.Arbitrary<string | null> = fc.oneof(
  fc.constant(null),
  fc.constantFrom('abc', '-1', '1.5', ''),
  fc.integer({ min: 0, max: 12 }).map(String),
  fc.integer({ min: 0, max: 1_000_000 }).map(String),
);

/** Offsets around the boundary: both sides, with a bias to the exact edge. */
const arbBoundaryDelta: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: -3, max: 3 }),
  fc.integer({ min: -1000, max: 1000 }),
);

interface Observed {
  readonly outcome: WorkUnitOutcome;
  readonly fetchCalls: number;
  /** Clock reading at each retry decision (one random() draw per decision). */
  readonly decisionAt: readonly number[];
  /** Waits the client scheduled on the Work_Unit signal: clock when scheduled, and length. */
  readonly waits: readonly { readonly at: number; readonly ms: number }[];
}

async function observeWorkUnit(
  steps: readonly Step[],
  source: SourceName,
  notFound: HttpRequest['notFound'],
  deadlineAtMs: number,
  r: number,
): Promise<Observed> {
  const runtime = createFakeRuntime(0, [r]);
  const decisionAt: number[] = [];
  const waits: { at: number; ms: number }[] = [];
  const ctx: RequestContext = { signal: new AbortController().signal, deadlineAtMs };
  const scripted = createScriptedFetch(scriptFromSteps(steps), runtime);
  const limiters = Object.fromEntries(SOURCES.map((n) => [n, { concurrency: 4, minIntervalMs: 0 }])) as Record<
    SourceName,
    { concurrency: number; minIntervalMs: number }
  >;
  const client = createHttpClient({
    fetchImpl: scripted.fetch,
    clock: runtime.clock,
    timer: {
      ...runtime.timer,
      sleep: (ms, signal) => {
        if (signal === ctx.signal) waits.push({ at: runtime.clock(), ms });
        return runtime.timer.sleep(ms, signal);
      },
    },
    random: () => {
      decisionAt.push(runtime.clock());
      return runtime.random();
    },
    logger: { log: () => undefined },
    limiters,
    authorizer: () => null,
    secrets: () => [],
    userAgent: 'gravekeeper-test',
  });
  const outcome = await runUntilSettled(client.execute(makeRequest(source, notFound), ctx), runtime);
  return { outcome, fetchCalls: scripted.calls.length, decisionAt, waits };
}

/** The wait the policy computes after attempt number `attempt` (1-based) for this step. */
function expectedWait(ws: WaitStep, attempt: number, r: number): { ms: number; fromRetryAfter: boolean } {
  const seconds = parseRetryAfter(ws.retryAfter ?? undefined);
  if (seconds !== null) return { ms: seconds * 1000, fromRetryAfter: true };
  return { ms: backoffDelayMs(attempt, r), fromRetryAfter: false };
}

describe('http client deadline', () => {
  // Feature: scan-pipeline, Property 46: A wait that would cross the deadline ends the unit
  // Validates: Requirements 15.18
  it('P46 a wait that would cross the deadline ends the unit', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: RETRY_MAX_ATTEMPTS - 2 }).chain((k) =>
          fc.tuple(
            fc.constant(k),
            fc.array(waitStep(arbPrefixRetryAfter), { minLength: k, maxLength: k }),
            waitStep(arbLastRetryAfter),
          ),
        ),
        arbSource,
        arbNotFound,
        fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }),
        arbBoundaryDelta,
        async ([k, prefix, last], source, notFound, r, delta) => {
          const all = [...prefix, last];
          const steps = all.map((w) => w.step);

          // Timeline without deadline pressure, to learn the clock at decision k.
          const baseline = await observeWorkUnit(steps, source, notFound, FAR, r);
          expect(baseline.decisionAt.length).toBeGreaterThan(k);
          const now = baseline.decisionAt[k] as number;
          const wait = expectedWait(last, k + 1, r);

          // Deadline on either side of now + wait, never before the decision itself.
          const deadlineAtMs = Math.max(now, now + wait.ms + delta);
          const crossing = now + wait.ms > deadlineAtMs;

          const run = await observeWorkUnit(steps, source, notFound, deadlineAtMs, r);

          if (crossing) {
            expect(run.outcome.kind).toBe('failed');
            if (run.outcome.kind === 'failed') expect(run.outcome.reason).toBe('deadline');
            expect(attemptsOf(run.outcome)).toBe(k + 1);
            expect(run.fetchCalls).toBe(k + 1);
            // No wait for the crossing retry was scheduled: only the k earlier waits exist.
            expect(run.waits).toHaveLength(k);
          } else {
            // A wait that ends exactly at the deadline, or before it, does not end the unit.
            expect(run.waits.length).toBeGreaterThanOrEqual(k);
            const retryAllowed =
              !(wait.fromRetryAfter && wait.ms > RETRY_AFTER_MAX_MS) && now + wait.ms <= REQUEST_TOTAL_TIMEOUT_MS;
            if (retryAllowed) {
              expect(run.waits.length).toBeGreaterThanOrEqual(k + 1);
              expect(run.waits[k]).toEqual({ at: now, ms: wait.ms });
              expect(run.fetchCalls).toBeGreaterThanOrEqual(k + 2);
            } else if (run.outcome.kind === 'failed') {
              expect(run.outcome.reason).not.toBe('deadline');
            }
          }
          // Every wait ever scheduled ends at or before the deadline.
          for (const w of run.waits) expect(w.at + w.ms).toBeLessThanOrEqual(deadlineAtMs);
        },
      ),
      cfg(),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 73
// ---------------------------------------------------------------------------

const P73_TOKEN = 'ghp_p73_real_token';
const P73_GITHUB = { apiUrl: ORIGIN, graphqlUrl: `${ORIGIN}/graphql`, webHost: 'github.com' };

describe('http client redirects', () => {
  // Feature: scan-pipeline, Property 73: Redirect chains never leave the origin or exceed the hop limit
  // Validates: Requirements 15.21
  it('P73 redirect chains never leave the origin or exceed the hop limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        redirectChain,
        fc.constantFrom<'GET' | 'POST'>('GET', 'POST'),
        fc.constantFrom<'github' | 'none'>('github', 'none'),
        arbNotFound,
        async (chain, method, auth, notFound) => {
          const runtime = createFakeRuntime(0, [0.5]);
          const scripted = createScriptedFetch(chainScript(chain), runtime);
          const limiters = Object.fromEntries(
            SOURCES.map((n) => [n, { concurrency: 4, minIntervalMs: 0 }]),
          ) as Record<SourceName, { concurrency: number; minIntervalMs: number }>;
          const client = createHttpClient({
            fetchImpl: scripted.fetch,
            clock: runtime.clock,
            timer: runtime.timer,
            random: runtime.random,
            logger: { log: () => undefined },
            limiters,
            authorizer: createGithubAuthorizer(() => P73_TOKEN, P73_GITHUB),
            secrets: () => [P73_TOKEN],
            userAgent: 'gravekeeper-test',
          });
          const request: HttpRequest = {
            source: 'github',
            method,
            url: chain.startUrl,
            headers: chain.requestHeaders,
            body: method === 'POST' ? '{}' : null,
            auth,
            notFound,
            cache: null,
            gate: null,
          };
          const ctx: RequestContext = { signal: new AbortController().signal, deadlineAtMs: FAR };
          const outcome = await runUntilSettled(client.execute(request, ctx), runtime);
          const calls = scripted.calls;

          // Requests per Attempt are bounded, and no retry happens on a refused redirect.
          expect(calls.length).toBeLessThanOrEqual(REDIRECT_MAX_HOPS + 1);

          // Every request stays on the origin of the first request.
          const firstOrigin = new URL(chain.startUrl).origin;
          for (const call of calls) expect(new URL(call.url).origin).toBe(firstOrigin);

          // Authorization: never the request-supplied value, never off-origin, and only the real token on github auth.
          const suppliedValues = Object.entries(chain.requestHeaders)
            .filter(([name]) => name.toLowerCase() === 'authorization')
            .map(([, value]) => value);
          for (const call of calls) {
            const sent = call.headers['authorization'];
            if (new URL(call.url).origin !== firstOrigin) expect(sent).toBeUndefined();
            for (const value of suppliedValues) expect(sent).not.toBe(value);
            expect(sent).toBe(auth === 'github' ? `Bearer ${P73_TOKEN}` : undefined);
            expect(call.redirect).toBe('manual');
          }

          // Outcome and request count.
          const followable = method === 'GET' ? expectedFollowableHops(chain) : 0;
          const endsInRedirect = followable < chain.hops.length;
          expect(calls.length).toBe(followable + 1);
          if (endsInRedirect) {
            expect(outcome.kind).toBe('failed');
            if (outcome.kind === 'failed') expect(outcome.reason).toBe('http-error');
            expect(attemptsOf(outcome)).toBe(1);
          } else {
            expect(outcome.kind).toBe('ok');
            expect(attemptsOf(outcome)).toBe(1);
          }
        },
      ),
      cfg(),
    );
  });
});
