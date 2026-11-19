// Requirements 19.30
// Property 70: the store rule decides, from Source_Statuses, Scan_Notes and cratesio unit outcomes,
// whether a Scan_Result is stored and for how long. The oracle below restates the rule from the
// requirement text (R19.5, R19.7, R19.22, R19.30) and does not reuse the implementation.
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PARTIAL_SCAN_TTL_SECONDS, SCAN_CACHE_TTL_SECONDS } from '../../../pipeline/constants';
import type { ReasonCategory, SourceName } from '../../../pipeline/ports';
import { storeDecision } from '../../../pipeline/scan/scan-cache';
import type { LedgerEntry, ScanNote, SourceStatus } from '../../../pipeline/scan/types';
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
const STATUSES: readonly SourceStatus[] = ['ok', 'partial', 'failed'];
type Statuses = { readonly [S in SourceName]: SourceStatus };

const arbStatus = fc.constantFrom(...STATUSES);
// Biased towards `ok` so that the all-ok and single-cratesio-partial shapes occur often.
const arbBiasedStatus = fc.oneof(
  { weight: 6, arbitrary: fc.constant<SourceStatus>('ok') },
  { weight: 1, arbitrary: arbStatus },
);
const arbStatuses: fc.Arbitrary<Statuses> = fc
  .tuple(arbBiasedStatus, arbBiasedStatus, arbBiasedStatus, arbBiasedStatus, arbBiasedStatus, arbBiasedStatus)
  .map(([github, depsdev, osv, npm, cratesio, pypi]) => ({
    github,
    depsdev,
    osv,
    npm,
    cratesio,
    pypi,
  }));
/** Statuses where only cratesio may differ from ok (the R19.22 shape), cratesio mostly partial. */
const arbCratesioOnly: fc.Arbitrary<Statuses> = fc
  .constantFrom<SourceStatus>('ok', 'partial', 'partial', 'partial', 'failed')
  .map((cratesio) => ({
    github: 'ok',
    depsdev: 'ok',
    osv: 'ok',
    npm: 'ok',
    cratesio,
    pypi: 'ok',
  }));

const arbNotes: fc.Arbitrary<readonly ScanNote[]> = fc.array(
  fc
    .constantFrom('github-token-missing', 'no-manifests', 'unmaintained-advisory', 'source-partial')
    .map((code): ScanNote => ({ code, message: 'm' })),
  { maxLength: 4 },
);
const arbNoTokenNotes = arbNotes.map((notes) => notes.filter((n) => n.code !== 'github-token-missing'));

const arbName = fc.constantFrom('a', 'b', 'serde', 'tokio');
const arbOutcome = fc.oneof(
  fc.constant({ ok: true } as const),
  fc.record({ ok: fc.constant(false as const), reason: fc.constantFrom(...REASONS) }),
  // Weight deadline failures so the R19.22 shape (all failures are deadline owners units) is common.
  fc.constant({ ok: false, reason: 'deadline' } as const),
  fc.constant({ ok: false, reason: 'deadline' } as const),
);
const arbUnitKey = fc.oneof(
  { weight: 3, arbitrary: arbName.map((n) => `owners:${n}`) },
  { weight: 1, arbitrary: arbName.map((n) => `crate:${n}`) },
  { weight: 1, arbitrary: arbName.map((n) => `versions:${n}`) },
);
const arbEntry: fc.Arbitrary<LedgerEntry> = fc.record({
  source: fc.oneof(
    { weight: 5, arbitrary: fc.constant<SourceName>('cratesio') },
    { weight: 1, arbitrary: fc.constantFrom(...SOURCES) },
  ),
  unitKey: arbUnitKey,
  outcome: arbOutcome,
});
const arbEntries = fc.array(arbEntry, { maxLength: 6 });

type Expected = number | null;

/** Independent oracle: the TTL in seconds when stored, null when nothing is stored. */
function oracle(statuses: Statuses, notes: readonly ScanNote[], units: readonly LedgerEntry[]): Expected {
  if (notes.some((n) => n.code === 'github-token-missing')) return null;
  const nonOk = SOURCES.filter((s) => statuses[s] !== 'ok');
  if (nonOk.length === 0) return SCAN_CACHE_TTL_SECONDS;
  const onlyCratesioPartial = nonOk.length === 1 && nonOk[0] === 'cratesio' && statuses.cratesio === 'partial';
  if (!onlyCratesioPartial) return null;
  const allDeadlineOwners = units
    .filter((u) => u.source === 'cratesio' && !u.outcome.ok)
    .every((u) => u.unitKey.startsWith('owners:') && !u.outcome.ok && u.outcome.reason === 'deadline');
  return allDeadlineOwners ? PARTIAL_SCAN_TTL_SECONDS : null;
}

function actual(statuses: Statuses, notes: readonly ScanNote[], units: readonly LedgerEntry[]): Expected {
  const decision = storeDecision(statuses, notes, units);
  return decision.store ? decision.ttlSeconds : null;
}

describe('Property 70: A Scan_Result is stored if and only if the store rule holds', () => {
  it('constants differ, so a wrong lifetime is detectable', () => {
    expect(PARTIAL_SCAN_TTL_SECONDS).not.toBe(SCAN_CACHE_TTL_SECONDS);
  });

  it('stores with the matching lifetime if and only if the rule holds (arbitrary inputs)', () => {
    fc.assert(
      fc.property(arbStatuses, arbNotes, arbEntries, (statuses, notes, units) => {
        expect(actual(statuses, notes, units)).toBe(oracle(statuses, notes, units));
      }),
      cfg(),
    );
  });

  it('stores with the matching lifetime if and only if the rule holds (cratesio-only shape)', () => {
    fc.assert(
      fc.property(arbCratesioOnly, arbNoTokenNotes, arbEntries, (statuses, notes, units) => {
        expect(actual(statuses, notes, units)).toBe(oracle(statuses, notes, units));
      }),
      cfg(),
    );
  });

  it('never stores when a github-token-missing note exists, whatever the statuses', () => {
    fc.assert(
      fc.property(
        fc.oneof(arbStatuses, arbCratesioOnly),
        arbNotes,
        arbEntries,
        (statuses, notes, units) => {
          const withToken = [...notes, { code: 'github-token-missing', message: 'm' } as ScanNote];
          expect(storeDecision(statuses, withToken, units)).toEqual({ store: false });
        },
      ),
      cfg(),
    );
  });

  it('ignores ledger entries of other sources', () => {
    fc.assert(
      fc.property(arbCratesioOnly, arbNoTokenNotes, arbEntries, (statuses, notes, units) => {
        const cratesioOnly = units.filter((u) => u.source === 'cratesio');
        expect(actual(statuses, notes, units)).toBe(actual(statuses, notes, cratesioOnly));
      }),
      cfg(),
    );
  });
});
