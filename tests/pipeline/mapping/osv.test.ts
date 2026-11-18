import { describe, expect, it } from 'vitest';
import { mapOsvQueryBatch, planAdvisoryRequests } from '../../../pipeline/mapping/osv-batch';
import { osvBatchBody, osvResult } from '../../support/arbitraries/shapes/ef-5';

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
