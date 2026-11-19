import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { mapCratesOwners, mapDepsDevAdvisory, mapOsvAdvisory, severityOf } from '../../pipeline/mapping';
import {
  compactCratesOwners,
  compactDepsDevAdvisory,
  compactOsvAdvisory,
} from '../../pipeline/ports/l2-entries';
import { arbAdvisoryId } from '../support/arbitraries/advisories';
import { applyMutation, arbMutation } from '../support/arbitraries/mutate';
import { cfg } from '../support/fc-config';

const CVSS = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H';

/** A value that is sometimes replaced by a wrong-typed one. */
const noisy = <T>(valid: fc.Arbitrary<T>): fc.Arbitrary<unknown> =>
  fc.oneof({ weight: 5, arbitrary: valid }, { weight: 1, arbitrary: fc.jsonValue() });

const arbNoise = fc.dictionary(fc.constantFrom('summary', 'details', 'modified', 'references', 'x-extra'), fc.jsonValue(), {
  maxKeys: 3,
});

const arbOsvValid: fc.Arbitrary<Record<string, unknown>> = fc
  .tuple(
    fc.record(
      {
        id: noisy(arbAdvisoryId),
        aliases: noisy(fc.array(noisy(arbAdvisoryId), { maxLength: 4 })),
        withdrawn: noisy(fc.constantFrom('2024-01-01T00:00:00Z', '')),
        database_specific: noisy(
          fc.record({ severity: noisy(fc.constantFrom('LOW', 'MODERATE', 'HIGH', 'CRITICAL', 'x')) }, { requiredKeys: [] }),
        ),
        affected: noisy(
          fc.array(
            noisy(
              fc.record(
                {
                  database_specific: noisy(
                    fc.record({ informational: noisy(fc.constantFrom('unmaintained', 'notice', 'unsound')) }, { requiredKeys: [] }),
                  ),
                },
                { requiredKeys: [] },
              ),
            ),
            { maxLength: 4 },
          ),
        ),
        severity: noisy(
          fc.array(
            noisy(
              fc.record(
                {
                  type: noisy(fc.constantFrom('CVSS_V3', 'CVSS_V4', 'CVSS_V2')),
                  score: noisy(fc.constantFrom(CVSS, 'bad', 'CVSS:3.1/AV:N')),
                },
                { requiredKeys: [] },
              ),
            ),
            { maxLength: 4 },
          ),
        ),
      },
      { requiredKeys: [] },
    ),
    arbNoise,
  )
  .map(([core, extra]) => ({ ...extra, ...core }));

const arbDepsDevValid: fc.Arbitrary<Record<string, unknown>> = fc
  .tuple(
    fc.record(
      {
        cvss3Score: noisy(fc.oneof(fc.double({ min: 0, max: 10, noNaN: true }), fc.constantFrom(0, 10, -0.1, 10.1, 1e308, -1))),
      },
      { requiredKeys: [] },
    ),
    arbNoise,
  )
  .map(([core, extra]) => ({ ...extra, ...core }));

const arbOwner: fc.Arbitrary<unknown> = noisy(
  fc.record(
    {
      kind: noisy(fc.constantFrom('user', 'user', 'team', 'robot')),
      login: noisy(fc.constantFrom('alice', 'bob', 'carol', '', 'github:org:team')),
      id: fc.nat(),
      name: fc.string({ maxLength: 8 }),
    },
    { requiredKeys: [] },
  ),
);

const arbCratesValid: fc.Arbitrary<Record<string, unknown>> = fc
  .tuple(
    fc.record(
      {
        users: noisy(
          fc.oneof(
            fc.array(arbOwner, { maxLength: 6 }),
            // Lists that hold only invalid entries.
            fc.array(fc.constantFrom<unknown>(null, 1, 'x', [], {}, { kind: 'robot' }, { kind: 'user', login: '' }, { kind: 'user', login: 5 }), {
              minLength: 1,
              maxLength: 4,
            }),
          ),
        ),
      },
      { requiredKeys: [] },
    ),
    arbNoise,
  )
  .map(([core, extra]) => ({ ...extra, ...core }));

/** Body text: valid-ish body, a mutated body, any JSON value, or text that is not JSON. */
const arbBodyText = (valid: fc.Arbitrary<Record<string, unknown>>): fc.Arbitrary<string> =>
  fc.oneof(
    { weight: 4, arbitrary: valid.map((b) => JSON.stringify(b)) },
    {
      weight: 4,
      arbitrary: valid
        .chain((b) => arbMutation(b).map((m) => applyMutation(b, m)))
        .map((b) => JSON.stringify(b) ?? 'null'),
    },
    { weight: 2, arbitrary: fc.jsonValue().map((v) => JSON.stringify(v)) },
    { weight: 1, arbitrary: fc.string({ maxLength: 12 }) },
  );

const arbScore: fc.Arbitrary<number | null> = fc.oneof(
  fc.constant(null),
  fc.double({ min: -1, max: 11, noNaN: true }),
  fc.constantFrom(0, 3.9, 4, 6.9, 7, 8.9, 9, 10),
);

const isJson = (text: string): boolean => {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
};

/**
 * What the OSV Mapper yields for a body text. The severity is read through the record
 * (`record.severity` is `severityOf(score, body)`); for a body without a usable id the
 * record is null and the severity is never read, so it is not a fact to compare there.
 */
function osvOutput(text: string, score: number | null): unknown {
  const body: unknown = JSON.parse(text);
  const record = mapOsvAdvisory(body, score);
  return { record, severity: record === null ? null : severityOf(score, body) };
}

describe('compact L2 entries properties', () => {
  // Feature: scan-pipeline, Property 71: A compact L2 entry gives the same facts as the full body
  // Validates: Requirements 19.31
  it('P71 OSV advisory: Mapper output is equal on compact and full text', () => {
    fc.assert(
      fc.property(arbBodyText(arbOsvValid), arbScore, (full, score) => {
        const compact = compactOsvAdvisory(full);
        if (!isJson(full)) {
          expect(compact).toBe(full);
          return;
        }
        expect(osvOutput(compact, score)).toEqual(osvOutput(full, score));
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 71: A compact L2 entry gives the same facts as the full body
  // Validates: Requirements 19.31
  it('P71 deps.dev advisory: Mapper output is equal on compact and full text', () => {
    fc.assert(
      fc.property(arbBodyText(arbDepsDevValid), (full) => {
        const compact = compactDepsDevAdvisory(full);
        if (!isJson(full)) {
          expect(compact).toBe(full);
          return;
        }
        expect(mapDepsDevAdvisory(JSON.parse(compact))).toEqual(mapDepsDevAdvisory(JSON.parse(full)));
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 71: A compact L2 entry gives the same facts as the full body
  // Validates: Requirements 19.31
  it('P71 crates.io owners: Mapper output is equal on compact and full text', () => {
    fc.assert(
      fc.property(arbBodyText(arbCratesValid), (full) => {
        const compact = compactCratesOwners(full);
        if (!isJson(full)) {
          expect(compact).toBe(full);
          return;
        }
        expect(mapCratesOwners(JSON.parse(compact))).toEqual(mapCratesOwners(JSON.parse(full)));
      }),
      cfg(),
    );
  });
});
