// Requirements 9.4, 9.9, 9.18, 9.20, 9.23, 17.6
import { describe, expect, it } from 'vitest';
import { OSV_MAX_ADVISORY_DETAILS } from '../../../pipeline/constants';
import type { OsvQueryResult } from '../../../pipeline/mapping';
import type { RequestContext, SourceResult } from '../../../pipeline/ports';
import { WorkLedger } from '../../../pipeline/scan/ledger';
import { createUnitRunner } from '../../../pipeline/scan/run-unit';
import { advisoryUnitKeys, runAdvisoryStage } from '../../../pipeline/scan/stage-advisories';

const HEADERS = {} as never;
const ok = (body: unknown): SourceResult<never> =>
  ({ kind: 'ok', status: 200, body, headers: HEADERS, fromCache: false }) as never;
const absent: SourceResult<never> = { kind: 'absent', headers: HEADERS, fromCache: false };
// The OSV adapter reports a detail 404 as a failed http-error (R17.6).
const notFoundFailed: SourceResult<never> = {
  kind: 'failed',
  reason: 'http-error',
  status: 404,
  headers: null,
};

const ids = (...list: string[]): OsvQueryResult => ({ kind: 'ids', ids: list, truncated: false });

interface Responders {
  osv?: (id: string) => SourceResult<never>;
  depsdev?: (id: string) => SourceResult<never>;
}

function setup(responders: Responders = {}) {
  const calls = { osv: [] as string[], depsdev: [] as string[] };
  const sources = {
    osv: {
      getVulnerability: (id: string) => {
        calls.osv.push(id);
        return Promise.resolve((responders.osv ?? ((i) => ok({ id: i })))(id));
      },
    },
    depsdev: {
      getAdvisory: (id: string) => {
        calls.depsdev.push(id);
        return Promise.resolve(
          (responders.depsdev ?? (() => ok({ advisoryKey: { id }, cvss3Score: 5 })))(id),
        );
      },
    },
  } as never;
  const ledger = new WorkLedger();
  const controller = new AbortController();
  const runner = createUnitRunner(ledger, controller.signal);
  const ctx: RequestContext = { signal: controller.signal, deadlineAtMs: 0 };
  const run = (osv: Map<string, OsvQueryResult | 'unavailable'>, maxAdvisoryDetails?: number) =>
    runAdvisoryStage({ sources, runner, ctx, osv, maxAdvisoryDetails });
  const outcomeOf = (source: string, id: string) =>
    ledger.entries.find((e) => e.source === source && e.unitKey === advisoryUnitKeys.advisory(id))
      ?.outcome;
  return { calls, ledger, run, outcomeOf };
}

describe('runAdvisoryStage request sets (R9.4, R9.20)', () => {
  it('requests the same ids from OSV and deps.dev in ascending code point order', async () => {
    const { calls, run } = setup();
    await run(
      new Map([
        ['npm:a', ids('GHSA-c', 'GHSA-a')],
        ['npm:b', ids('GHSA-b', 'CVE-1')],
      ]),
    );
    const expected = ['CVE-1', 'GHSA-a', 'GHSA-b', 'GHSA-c'];
    expect([...calls.osv].sort()).toEqual(expected);
    expect([...calls.depsdev].sort()).toEqual(expected);
    // Starts are ordered: both sources receive the ids in the same ascending order.
    expect(calls.osv).toEqual(expected);
    expect(calls.depsdev).toEqual(expected);
  });

  it('requests an id shared by several targets once and gives each target its detail', async () => {
    const { calls, ledger, run } = setup();
    const result = await run(
      new Map([
        ['npm:a', ids('GHSA-x', 'GHSA-y')],
        ['npm:b', ids('GHSA-x')],
      ]),
    );
    expect(calls.osv).toEqual(['GHSA-x', 'GHSA-y']);
    expect(calls.depsdev).toEqual(['GHSA-x', 'GHSA-y']);
    expect(ledger.entries).toHaveLength(4);
    expect([...(result.osv.get('npm:a')?.advisories.keys() ?? [])].sort()).toEqual([
      'GHSA-x',
      'GHSA-y',
    ]);
    expect([...(result.osv.get('npm:b')?.advisories.keys() ?? [])]).toEqual(['GHSA-x']);
    expect(result.osv.get('npm:a')?.advisories.get('GHSA-x')).toEqual({
      osv: { state: 'ok', body: { id: 'GHSA-x' } },
      depsdev: { state: 'ok', body: { advisoryKey: { id: 'GHSA-x' }, cvss3Score: 5 } },
    });
  });
});

describe('runAdvisoryStage cap (R9.9, R9.20, R9.23)', () => {
  it('uses OSV_MAX_ADVISORY_DETAILS by default', async () => {
    const { calls, run } = setup();
    const all = Array.from({ length: OSV_MAX_ADVISORY_DETAILS + 2 }, (_, i) =>
      `GHSA-${String(i).padStart(5, '0')}`,
    );
    const result = await run(new Map([['npm:a', ids(...all)]]));
    expect(calls.osv).toHaveLength(OSV_MAX_ADVISORY_DETAILS);
    expect(calls.depsdev).toHaveLength(OSV_MAX_ADVISORY_DETAILS);
    expect(result.unfetchedIds).toEqual(all.slice(OSV_MAX_ADVISORY_DETAILS));
  });

  it('records each unfetched id as a truncated osv unit without a deps.dev request', async () => {
    const { calls, ledger, run, outcomeOf } = setup();
    const result = await run(
      new Map([
        ['npm:a', ids('GHSA-1', 'GHSA-3')],
        ['npm:b', ids('GHSA-2', 'GHSA-3')],
      ]),
      1,
    );
    expect(calls.osv).toEqual(['GHSA-1']);
    expect(calls.depsdev).toEqual(['GHSA-1']);
    expect(result.unfetchedIds).toEqual(['GHSA-2', 'GHSA-3']);
    for (const id of ['GHSA-2', 'GHSA-3']) {
      expect(outcomeOf('osv', id)).toEqual({ ok: false, reason: 'truncated' });
      expect(outcomeOf('depsdev', id)).toBeUndefined();
    }
    // GHSA-3 is shared by two targets and recorded once.
    expect(ledger.entries.filter((e) => e.unitKey === advisoryUnitKeys.advisory('GHSA-3'))).toHaveLength(1);
    expect(ledger.entries).toHaveLength(4);
  });

  it('hands each target its own unfetched ids, which feed advisory-details-incomplete', async () => {
    const { run } = setup();
    const result = await run(
      new Map([
        ['npm:a', ids('GHSA-1', 'GHSA-3')],
        ['npm:b', ids('GHSA-1')],
      ]),
      1,
    );
    const a = result.osv.get('npm:a');
    expect(a?.unfetchedIds).toEqual(['GHSA-3']);
    expect([...(a?.advisories.keys() ?? [])]).toEqual(['GHSA-1']);
    expect(result.osv.get('npm:b')?.unfetchedIds).toEqual([]);
  });
});

describe('runAdvisoryStage 404 handling (R17.6, R9.9)', () => {
  it('counts a deps.dev 404 as an ok unit with an absent detail', async () => {
    const { outcomeOf, run } = setup({ depsdev: () => absent });
    const result = await run(new Map([['npm:a', ids('GHSA-1')]]));
    expect(outcomeOf('depsdev', 'GHSA-1')).toEqual({ ok: true });
    expect(outcomeOf('osv', 'GHSA-1')).toEqual({ ok: true });
    expect(result.osv.get('npm:a')?.advisories.get('GHSA-1')?.depsdev).toEqual({ state: 'absent' });
  });

  it('counts an OSV 404 as a failed http-error unit and an unavailable detail', async () => {
    const { outcomeOf, run } = setup({ osv: () => notFoundFailed });
    const result = await run(new Map([['npm:a', ids('GHSA-1')]]));
    expect(outcomeOf('osv', 'GHSA-1')).toEqual({ ok: false, reason: 'http-error' });
    expect(outcomeOf('depsdev', 'GHSA-1')).toEqual({ ok: true });
    expect(result.osv.get('npm:a')?.advisories.get('GHSA-1')?.osv).toEqual({ state: 'unavailable' });
  });
});

describe('runAdvisoryStage targets without ids', () => {
  it('passes unavailable, invalid and empty results through and sends no request', async () => {
    const { calls, ledger, run } = setup();
    const invalid: OsvQueryResult = { kind: 'invalid' };
    const empty = ids();
    const result = await run(
      new Map<string, OsvQueryResult | 'unavailable'>([
        ['npm:a', 'unavailable'],
        ['npm:b', invalid],
        ['npm:c', empty],
      ]),
    );
    expect(calls.osv).toEqual([]);
    expect(calls.depsdev).toEqual([]);
    expect(ledger.entries).toEqual([]);
    expect(result.unfetchedIds).toEqual([]);
    expect(result.osv.get('npm:a')).toEqual({
      queryResult: 'unavailable',
      advisories: new Map(),
      unfetchedIds: [],
    });
    expect(result.osv.get('npm:b')?.queryResult).toBe(invalid);
    expect(result.osv.get('npm:c')?.queryResult).toBe(empty);
    expect(result.osv.size).toBe(3);
  });
});
