import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { OSV_MAX_ADVISORY_DETAILS } from '../../../pipeline/constants';
import { mapOsvQueryBatch, planAdvisoryRequests } from '../../../pipeline/mapping/osv-batch';
import { arbLargeIdSet, arbQuerybatch } from '../../support/arbitraries/advisories';
import { cfg } from '../../support/fc-config';

// Independent code point order oracle.
function cmp(a: string, b: string): number {
  const x = Array.from(a, (c) => c.codePointAt(0) as number);
  const y = Array.from(b, (c) => c.codePointAt(0) as number);
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return x.length - y.length;
}

function checkPlan(ids: readonly string[], cap: number): void {
  const plan = planAdvisoryRequests(ids, cap);
  const distinct = new Set(ids);
  // at most cap, each id at most once
  expect(plan.requested.length).toBeLessThanOrEqual(cap);
  expect(new Set(plan.requested).size).toBe(plan.requested.length);
  expect(new Set(plan.unfetched).size).toBe(plan.unfetched.length);
  // ordered by code point
  for (let i = 1; i < plan.requested.length; i += 1) {
    expect(cmp(plan.requested[i - 1], plan.requested[i])).toBeLessThan(0);
  }
  // requested and unfetched partition the distinct ids; unfetched come after requested
  expect(new Set([...plan.requested, ...plan.unfetched])).toEqual(distinct);
  expect(plan.requested.length + plan.unfetched.length).toBe(distinct.size);
  expect(plan.requested.length).toBe(Math.min(cap, distinct.size));
  if (plan.requested.length > 0 && plan.unfetched.length > 0) {
    expect(cmp(plan.requested[plan.requested.length - 1], plan.unfetched[0])).toBeLessThan(0);
  }
  // the same set is planned for OSV and deps.dev, and does not depend on input order
  expect(planAdvisoryRequests(ids, cap)).toEqual(plan);
  expect(planAdvisoryRequests([...ids].reverse(), cap)).toEqual(plan);
}

describe('osv advisory request planning properties', () => {
  // Feature: scan-pipeline, Property 24: Advisory request sets are capped and distinct
  // Validates: Requirements 9.18, 9.23
  it('P24 sets planned from generated querybatch results are capped, distinct and ordered', () => {
    fc.assert(
      fc.property(arbQuerybatch, fc.integer({ min: 0, max: 30 }), ({ body, queryCount }, smallCap) => {
        const mapped = mapOsvQueryBatch(body, queryCount);
        expect(mapped.kind).toBe('ok');
        const ids: string[] = [];
        if (mapped.kind === 'ok') {
          for (const r of mapped.results) if (r.kind === 'ids') ids.push(...r.ids);
        }
        checkPlan(ids, OSV_MAX_ADVISORY_DETAILS);
        checkPlan(ids, smallCap);
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 24: Advisory request sets are capped and distinct
  // Validates: Requirements 9.18, 9.23
  it('P24 id sets larger than OSV_MAX_ADVISORY_DETAILS leave the rest unfetched', () => {
    fc.assert(
      fc.property(arbLargeIdSet, (ids) => {
        checkPlan(ids, OSV_MAX_ADVISORY_DETAILS);
        const distinct = new Set(ids).size;
        const plan = planAdvisoryRequests(ids, OSV_MAX_ADVISORY_DETAILS);
        expect(plan.unfetched.length).toBe(Math.max(0, distinct - OSV_MAX_ADVISORY_DETAILS));
      }),
      cfg({ numRuns: Math.min(Number(process.env.FC_NUM_RUNS ?? 100), 300) }),
    );
  });
});
