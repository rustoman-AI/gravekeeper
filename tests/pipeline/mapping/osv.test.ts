import { describe, expect, it } from 'vitest';
import { mapOsvQueryBatch, planAdvisoryRequests } from '../../../pipeline/mapping/osv-batch';
import { aggregateAdvisories, mapOsvAdvisory } from '../../../pipeline/mapping/osv-advisory';
import type { AdvisoryRecord } from '../../../pipeline/mapping/types';
import { osvBatchBody, osvResult } from '../../support/arbitraries/shapes/ef-5';
import { osvAdvisoryBody, RUSTSEC_2020_0036 } from '../../support/arbitraries/shapes/ef-6';

describe('mapOsvQueryBatch', () => {
  // Validates: Requirements 9.2, 9.3, 9.11, 9.17, 9.19
  it.each([
    ['null body', null, 0],
    ['missing results', {}, 0],
    ['non-array results', { results: {} }, 0],
    ['too few results', osvBatchBody([osvResult([])]), 2],
    ['too many results', osvBatchBody([osvResult([]), osvResult([])]), 1],
  ])('reports length-mismatch for %s', (_name, body, count) => {
    expect(mapOsvQueryBatch(body, count)).toEqual({ kind: 'length-mismatch' });
  });

  it('maps an empty results array for zero queries', () => {
    expect(mapOsvQueryBatch(osvBatchBody([]), 0)).toEqual({ kind: 'ok', results: [] });
  });

  it('treats an entry without vulns as no ids', () => {
    expect(mapOsvQueryBatch(osvBatchBody([{}]), 1)).toEqual({
      kind: 'ok',
      results: [{ kind: 'ids', ids: [], truncated: false }],
    });
  });

  it('keeps duplicate ids across queries positional and dedupes within one', () => {
    const body = osvBatchBody([osvResult(['B', 'A', 'B']), osvResult(['A'])]);
    expect(mapOsvQueryBatch(body, 2)).toEqual({
      kind: 'ok',
      results: [
        { kind: 'ids', ids: ['A', 'B'], truncated: false },
        { kind: 'ids', ids: ['A'], truncated: false },
      ],
    });
  });

  it('orders ids by code point', () => {
    const body = osvBatchBody([osvResult(['b', 'B', '\u{1F600}', '\uFF5E'])]);
    expect(mapOsvQueryBatch(body, 1)).toEqual({
      kind: 'ok',
      results: [{ kind: 'ids', ids: ['B', 'b', '\uFF5E', '\u{1F600}'], truncated: false }],
    });
  });

  it('sets truncated for a non-empty next_page_token only', () => {
    const body = osvBatchBody([
      osvResult(['A'], 'tok'),
      osvResult(['A'], ''),
      osvResult(['A'], 5),
      osvResult(['A']),
    ]);
    const mapped = mapOsvQueryBatch(body, 4);
    expect(mapped.kind === 'ok' && mapped.results.map((r) => r.kind === 'ids' && r.truncated)).toEqual([
      true,
      false,
      false,
      false,
    ]);
  });

  it.each([null, 'x', 3, [], undefined])('marks entry %j invalid', (entry) => {
    expect(mapOsvQueryBatch(osvBatchBody([entry]), 1)).toEqual({
      kind: 'ok',
      results: [{ kind: 'invalid' }],
    });
  });

  it.each([{ vulns: {} }, { vulns: 'A' }, { vulns: null }])('marks non-array vulns %j invalid', (entry) => {
    expect(mapOsvQueryBatch(osvBatchBody([entry]), 1)).toEqual({
      kind: 'ok',
      results: [{ kind: 'invalid' }],
    });
  });

  it('skips vulns without a non-empty string id', () => {
    const entry = { vulns: [null, {}, { id: '' }, { id: 4 }, { id: 'A' }] };
    expect(mapOsvQueryBatch(osvBatchBody([entry]), 1)).toEqual({
      kind: 'ok',
      results: [{ kind: 'ids', ids: ['A'], truncated: false }],
    });
  });

  it('does not throw on a throwing proxy body', () => {
    const body = new Proxy({}, {
      getOwnPropertyDescriptor() {
        throw new Error('boom');
      },
      has() {
        throw new Error('boom');
      },
    });
    expect(mapOsvQueryBatch(body, 1)).toEqual({ kind: 'length-mismatch' });
  });
});

describe('planAdvisoryRequests', () => {
  // Validates: Requirements 9.4, 9.20
  const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `ID-${String(i).padStart(3, '0')}`);

  it('requests everything when under the cap', () => {
    expect(planAdvisoryRequests(['B', 'A'], 3)).toEqual({ requested: ['A', 'B'], unfetched: [] });
  });

  it('requests exactly cap ids with none unfetched at cap', () => {
    expect(planAdvisoryRequests(ids(5), 5)).toEqual({ requested: ids(5), unfetched: [] });
  });

  it('leaves the last id unfetched at cap + 1', () => {
    expect(planAdvisoryRequests(ids(6).reverse(), 5)).toEqual({
      requested: ids(5),
      unfetched: ['ID-005'],
    });
  });

  it('dedupes before applying the cap', () => {
    expect(planAdvisoryRequests(['A', 'A', 'B', 'B'], 2)).toEqual({ requested: ['A', 'B'], unfetched: [] });
  });

  it('handles empty input and a zero cap', () => {
    expect(planAdvisoryRequests([], 5)).toEqual({ requested: [], unfetched: [] });
    expect(planAdvisoryRequests(['A'], 0)).toEqual({ requested: [], unfetched: ['A'] });
  });
});

describe('mapOsvAdvisory', () => {
  // Validates: Requirements 9.5, 9.6, 9.7, 9.8
  it('maps RUSTSEC-2020-0036 as informational and unmaintained', () => {
    expect(mapOsvAdvisory(RUSTSEC_2020_0036, null)).toEqual({
      id: 'RUSTSEC-2020-0036',
      aliases: ['GHSA-jq66-xh47-j9f3', 'RUSTSEC-2019-0036'],
      withdrawn: false,
      informational: true,
      unmaintained: true,
      severity: null,
    });
  });
  it('maps other informational values without unmaintained', () => {
    const record = mapOsvAdvisory(osvAdvisoryBody('A', { informational: 'unsound' }), null);
    expect(record).toMatchObject({ informational: true, unmaintained: false });
  });
  it('maps a withdrawn advisory', () => {
    expect(mapOsvAdvisory(osvAdvisoryBody('A', { withdrawn: '2024-02-02T00:00:00Z' }), null)?.withdrawn).toBe(true);
    expect(mapOsvAdvisory(osvAdvisoryBody('A', { withdrawn: '' }), null)?.withdrawn).toBe(false);
  });
  it('ignores non-string aliases and tolerates a missing array', () => {
    expect(mapOsvAdvisory(osvAdvisoryBody('A', { aliases: ['B', 3, null] }), null)?.aliases).toEqual(['B']);
    expect(mapOsvAdvisory(osvAdvisoryBody('A', { aliases: 'B' }), null)?.aliases).toEqual([]);
    expect(mapOsvAdvisory(osvAdvisoryBody('A'), null)?.aliases).toEqual([]);
  });
  it('derives severity from the score, then label, then CVSS', () => {
    expect(mapOsvAdvisory(osvAdvisoryBody('A', { databaseSeverity: 'LOW' }), 9.5)?.severity).toBe('CRITICAL');
    expect(mapOsvAdvisory(osvAdvisoryBody('A', { databaseSeverity: 'MODERATE' }), null)?.severity).toBe('MEDIUM');
    expect(mapOsvAdvisory(osvAdvisoryBody('A', { databaseSeverity: 'moderate' }), null)?.severity).toBeNull();
  });
  it.each([null, 'x', [], {}, { id: '' }, { id: 4 }])('returns null for body %j', (body) => {
    expect(mapOsvAdvisory(body, null)).toBeNull();
  });
});

describe('aggregateAdvisories', () => {
  // Validates: Requirements 9.9, 9.12, 9.13, 9.14
  const rec = (id: string, o: Partial<AdvisoryRecord> = {}): AdvisoryRecord => ({
    id,
    aliases: [],
    withdrawn: false,
    informational: false,
    unmaintained: false,
    severity: null,
    ...o,
  });
  it('returns zero facts for no input', () => {
    expect(aggregateAdvisories([], [])).toEqual({
      openVulnerabilityCount: 0,
      maxSeverity: null,
      informationalIds: [],
      unmaintainedIds: [],
    });
  });
  it('excludes withdrawn advisories', () => {
    expect(aggregateAdvisories([rec('A', { withdrawn: true, severity: 'CRITICAL' }), rec('B')], []))
      .toMatchObject({ openVulnerabilityCount: 1, maxSeverity: null });
  });
  it('excludes informational advisories from the count and lists them', () => {
    const facts = aggregateAdvisories([rec('B', { informational: true, unmaintained: true }), rec('A', { informational: true })], []);
    expect(facts).toEqual({
      openVulnerabilityCount: 0,
      maxSeverity: null,
      informationalIds: ['A', 'B'],
      unmaintainedIds: ['B'],
    });
  });
  it('gives a withdrawn informational advisory no informational id', () => {
    const facts = aggregateAdvisories([rec('A', { withdrawn: true, informational: true, unmaintained: true })], []);
    expect(facts.informationalIds).toEqual([]);
    expect(facts.unmaintainedIds).toEqual([]);
  });
  it('merges advisories sharing aliases, one-sided links and transitive chains', () => {
    expect(aggregateAdvisories([rec('A', { aliases: ['B'] }), rec('B')], []).openVulnerabilityCount).toBe(1);
    expect(aggregateAdvisories([rec('A'), rec('B', { aliases: ['A'] })], []).openVulnerabilityCount).toBe(1);
    expect(aggregateAdvisories([rec('A', { aliases: ['X'] }), rec('B', { aliases: ['X'] })], []).openVulnerabilityCount).toBe(1);
    const chain = [rec('A', { aliases: ['B'] }), rec('C', { aliases: ['D'] }), rec('B', { aliases: ['C'] })];
    expect(aggregateAdvisories(chain, []).openVulnerabilityCount).toBe(1);
    expect(aggregateAdvisories([...chain].reverse(), []).openVulnerabilityCount).toBe(1);
    expect(aggregateAdvisories([rec('A'), rec('B')], []).openVulnerabilityCount).toBe(2);
  });
  it('counts distinct unfetched ids and takes maxSeverity from fetched advisories only', () => {
    const facts = aggregateAdvisories([rec('A', { severity: 'LOW' }), rec('B', { severity: 'HIGH' })], ['U1', 'U2', 'U1']);
    expect(facts).toMatchObject({ openVulnerabilityCount: 4, maxSeverity: 'HIGH' });
    expect(aggregateAdvisories([], ['U1']).maxSeverity).toBeNull();
  });
  it('ignores severity of withdrawn and informational advisories', () => {
    const facts = aggregateAdvisories([rec('A', { withdrawn: true, severity: 'CRITICAL' }), rec('B', { informational: true, severity: 'HIGH' }), rec('C', { severity: 'LOW' })], []);
    expect(facts.maxSeverity).toBe('LOW');
  });
  it('aggregates the RUSTSEC-2020-0036 record as informational and unmaintained', () => {
    const record = mapOsvAdvisory(RUSTSEC_2020_0036, null) as AdvisoryRecord;
    expect(aggregateAdvisories([record], [])).toEqual({
      openVulnerabilityCount: 0,
      maxSeverity: null,
      informationalIds: ['RUSTSEC-2020-0036'],
      unmaintainedIds: ['RUSTSEC-2020-0036'],
    });
  });
});
