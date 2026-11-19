import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { ReasonCategory, SourceName } from '../../../pipeline/ports';
import { WorkLedger } from '../../../pipeline/scan/ledger';
import { makeSourceNote } from '../../../pipeline/scan/notes';
import { buildSourceNotes, computeSourceStatuses } from '../../../pipeline/scan/source-status';
import type { SourceStatus, UnitOutcome } from '../../../pipeline/scan/types';
import { cfg } from '../../support/fc-config';

const SOURCES: readonly SourceName[] = ['github', 'depsdev', 'osv', 'npm', 'cratesio', 'pypi'];
const REASONS: readonly ReasonCategory[] = [
  'timeout',
  'network',
  'rate-limited',
  'http-error',
  'budget',
  'deadline',
  'token-missing',
  'prerequisite',
  'truncated',
];
const NON_DEADLINE = REASONS.filter((r) => r !== 'deadline');

interface Rec {
  readonly source: SourceName;
  readonly key: string;
  readonly outcome: UnitOutcome;
}

const source = fc.constantFrom(...SOURCES);
const outcome = (reasons: readonly ReasonCategory[]): fc.Arbitrary<UnitOutcome> =>
  fc.oneof(
    fc.constant<UnitOutcome>({ ok: true }),
    fc.constantFrom(...reasons).map<UnitOutcome>((reason) => ({ ok: false, reason })),
  );
/** Small key space so that repeated keys (ignored by the ledger) occur. */
const rec = (reasons: readonly ReasonCategory[] = REASONS): fc.Arbitrary<Rec> =>
  fc.record({
    source,
    key: fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f'),
    outcome: outcome(reasons),
  });
const recs = fc.array(rec(), { maxLength: 40 });

function ledgerOf(list: readonly Rec[]): WorkLedger {
  const ledger = new WorkLedger();
  for (const r of list) ledger.record(r.source, r.key, r.outcome);
  return ledger;
}

/** Independent oracle: the first outcome of each (source, key) stands. */
function effective(list: readonly Rec[]): Map<SourceName, UnitOutcome[]> {
  const seen = new Set<string>();
  const out = new Map<SourceName, UnitOutcome[]>(SOURCES.map((s) => [s, []]));
  for (const r of list) {
    const id = JSON.stringify([r.source, r.key]);
    if (seen.has(id)) continue;
    seen.add(id);
    out.get(r.source)!.push(r.outcome);
  }
  return out;
}

function oracleStatus(units: readonly UnitOutcome[], truncated: boolean): SourceStatus {
  const failed = units.filter((u) => !u.ok);
  const okCount = units.length - failed.length;
  const hasDeadline = failed.some((u) => !u.ok && u.reason === 'deadline');
  let status: SourceStatus;
  if (failed.length === 0) status = 'ok';
  else if (okCount > 0 || hasDeadline) status = 'partial';
  else status = 'failed';
  return status === 'ok' && truncated ? 'partial' : status;
}

function failedReasons(units: readonly UnitOutcome[]): Set<ReasonCategory> {
  const set = new Set<ReasonCategory>();
  for (const u of units) if (!u.ok) set.add(u.reason);
  return set;
}

function noteBySource(list: readonly Rec[], truncated: boolean) {
  const notes = buildSourceNotes(ledgerOf(list).entries, makeSourceNote, { osvTruncated: truncated });
  return notes.map((n) => {
    const d = n.details as {
      source: SourceName;
      reasons: string[];
      failedUnits: number;
      applicableUnits: number;
    };
    return { code: n.code, ...d };
  });
}

describe('source statuses', () => {
  // Feature: scan-pipeline, Property 52: Source status and source notes follow the unit outcomes
  // Validates: Requirements 17.12, 17.16
  it('P52: source status and source notes follow the unit outcomes', () => {
    fc.assert(
      fc.property(recs, fc.boolean(), (list, truncated) => {
        const eff = effective(list);
        const statuses = computeSourceStatuses(ledgerOf(list).entries, { osvTruncated: truncated });
        expect(Object.keys(statuses).sort()).toEqual([...SOURCES].sort());
        const notes = noteBySource(list, truncated);

        for (const s of SOURCES) {
          const units = eff.get(s)!;
          const expected = oracleStatus(units, s === 'osv' && truncated);
          expect(statuses[s]).toBe(expected);

          const hasDeadline = units.some((u) => !u.ok && u.reason === 'deadline');
          if (hasDeadline) expect(statuses[s]).toBe('partial');
          if (statuses[s] === 'failed') {
            expect(units.length).toBeGreaterThan(0);
            expect(units.every((u) => !u.ok && u.reason !== 'deadline')).toBe(true);
          }

          const mine = notes.filter((n) => n.source === s);
          if (expected === 'ok') {
            expect(mine).toHaveLength(0);
          } else {
            expect(mine).toHaveLength(1);
            const n = mine[0]!;
            expect(n.code).toBe(expected === 'failed' ? 'source-failed' : 'source-partial');
            expect(n.failedUnits).toBe(units.filter((u) => !u.ok).length);
            expect(n.applicableUnits).toBe(units.length);
            if (hasDeadline) expect(n.reasons).toContain('deadline');
          }
        }
        expect(notes.length).toBe(SOURCES.filter((s) => statuses[s] !== 'ok').length);
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 53: OSV truncation makes the source partial
  // Validates: Requirements 17.14
  it('P53: OSV truncation makes the source partial', () => {
    // Querybatch results are `ok` units (a next_page_token does not fail the unit);
    // advisory ids left unfetched are `truncated` units that did not end ok.
    const osvRecs = fc.array(
      fc.record({
        key: fc.constantFrom('q1', 'q2', 'q3', 'q4'),
        outcome: outcome(NON_DEADLINE.filter((r) => r !== 'truncated')),
      }),
      { maxLength: 8 },
    );
    fc.assert(
      fc.property(
        osvRecs,
        fc.boolean(),
        fc.nat({ max: 5 }),
        (queries, pageToken, unfetched) => {
          const list: Rec[] = queries.map((q) => ({ source: 'osv', ...q }));
          for (let i = 0; i < unfetched; i++) {
            list.push({ source: 'osv', key: `adv${i}`, outcome: { ok: false, reason: 'truncated' } });
          }
          const entries = ledgerOf(list).entries;
          const status = computeSourceStatuses(entries, { osvTruncated: pageToken }).osv;
          const note = noteBySource(list, pageToken).find((n) => n.source === 'osv');
          if (pageToken || unfetched > 0) {
            expect(['partial', 'failed']).toContain(status);
            expect(note).toBeDefined();
            expect(note!.reasons).toContain('truncated');
            expect(note!.code).toBe(status === 'failed' ? 'source-failed' : 'source-partial');
          }
          if (pageToken && unfetched === 0 && queries.every((_, i) => queries[i]!.outcome.ok)) {
            expect(status).toBe('partial');
            expect(note!.failedUnits).toBe(0);
          }
        },
      ),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 54: Reason categories are valid and distinct
  // Validates: Requirements 17.15
  it('P54: reason categories are valid and distinct', () => {
    fc.assert(
      fc.property(recs, fc.boolean(), (list, truncated) => {
        const eff = effective(list);
        for (const n of noteBySource(list, truncated)) {
          expect(n.code === 'source-failed' || n.code === 'source-partial').toBe(true);
          for (const r of n.reasons) expect(REASONS).toContain(r);
          expect(new Set(n.reasons).size).toBe(n.reasons.length);
          const sorted = [...n.reasons].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
          expect(n.reasons).toEqual(sorted);
          const expected = failedReasons(eff.get(n.source)!);
          if (n.source === 'osv' && truncated) expected.add('truncated');
          expect(new Set(n.reasons)).toEqual(expected);
        }
      }),
      cfg(),
    );
  });
});
