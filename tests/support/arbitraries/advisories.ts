import * as fc from 'fast-check';
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
