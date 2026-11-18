import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { OSV_MAX_ADVISORY_DETAILS } from '../../../pipeline/constants';
import { mapOsvQueryBatch, planAdvisoryRequests } from '../../../pipeline/mapping/osv-batch';
import { aggregateAdvisories } from '../../../pipeline/mapping/osv-advisory';
import type { AdvisoryRecord } from '../../../pipeline/mapping/types';
import {
  arbAdvisoryRecord,
  arbDisjointCounted,
  arbLargeIdSet,
  arbMappedRecords,
  arbQuerybatch,
  arbRecordsAndUnfetched,
} from '../../support/arbitraries/advisories';
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

const RANK = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 } as const;
const arbRecords = fc.oneof(fc.array(arbAdvisoryRecord, { maxLength: 12 }), arbMappedRecords);
const arbKeys = fc.array(fc.nat(), { minLength: 16, maxLength: 16 });

function permute<T>(items: readonly T[], keys: readonly number[], offset: number): T[] {
  return items
    .map((item, idx) => ({ item, key: keys[(idx + offset) % keys.length], idx }))
    .sort((a, b) => a.key - b.key || a.idx - b.idx)
    .map((x) => x.item);
}

describe('osv vulnerability count properties', () => {
  // Feature: scan-pipeline, Property 20: Vulnerability count bounds
  // Validates: Requirements 9.12
  it('P20 the count is between 0 and the number of advisories, and 0 when none is counted', () => {
    fc.assert(
      fc.property(arbRecords, (records) => {
        const facts = aggregateAdvisories(records, []);
        expect(Number.isInteger(facts.openVulnerabilityCount)).toBe(true);
        expect(facts.openVulnerabilityCount).toBeGreaterThanOrEqual(0);
        expect(facts.openVulnerabilityCount).toBeLessThanOrEqual(records.length);
        if (records.every((r) => r.withdrawn || r.informational)) {
          expect(facts.openVulnerabilityCount).toBe(0);
        }
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 21: Vulnerability facts do not depend on advisory order
  // Validates: Requirements 9.13
  it('P21 count and maxSeverity are equal for any permutation of advisories and aliases', () => {
    fc.assert(
      fc.property(arbRecords, arbKeys, (records, keys) => {
        const shuffled: AdvisoryRecord[] = permute(records, keys, 0).map((r, n) => ({
          ...r,
          aliases: permute(r.aliases, keys, n + 3),
        }));
        const a = aggregateAdvisories(records, []);
        const b = aggregateAdvisories(shuffled, []);
        expect(b.openVulnerabilityCount).toBe(a.openVulnerabilityCount);
        expect(b.maxSeverity).toBe(a.maxSeverity);
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 22: One alias link merges two vulnerabilities
  // Validates: Requirements 9.14
  it('P22 one mutual alias link lowers the count by exactly one', () => {
    fc.assert(
      fc.property(arbDisjointCounted, ({ records, i, j }) => {
        const before = aggregateAdvisories(records, []).openVulnerabilityCount;
        const linked = records.map((r, k) =>
          k === i ? { ...r, aliases: [...r.aliases, records[j].id] }
          : k === j ? { ...r, aliases: [...r.aliases, records[i].id] }
          : r,
        );
        const after = aggregateAdvisories(linked, []).openVulnerabilityCount;
        expect(after).toBe(before - 1);
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 25: Unfetched advisory ids are counted
  // Validates: Requirements 9.18
  it('P25 the count covers every unfetched id and maxSeverity uses fetched counted advisories only', () => {
    fc.assert(
      fc.property(arbRecordsAndUnfetched, ({ records, unfetched }) => {
        const facts = aggregateAdvisories(records, unfetched);
        expect(facts.openVulnerabilityCount).toBeGreaterThanOrEqual(new Set(unfetched).size);
        let expected: keyof typeof RANK | null = null;
        for (const r of records) {
          if (r.withdrawn || r.informational || r.severity === null) continue;
          if (expected === null || RANK[r.severity] > RANK[expected]) expected = r.severity;
        }
        expect(facts.maxSeverity).toBe(expected);
        expect(aggregateAdvisories(records, []).maxSeverity).toBe(expected);
      }),
      cfg(),
    );
  });
});