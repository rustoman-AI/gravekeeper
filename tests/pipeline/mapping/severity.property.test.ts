import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cvssSeverity, severityFromScore } from '../../../pipeline/mapping/cvss';
import { aggregateAdvisories, mapOsvAdvisory } from '../../../pipeline/mapping/osv-advisory';
import { severityOf } from '../../../pipeline/mapping/severity';
import { arbCvssVector } from '../../support/arbitraries/cvss';
import { cfg } from '../../support/fc-config';

const RANK: Readonly<Record<string, number>> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

/** Independent oracle of the `severity[]` rule: highest severity over CVSS_V3 entries with a string score. */
function oracleFromEntries(entries: readonly unknown[]): string | null {
  let best: string | null = null;
  for (const e of entries) {
    if (typeof e !== 'object' || e === null) continue;
    const rec = e as Record<string, unknown>;
    if (rec.type !== 'CVSS_V3' || typeof rec.score !== 'string') continue;
    const s = cvssSeverity(rec.score);
    if (s !== null && (best === null || RANK[s]! > RANK[best]!)) best = s;
  }
  return best;
}

const arbEntry: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 6, arbitrary: fc.record({ type: fc.constant('CVSS_V3'), score: arbCvssVector }) },
  { weight: 2, arbitrary: fc.record({ type: fc.constantFrom('CVSS_V3', 'CVSS_V4', 'CVSS_V2', 'x'), score: fc.oneof(arbCvssVector, fc.string()) }) },
  { weight: 1, arbitrary: fc.constantFrom<unknown>(null, 1, 'x', [], {}, { type: 'CVSS_V3' }, { type: 'CVSS_V3', score: 7 }, { score: 'x' }) },
);
const arbEntries = fc.array(arbEntry, { maxLength: 8 });

const ACCEPTED: readonly (readonly [string, string])[] = [
  ['LOW', 'LOW'],
  ['MODERATE', 'MEDIUM'],
  ['HIGH', 'HIGH'],
  ['CRITICAL', 'CRITICAL'],
];

/** Labels that are not accepted: other strings, case variants, non-strings. */
const arbRejectedLabel: fc.Arbitrary<unknown> = fc.oneof(
  fc.string().filter((s) => !['LOW', 'MODERATE', 'HIGH', 'CRITICAL'].includes(s)),
  fc.constantFrom<unknown>('low', 'Moderate', 'moderate', 'MEDIUM', 'medium', 'High', 'critical', '', ' HIGH', 'HIGH ', 'NONE'),
  fc.constantFrom<unknown>(null, undefined, 0, 1, true, [], {}, ['HIGH']),
);

describe('severity properties', () => {
  // Feature: scan-pipeline, Property 23: OSV-only severity rule
  // Validates: Requirements 9.15, 10.16
  it('P23 an accepted label decides without reading severity[]', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ACCEPTED), arbEntries, ([label, expected], entries) => {
        let reads = 0;
        const body: Record<string, unknown> = { database_specific: { severity: label } };
        Object.defineProperty(body, 'severity', {
          enumerable: true,
          get() {
            reads += 1;
            return entries;
          },
        });
        expect(severityOf(null, body)).toBe(expected);
        expect(reads).toBe(0);
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 23: OSV-only severity rule
  // Validates: Requirements 9.15, 10.16
  it('P23 any other label falls through to the severity[] rule', () => {
    fc.assert(
      fc.property(arbRejectedLabel, arbEntries, (label, entries) => {
        const body = { database_specific: { severity: label }, severity: entries };
        expect(severityOf(null, body)).toBe(oracleFromEntries(entries));
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 30: Severity does not depend on severity entry order
  // Validates: Requirements 10.13
  it('P30 permuting severity entries does not change the severity', () => {
    fc.assert(
      fc.property(
        arbEntries.chain((entries) => fc.tuple(fc.constant(entries), fc.shuffledSubarray(entries, { minLength: entries.length, maxLength: entries.length }))),
        ([entries, permuted]) => {
          expect(severityOf(null, { severity: permuted })).toBe(severityOf(null, { severity: entries }));
        },
      ),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 31: A valid Advisory_Score decides the severity
  // Validates: Requirements 10.15
  it('P31 a valid Advisory_Score decides regardless of OSV fields', () => {
    const arbScore = fc.oneof(
      fc.double({ min: 0, max: 10, noNaN: true }),
      fc.constantFrom(0, 0.1, 3.9, 4, 6.9, 7, 8.9, 9, 10),
    );
    const arbOsv = fc.record({
      database_specific: fc.record({ severity: fc.oneof(fc.constantFrom('LOW', 'MODERATE', 'HIGH', 'CRITICAL'), arbRejectedLabel) }, { requiredKeys: [] }),
      severity: arbEntries,
    }, { requiredKeys: [] });
    fc.assert(
      fc.property(arbScore, arbOsv, (score, osv) => {
        expect(severityOf(score, osv)).toBe(severityFromScore(score));
      }),
      cfg(),
    );
  });
});

describe('maximum severity properties', () => {
  const LABELS: Readonly<Record<string, string>> = { LOW: 'LOW', MODERATE: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' };

  /** Independent oracle of the R10.5 order: score, accepted label, severity[] entries, unknown. */
  function oracleSeverity(score: number | null, body: { database_specific?: { severity?: unknown }; severity: readonly unknown[] }): string | null {
    if (score !== null) return severityFromScore(score);
    const label = body.database_specific?.severity;
    if (typeof label === 'string' && Object.prototype.hasOwnProperty.call(LABELS, label)) return LABELS[label]!;
    return oracleFromEntries(body.severity);
  }

  const arbScore: fc.Arbitrary<number | null> = fc.oneof(
    { weight: 2, arbitrary: fc.constant(null) },
    { weight: 3, arbitrary: fc.double({ min: 0, max: 10, noNaN: true }) },
    { weight: 1, arbitrary: fc.constantFrom(0, 0.1, 3.9, 4, 6.9, 7, 8.9, 9, 10) },
  );
  const arbAdvisoryParts = fc.record({
    score: arbScore,
    database_specific: fc.record(
      { severity: fc.oneof(fc.constantFrom('LOW', 'MODERATE', 'HIGH', 'CRITICAL'), arbRejectedLabel) },
      { requiredKeys: [] },
    ),
    severity: arbEntries,
  });
  const arbAdvisorySet = fc.array(arbAdvisoryParts, { maxLength: 8 });

  // Feature: scan-pipeline, Property 32: Maximum severity over advisories
  // Validates: Requirements 10.17
  it('P32 maxSeverity is the highest per-advisory severity and ignores order', () => {
    fc.assert(
      fc.property(
        arbAdvisorySet.chain((set) => fc.tuple(fc.constant(set), fc.shuffledSubarray(set, { minLength: set.length, maxLength: set.length }))),
        ([set, permuted]) => {
          const toRecords = (list: typeof set) =>
            list.map((p, i) => {
              const { score, ...body } = p;
              const record = mapOsvAdvisory({ id: `ID-${String(i)}`, ...body }, score);
              expect(record).not.toBeNull();
              return record!;
            });
          let expected: string | null = null;
          for (const p of set) {
            const s = oracleSeverity(p.score, p);
            if (s !== null && (expected === null || RANK[s]! > RANK[expected]!)) expected = s;
          }
          expect(aggregateAdvisories(toRecords(set), []).maxSeverity).toBe(expected);
          // Permuted order must give the same result (ids are reassigned by position, which does not affect severity).
          expect(aggregateAdvisories(toRecords(permuted), []).maxSeverity).toBe(expected);
        },
      ),
      cfg(),
    );
  });
});
