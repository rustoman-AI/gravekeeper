import * as fc from 'fast-check';
import { describe, it } from 'vitest';
import { createGithubSource } from '../../../adapters/github/github-source';
import { createHttpClient } from '../../../adapters/http/http-client';
import { GITHUB_BUDGET_THRESHOLD, SCAN_DEADLINE_MS } from '../../../pipeline/constants';
import type { GithubConfig, RequestContext, SourceName } from '../../../pipeline/ports/http';
import { GithubBudget } from '../../../pipeline/scan/github-budget';
import { runScan } from '../../../pipeline/scan/run-scan';
import type { ScanDeps } from '../../../pipeline/scan/types';
import { budgetHeaderSequence } from '../../support/arbitraries/scripts';
import type { BudgetHeaders } from '../../support/arbitraries/scripts';
import { createFakeRuntime, runUntilSettled } from '../../support/fake-runtime';
import { cfg } from '../../support/fc-config';
import { createScriptedFetch } from '../../support/scripted-fetch';
import type { ScriptedResponse, Step } from '../../support/scripted-fetch';

// Requirement 14.9, 14.10

const CONFIG: GithubConfig = {
  apiUrl: 'https://api.github.com',
  graphqlUrl: 'https://api.github.com/graphql',
  webHost: 'github.com',
};
const REF = { owner: 'octo', repo: 'repo' };
const SOURCES: readonly SourceName[] = ['github', 'depsdev', 'osv', 'npm', 'cratesio', 'pypi'];

/** What one scripted GitHub response says about the budget. */
interface BudgetStep {
  /** Raw `x-ratelimit-remaining` header, or undefined for a missing header. */
  readonly header: string | undefined;
  /** Raw `data.rateLimit.remaining` of the body: missing, empty, non-integer, negative, 0 or an integer. */
  readonly body: { readonly present: false } | { readonly present: true; readonly value: unknown };
  readonly status: number | 'network-error';
}

const headerValue: fc.Arbitrary<string | undefined> = fc.oneof(
  { weight: 2, arbitrary: fc.constant(undefined) },
  { weight: 2, arbitrary: fc.constantFrom('', 'abc', '3.5', '-1', '-0', '1e1', '+5', '0x10', 'NaN', '99999999999999999999') },
  { weight: 2, arbitrary: fc.constantFrom('0', '9', '10', '11') },
  { weight: 3, arbitrary: fc.integer({ min: 0, max: 20 }).map(String) },
  { weight: 2, arbitrary: fc.integer({ min: 0, max: 5000 }).map(String) },
  { weight: 1, arbitrary: fc.integer({ min: -50, max: -1 }).map(String) },
);

const bodyValue: fc.Arbitrary<BudgetStep['body']> = fc.oneof(
  { weight: 2, arbitrary: fc.constant({ present: false as const }) },
  {
    weight: 2,
    arbitrary: fc
      .constantFrom<unknown>('', null, '5', '0', 'abc', 3.5, -1, -0.5, 1e21, true, [], {})
      .map((value) => ({ present: true as const, value })),
  },
  {
    weight: 4,
    arbitrary: fc
      .oneof(fc.constantFrom(0, 9, 10, 11), fc.integer({ min: 0, max: 20 }), fc.integer({ min: 0, max: 5000 }))
      .map((value) => ({ present: true as const, value })),
  },
);

const statusValue: fc.Arbitrary<BudgetStep['status']> = fc.constantFrom(
  200, 200, 200, 200, 500, 503, 429, 403, 404, 'network-error' as const,
);

const budgetStep: fc.Arbitrary<BudgetStep> = fc.record({ header: headerValue, body: bodyValue, status: statusValue });

interface Scenario {
  readonly steps: readonly BudgetStep[];
  /** Valid header sets from the shared arbitrary, used when a step has `useSequence`. */
  readonly sequence: readonly BudgetHeaders[];
  readonly useSequence: readonly boolean[];
  /** One entry per Work_Unit: true is a GraphQL request, false a REST request. */
  readonly requests: readonly boolean[];
}

const scenario: fc.Arbitrary<Scenario> = fc.record({
  steps: fc.array(budgetStep, { minLength: 1, maxLength: 30 }),
  sequence: budgetHeaderSequence,
  useSequence: fc.array(fc.boolean(), { minLength: 30, maxLength: 30 }),
  requests: fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }),
});

/** Independent reading rules: an integer is a non-negative whole number. */
function integerOfHeader(value: string | undefined): number | null {
  if (value === undefined || !/^[0-9]+$/.test(value.trim())) return null;
  const n = Number(value.trim());
  return Number.isSafeInteger(n) ? n : null;
}
function integerOfBody(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

describe('GitHub budget properties', () => {
  // Feature: scan-pipeline, Property 40: GitHub budget threshold is never crossed
  // Validates: Requirements 14.9
  it('P40: no GitHub request is sent after the first response whose integer budget is below the threshold', async () => {
    await fc.assert(
      fc.asyncProperty(scenario, async (sc) => {
        const runtime = createFakeRuntime(1_000_000);
        const stepFor = (call: number): { step: BudgetStep; header: string | undefined } => {
          const index = Math.min(call, sc.steps.length - 1);
          const step = sc.steps[index] as BudgetStep;
          const seq = sc.useSequence[index] === true && sc.sequence.length > 0
            ? (sc.sequence[index % sc.sequence.length] as BudgetHeaders)
            : null;
          return { step, header: seq === null ? step.header : String(seq.remaining) };
        };

        let nextCall = 0;
        const scripted = createScriptedFetch((): Step => {
          const { step, header } = stepFor(nextCall);
          nextCall += 1;
          if (step.status === 'network-error') return { latencyMs: 0, response: 'network-error' };
          const headers: [string, string][] = [['content-type', 'application/json']];
          if (header !== undefined) headers.push(['x-ratelimit-remaining', header]);
          const rateLimit = step.body.present ? { remaining: step.body.value } : {};
          const response: ScriptedResponse = {
            status: step.status,
            headers,
            body: { kind: 'text', text: JSON.stringify({ data: { rateLimit } }) },
          };
          return { latencyMs: 0, response };
        }, runtime);

        const limiters = Object.fromEntries(
          SOURCES.map((name) => [name, { concurrency: 1, minIntervalMs: 0 }]),
        ) as Record<SourceName, { concurrency: number; minIntervalMs: number }>;
        const client = createHttpClient({
          fetchImpl: scripted.fetch,
          clock: runtime.clock,
          timer: runtime.timer,
          random: runtime.random,
          logger: { log: () => undefined },
          limiters,
          authorizer: () => null,
          secrets: () => [],
          userAgent: 'test',
        });
        const source = createGithubSource(client, CONFIG, false);
        const budget = new GithubBudget();
        const ctx: RequestContext = {
          signal: new AbortController().signal,
          deadlineAtMs: runtime.clock() + SCAN_DEADLINE_MS,
        };

        // Model of the budget: last integer seen, header before body.
        let modelRemaining: number | null = null;
        let lockedCallCount: number | null = null;

        for (const graphql of sc.requests) {
          const before = scripted.calls.length;
          const pending = graphql
            ? source.queryRepositories('query', {}, ctx, budget)
            : source.getRepository(REF, ctx, budget);
          const result = await runUntilSettled(pending, runtime);
          if (graphql && result.kind === 'ok') budget.observeGraphql(result.body);

          const after = scripted.calls.length;
          for (let call = before; call < after; call += 1) {
            const { step, header } = stepFor(call);
            if (step.status !== 'network-error') {
              const fromHeader = integerOfHeader(header);
              if (fromHeader !== null) modelRemaining = fromHeader;
              const lastOk = graphql && call === after - 1 && result.kind === 'ok';
              if (lastOk && step.body.present) {
                const fromBody = integerOfBody(step.body.value);
                if (fromBody !== null) modelRemaining = fromBody;
              }
            }
            if (lockedCallCount === null && modelRemaining !== null && modelRemaining < GITHUB_BUDGET_THRESHOLD) {
              lockedCallCount = call + 1;
            }
          }
          if (lockedCallCount !== null && after > lockedCallCount) {
            throw new Error(
              `request sent after the budget fell below ${GITHUB_BUDGET_THRESHOLD}: ${after} calls, expected at most ${lockedCallCount}`,
            );
          }
        }
        if (lockedCallCount !== null && scripted.calls.length !== lockedCallCount) {
          throw new Error(`calls ${scripted.calls.length} after lock at ${lockedCallCount}`);
        }
      }),
      cfg(),
    );
  });
});

// ---- P41: scan level ----
const TREE_BODY = { tree: [{ path: 'package.json', type: 'blob', size: 40 }], truncated: false };
const MANIFEST_TEXT = JSON.stringify({ dependencies: { 'left-pad': '1.0.0' } });
const SHA = 'a'.repeat(40);

/** A source whose every method reports an empty successful response. */
function emptyOkSource<T extends object>(): T {
  return new Proxy({} as T, {
    get: () => () =>
      Promise.resolve({ kind: 'ok', status: 200, body: {}, headers: {}, fromCache: false }),
  });
}

describe('GitHub budget scan properties', () => {
  // Feature: scan-pipeline, Property 41: Budget sequences give a result or a typed error
  // Validates: Requirements 14.10
  it('P41: any budget header sequence gives a Scan_Result or upstream-unavailable for github, and a Scan_Result when no value is below the threshold', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(headerValue, { minLength: 6, maxLength: 6 }),
        async (headerSeq) => {
          const runtime = createFakeRuntime(1_000_000);
          let gatedCalls = 0;
          const scripted = createScriptedFetch((url): Step => {
            if (url.startsWith('https://raw.githubusercontent.com/')) {
              return {
                latencyMs: 0,
                response: { status: 200, body: { kind: 'text', text: MANIFEST_TEXT } },
              };
            }
            const header = headerSeq[Math.min(gatedCalls, headerSeq.length - 1)];
            gatedCalls += 1;
            const headers: [string, string][] = [['content-type', 'application/json']];
            if (header !== undefined) headers.push(['x-ratelimit-remaining', header]);
            let body: unknown = { data: { rateLimit: {} } };
            if (url.includes('/git/trees/')) body = TREE_BODY;
            else if (url.includes('/branches/')) body = { commit: { sha: SHA } };
            else if (url.endsWith('/repos/octo/repo')) {
              body = { full_name: 'octo/repo', default_branch: 'main', private: false };
            }
            return {
              latencyMs: 0,
              response: { status: 200, headers, body: { kind: 'text', text: JSON.stringify(body) } },
            };
          }, runtime);

          const limiters = Object.fromEntries(
            SOURCES.map((name) => [name, { concurrency: 1, minIntervalMs: 0 }]),
          ) as Record<SourceName, { concurrency: number; minIntervalMs: number }>;
          const client = createHttpClient({
            fetchImpl: scripted.fetch,
            clock: runtime.clock,
            timer: runtime.timer,
            random: runtime.random,
            logger: { log: () => undefined },
            limiters,
            authorizer: () => null,
            secrets: () => [],
            userAgent: 'test',
          });
          const deps: ScanDeps = {
            sources: {
              github: createGithubSource(client, CONFIG, false),
              depsdev: emptyOkSource(),
              osv: emptyOkSource(),
              npm: emptyOkSource(),
              cratesio: emptyOkSource(),
              pypi: emptyOkSource(),
            },
            clock: runtime.clock,
            timer: runtime.timer,
            random: runtime.random,
            logger: { log: () => undefined },
            scanCache: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
            config: CONFIG,
            limits: { maxManifests: 10, maxDependencies: 300, maxAdvisoryDetails: 500 },
          };
          const outcome = await runUntilSettled(
            runScan(
              {
                repo: { host: CONFIG.webHost, owner: 'octo', repo: 'repo', branch: null },
                manifests: [],
                asOf: '2024-01-01T00:00:00Z',
                startedAtMs: runtime.clock(),
              },
              deps,
            ),
            runtime,
          );

          // Budget values the first three requests would report, in order.
          const seen = headerSeq.slice(0, 3).map(integerOfHeader);
          const anyLow = seen.some((n) => n !== null && n < GITHUB_BUDGET_THRESHOLD);

          if (outcome.ok) return;
          const error = outcome.error as { code: string; details?: { source?: string } };
          if (anyLow && error.code === 'upstream-unavailable' && error.details?.source === 'github') return;
          throw new Error(
            `${anyLow ? 'untyped' : 'unexpected'} error for headers ${JSON.stringify(headerSeq.slice(0, 3))}: ${JSON.stringify(outcome.error)}`,
          );
        },
      ),
      cfg(),
    );
  });
});
