// Requirements 17.2, 17.3, 17.4, 17.5, 17.8, 17.13, 17.14
import { describe, expect, it } from 'vitest';
import type { ReasonCategory, SourceName } from '../../../pipeline/ports';
import { WorkLedger } from '../../../pipeline/scan/ledger';
import { makeSourceNote } from '../../../pipeline/scan/notes';
import {
  buildSourceNotes,
  collectSourceNoteData,
  computeSourceStatuses,
} from '../../../pipeline/scan/source-status';
import type { LedgerEntry } from '../../../pipeline/scan/types';

const OK = { ok: true } as const;
const fail = (reason: ReasonCategory) => ({ ok: false, reason }) as const;
const entry = (
  source: SourceName,
  unitKey: string,
  outcome: LedgerEntry['outcome'],
): LedgerEntry => ({ source, unitKey, outcome });

const ALL_REASONS: readonly ReasonCategory[] = [
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

describe('WorkLedger', () => {
  it('records entries in order and keeps the first outcome for a repeated key', () => {
    const ledger = new WorkLedger();
    expect(ledger.record('npm', 'a', OK)).toBe(true);
    expect(ledger.record('npm', 'a', fail('timeout'))).toBe(false);
    expect(ledger.record('pypi', 'a', fail('network'))).toBe(true);
    expect(ledger.entries).toEqual([entry('npm', 'a', OK), entry('pypi', 'a', fail('network'))]);
  });
});

describe('computeSourceStatuses', () => {
  it('R17.2: a source with no Applicable_Unit is ok, and so is one with only ok units', () => {
    const s = computeSourceStatuses([entry('npm', 'a', OK), entry('npm', 'b', OK)]);
    expect(s).toEqual({
      github: 'ok',
      depsdev: 'ok',
      osv: 'ok',
      npm: 'ok',
      cratesio: 'ok',
      pypi: 'ok',
    });
  });

  it('R17.3: every unit failed for a non-deadline reason gives failed', () => {
    const s = computeSourceStatuses([
      entry('npm', 'a', fail('timeout')),
      entry('npm', 'b', fail('http-error')),
      entry('pypi', 'a', fail('prerequisite')),
    ]);
    expect(s.npm).toBe('failed');
    expect(s.pypi).toBe('failed');
  });

  it('R17.4: a mix of ok and failed gives partial', () => {
    const s = computeSourceStatuses([entry('depsdev', 'a', OK), entry('depsdev', 'b', fail('network'))]);
    expect(s.depsdev).toBe('partial');
  });

  it('R17.4: deadline units make a source partial even when no unit is ok', () => {
    const only = computeSourceStatuses([entry('github', 'a', fail('deadline'))]);
    expect(only.github).toBe('partial');
    const mixed = computeSourceStatuses([
      entry('github', 'a', fail('http-error')),
      entry('github', 'b', fail('deadline')),
    ]);
    expect(mixed.github).toBe('partial');
  });

  it.each(['budget', 'token-missing', 'prerequisite', 'truncated'] as const)(
    'R17.5: %s units count as not ok (failed alone, partial beside an ok unit)',
    (reason) => {
      expect(computeSourceStatuses([entry('github', 'a', fail(reason))]).github).toBe('failed');
      expect(
        computeSourceStatuses([entry('github', 'a', fail(reason)), entry('github', 'b', OK)]).github,
      ).toBe('partial');
    },
  );

  it('R17.13: a truncated osv querybatch turns ok into partial and leaves other statuses alone', () => {
    expect(computeSourceStatuses([entry('osv', 'q', OK)], { osvTruncated: true }).osv).toBe('partial');
    expect(computeSourceStatuses([], { osvTruncated: true }).osv).toBe('partial');
    expect(
      computeSourceStatuses([entry('osv', 'q', fail('timeout'))], { osvTruncated: true }).osv,
    ).toBe('failed');
    expect(
      computeSourceStatuses([entry('osv', 'q', OK), entry('osv', 'd', fail('timeout'))], {
        osvTruncated: true,
      }).osv,
    ).toBe('partial');
    // Only osv is affected.
    expect(computeSourceStatuses([entry('npm', 'a', OK)], { osvTruncated: true }).npm).toBe('ok');
  });

  it('R17.14: unfetched advisory ids (truncated units) make osv non-ok', () => {
    const s = computeSourceStatuses([entry('osv', 'q', OK), entry('osv', 'adv:X', fail('truncated'))]);
    expect(s.osv).toBe('partial');
  });
});

describe('collectSourceNoteData and buildSourceNotes', () => {
  it('adds no note for ok sources', () => {
    expect(collectSourceNoteData([entry('npm', 'a', OK)])).toEqual([]);
    expect(buildSourceNotes([], makeSourceNote)).toEqual([]);
  });

  it('R17.9: one note per non-ok source, in fixed source order, with counts', () => {
    const entries = [
      entry('pypi', 'a', fail('network')),
      entry('npm', 'a', OK),
      entry('npm', 'b', fail('timeout')),
      entry('github', 'a', fail('deadline')),
    ];
    const notes = buildSourceNotes(entries, makeSourceNote);
    expect(notes.map((n) => [n.code, n.details?.source])).toEqual([
      ['source-partial', 'github'],
      ['source-partial', 'npm'],
      ['source-failed', 'pypi'],
    ]);
    expect(notes[1]?.details).toEqual({
      source: 'npm',
      reasons: ['timeout'],
      failedUnits: 1,
      applicableUnits: 2,
    });
  });

  it('lists nine reason categories distinct and in code point order', () => {
    const entries: LedgerEntry[] = [];
    ALL_REASONS.forEach((r, i) => {
      entries.push(entry('github', `u${i}`, fail(r)));
      entries.push(entry('github', `v${i}`, fail(r)));
    });
    const [note] = buildSourceNotes(entries, makeSourceNote);
    expect(note?.code).toBe('source-partial'); // deadline present
    expect(note?.details?.reasons).toEqual([
      'budget',
      'deadline',
      'http-error',
      'network',
      'prerequisite',
      'rate-limited',
      'timeout',
      'token-missing',
      'truncated',
    ]);
    expect(note?.details?.failedUnits).toBe(18);
    expect(note?.details?.applicableUnits).toBe(18);
  });

  it('R17.13: truncated osv ok source gets a partial note with reason truncated and 0 failed units', () => {
    const [note] = buildSourceNotes([entry('osv', 'q', OK)], makeSourceNote, { osvTruncated: true });
    expect(note?.code).toBe('source-partial');
    expect(note?.details).toEqual({
      source: 'osv',
      reasons: ['truncated'],
      failedUnits: 0,
      applicableUnits: 1,
    });
  });

  it('R17.13: truncated adds `truncated` to the reasons of a failed or partial osv source', () => {
    const failed = collectSourceNoteData([entry('osv', 'q', fail('timeout'))], { osvTruncated: true });
    expect(failed[0]).toMatchObject({ status: 'failed', reasons: ['timeout', 'truncated'] });
    const partial = collectSourceNoteData(
      [entry('osv', 'q', OK), entry('osv', 'd', fail('http-error'))],
      { osvTruncated: true },
    );
    expect(partial[0]).toMatchObject({ status: 'partial', reasons: ['http-error', 'truncated'] });
  });

  it('R17.14: an unfetched advisory id yields a note whose reasons contain truncated', () => {
    const [note] = buildSourceNotes(
      [entry('osv', 'q', OK), entry('osv', 'adv:X', fail('truncated'))],
      makeSourceNote,
    );
    expect(note?.details?.reasons).toContain('truncated');
  });
});
