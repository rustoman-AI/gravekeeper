import * as fc from 'fast-check';
import type { Severity } from '../../../core';
import { mapOsvAdvisory } from '../../../pipeline/mapping/osv-advisory';
import type { AdvisoryRecord } from '../../../pipeline/mapping/types';
import { osvBatchBody, osvResult } from './shapes/ef-5';

// Requirement 9: generators for OSV querybatch results and OSV advisory bodies.

/** Advisory ids of mixed shapes, including astral characters and near-duplicates. */
export const arbAdvisoryId: fc.Arbitrary<string> = fc.oneof(
  fc.stringMatching(/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/),
  fc.stringMatching(/^CVE-20[0-2][0-9]-[0-9]{4,6}$/),
  fc.stringMatching(/^RUSTSEC-20[0-2][0-9]-[0-9]{4}$/),
  fc.string({ minLength: 1, maxLength: 8 }),
  fc.constantFrom('a', 'A', '\u{1F600}', '\uFFFF', 'GHSA-x', 'ghsa-x'),
);

/** One querybatch result entry: ids (duplicates allowed) and an optional page token. */
const arbResultEntry: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 8, arbitrary: fc.tuple(fc.array(arbAdvisoryId, { maxLength: 12 }), fc.option(fc.string({ minLength: 1 }), { nil: undefined }))
      .map(([ids, token]) => osvResult(ids, token)) },
  { weight: 1, arbitrary: fc.constantFrom<unknown>(null, 1, 'x', [], {}, { vulns: 3 }, { vulns: [null, {}, { id: 4 }] }) },
);

/** A querybatch body whose result count matches the returned `queryCount`. */
export const arbQuerybatch: fc.Arbitrary<{ body: unknown; queryCount: number }> = fc
  .array(arbResultEntry, { maxLength: 20 })
  .map((results) => ({ body: osvBatchBody(results), queryCount: results.length }));

/** A large pool of distinct ids so that the advisory cap is crossed. */
export const arbLargeIdSet: fc.Arbitrary<string[]> = fc
  .tuple(fc.integer({ min: 0, max: 1200 }), fc.integer({ min: 0, max: 2 }))
  .chain(([n, dupFactor]) =>
    fc.shuffledSubarray(Array.from({ length: 1300 }, (_, i) => `ID-${String(i * 7919 + 1)}`), {
      minLength: n,
      maxLength: n,
    }).map((ids) => {
      const out = [...ids];
      for (let k = 0; k < dupFactor; k += 1) out.push(...ids.slice(0, Math.floor(ids.length / 2)));
      return out;
    }),
  );

/** OSV advisory body (EF-6) with aliases, `withdrawn`, informational and severity forms. */
export const arbAdvisoryBody: fc.Arbitrary<Record<string, unknown>> = fc.record(
  {
    id: arbAdvisoryId,
    aliases: fc.array(arbAdvisoryId, { maxLength: 4 }),
    withdrawn: fc.constantFrom('2024-01-01T00:00:00Z', undefined),
    affected: fc.array(
      fc.record(
        {
          database_specific: fc.record(
            {
              informational: fc.constantFrom('unmaintained', 'unsound', 'notice'),
              severity: fc.constantFrom('LOW', 'MODERATE', 'HIGH', 'CRITICAL', 'moderate', 'x'),
            },
            { requiredKeys: [] },
          ),
        },
        { requiredKeys: [] },
      ),
      { maxLength: 3 },
    ),
    severity: fc.array(
      fc.record({
        type: fc.constantFrom('CVSS_V3', 'CVSS_V4'),
        score: fc.constantFrom('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', 'bad'),
      }),
      { maxLength: 3 },
    ),
  },
  { requiredKeys: ['id'] },
);

/** Ids drawn from a small pool so that records share ids and aliases often. */
const arbPoolId: fc.Arbitrary<string> = fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', '\u{1F600}');

/** A mapped advisory record whose ids and aliases collide often. */
export const arbAdvisoryRecord: fc.Arbitrary<AdvisoryRecord> = fc.record({
  id: arbPoolId,
  aliases: fc.array(arbPoolId, { maxLength: 4 }),
  withdrawn: fc.boolean(),
  informational: fc.boolean(),
  unmaintained: fc.boolean(),
  severity: fc.constantFrom<Severity | null>(null, 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
  details: fc.constant(null),
  summary: fc.constant(null),
});

/** Records from advisory bodies (EF-6) mapped through `mapOsvAdvisory`. */
export const arbMappedRecords: fc.Arbitrary<AdvisoryRecord[]> = fc
  .array(fc.tuple(arbAdvisoryBody, fc.option(fc.double({ min: 0, max: 10, noNaN: true }), { nil: null })), { maxLength: 8 })
  .map((pairs) => {
    const out: AdvisoryRecord[] = [];
    for (const [body, score] of pairs) {
      const rec = mapOsvAdvisory(body, score);
      if (rec !== null) out.push(rec);
    }
    return out;
  });

/** Records from either source plus a list of unfetched ids. */
export const arbRecordsAndUnfetched: fc.Arbitrary<{ records: AdvisoryRecord[]; unfetched: string[] }> = fc.record({
  records: fc.oneof(fc.array(arbAdvisoryRecord, { maxLength: 10 }), arbMappedRecords),
  unfetched: fc.array(fc.oneof(arbPoolId, arbAdvisoryId), { maxLength: 8 }),
});

/**
 * Counted advisories with pairwise distinct ids and no shared aliases. All ids and
 * aliases are distinct strings, so no record's alias equals any id or other alias.
 * Returns at least two records.
 */
export const arbDisjointCounted: fc.Arbitrary<{ records: AdvisoryRecord[]; i: number; j: number }> = fc
  .tuple(
    fc.integer({ min: 2, max: 8 }),
    fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 8, maxLength: 8 }),
    fc.array(fc.constantFrom<Severity | null>(null, 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'), { minLength: 8, maxLength: 8 }),
  )
  .chain(([n, aliasCounts, sevs]) => {
    const records: AdvisoryRecord[] = [];
    for (let k = 0; k < n; k += 1) {
      records.push({
        id: `ID-${k}`,
        aliases: Array.from({ length: aliasCounts[k] }, (_, a) => `AL-${k}-${a}`),
        withdrawn: false,
        informational: false,
        unmaintained: k % 2 === 0,
        severity: sevs[k],
        details: null,
        summary: null,
      });
    }
    return fc
      .tuple(fc.integer({ min: 0, max: n - 1 }), fc.integer({ min: 1, max: n - 1 }))
      .map(([i, d]) => ({ records, i, j: (i + d) % n }));
  });
