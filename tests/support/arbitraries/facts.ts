// Fact arbitraries (design: Generator strategy: facts). Raw values are `unknown` on purpose: they model what can
// cross the trust boundary into normalizeFacts. Validity is decided by tests/support/oracles/facts-oracle.ts,
// never by the generator, so a generated "bad" value that happens to be valid is still judged correctly.
import * as fc from 'fast-check';
import type { HealthFactField, HealthFacts, RawHealthFacts, Severity } from '../../../core/model';
import { ABANDONMENT_DAYS, SEVERITIES, STALE_DAYS } from '../../../core/model';
import { FACT_FIELDS } from '../oracles/facts-oracle';

export const DAY_BOUNDARIES: readonly number[] = [
  0,
  1,
  STALE_DAYS - 1,
  STALE_DAYS,
  STALE_DAYS + 1,
  ABANDONMENT_DAYS - 1,
  ABANDONMENT_DAYS,
  ABANDONMENT_DAYS + 1,
  3650,
];

/** Valid day counts: finite numbers >= 0, weighted toward the threshold boundaries. */
export const arbValidDays: fc.Arbitrary<number> = fc.oneof(
  { weight: 5, arbitrary: fc.constantFrom(...DAY_BOUNDARIES) },
  { weight: 3, arbitrary: fc.integer({ min: 0, max: 5000 }) },
  { weight: 1, arbitrary: fc.double({ min: 0, max: 5000, noNaN: true }) }, // fractional days
  { weight: 1, arbitrary: fc.constantFrom(-0, Number.MAX_VALUE) }, // negative zero and a large value
);

/** Numbers that are never a Valid_Fact day count and (except 0.5, 1.5) never a valid count either. */
export const arbBadNumber: fc.Arbitrary<number> = fc.constantFrom(
  NaN,
  Infinity,
  -Infinity,
  -1,
  -0.5,
  -1e308,
  -Number.MAX_VALUE,
  0.5,
  1.5,
);

/** Numbers that are invalid as counts: the bad numbers above plus non-integer finite values. */
export const arbBadCount: fc.Arbitrary<number> = fc.oneof(
  arbBadNumber,
  fc.double({ noNaN: true, noDefaultInfinity: true }).filter((n) => !Number.isInteger(n)),
);

const wrongTypeParts = {
  string: fc.string(),
  array: fc.array(fc.anything(), { maxLength: 2 }),
  object: fc.object({ maxDepth: 1 }),
  special: fc.constantFrom<unknown>('LOW', '10', 'true', 'critical', undefined, Symbol('s'), BigInt(10), () => 1),
};

/** Values of a type no field accepts, apart from `boolean` (see arbWrongTypeNonBoolean). May include booleans. */
export const arbWrongType: fc.Arbitrary<unknown> = fc.oneof(
  wrongTypeParts.string,
  fc.boolean(),
  wrongTypeParts.array,
  wrongTypeParts.object,
  wrongTypeParts.special,
);

/** Wrong-type values that are certainly not booleans, for `archived` and `deprecated`. */
export const arbWrongTypeNonBoolean: fc.Arbitrary<unknown> = fc.oneof(
  wrongTypeParts.string,
  wrongTypeParts.array,
  wrongTypeParts.object,
  wrongTypeParts.special,
  fc.constantFrom<unknown>(0, 1, NaN),
);

const BOUNDARY_COUNTS = [0, 1, 2, 3, 6, 7, 100, Number.MAX_SAFE_INTEGER] as const;

/** Valid counts: finite integers >= 0 with weight on 0, 1, 2, 3, 6, 7, 100 and MAX_SAFE_INTEGER. */
export const arbValidCount: fc.Arbitrary<number> = fc.oneof(
  { weight: 5, arbitrary: fc.constantFrom(...BOUNDARY_COUNTS) },
  { weight: 3, arbitrary: fc.integer({ min: 0, max: 200 }) },
  { weight: 1, arbitrary: fc.constantFrom(-0, Number.MAX_VALUE) },
);

export const arbValidSeverity: fc.Arbitrary<Severity> = fc.constantFrom(...SEVERITIES);

const arbBadSeverityString = fc.constantFrom('critical', 'low', 'SEVERE', 'NONE', '', ' HIGH', 'MEDIUM ', 'Info');

/** Per-field arbitraries: valid values only. */
export const arbValidFactByField: { readonly [F in HealthFactField]: fc.Arbitrary<HealthFacts[F] & {}> } = {
  daysSinceLastRelease: arbValidDays,
  daysSinceLastCommit: arbValidDays,
  archived: fc.boolean(),
  deprecated: fc.boolean(),
  openVulnerabilityCount: arbValidCount,
  maxSeverity: arbValidSeverity,
  maintainerCount: arbValidCount,
};

/** Per-field raw arbitraries: mostly valid, plus null, bad numbers and wrong types. */
export const arbDaysFact: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 8, arbitrary: arbValidDays },
  { weight: 1, arbitrary: fc.constant(null) },
  { weight: 1, arbitrary: arbBadNumber },
  { weight: 1, arbitrary: arbWrongType },
);

export const arbCountFact: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 8, arbitrary: arbValidCount },
  { weight: 1, arbitrary: fc.constant(null) },
  { weight: 1, arbitrary: arbBadCount },
  { weight: 1, arbitrary: arbWrongType },
);

export const arbBoolFact: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 8, arbitrary: fc.boolean() },
  { weight: 1, arbitrary: fc.constant(null) },
  { weight: 1, arbitrary: arbWrongTypeNonBoolean },
);

export const arbSeverityFact: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 8, arbitrary: arbValidSeverity },
  { weight: 1, arbitrary: fc.constant(null) },
  { weight: 1, arbitrary: arbBadSeverityString },
  { weight: 1, arbitrary: arbWrongType },
);

export const arbRawFactByField: { readonly [F in HealthFactField]: fc.Arbitrary<unknown> } = {
  daysSinceLastRelease: arbDaysFact,
  daysSinceLastCommit: arbDaysFact,
  archived: arbBoolFact,
  deprecated: arbBoolFact,
  openVulnerabilityCount: arbCountFact,
  maxSeverity: arbSeverityFact,
  maintainerCount: arbCountFact,
};

/** Raw facts: each key may be missing, null, valid, out of range or of the wrong type. */
export const arbRawFacts: fc.Arbitrary<RawHealthFacts> = fc.record(arbRawFactByField, { requiredKeys: [] });

/** Objects whose getters throw for a non-empty subset of fields; other fields hold raw values. Exercises Property 12. */
export const arbThrowingGetters: fc.Arbitrary<Record<string, unknown>> = fc
  .tuple(arbRawFacts, fc.subarray([...FACT_FIELDS], { minLength: 1 }))
  .map(([raw, throwing]) => {
    const o: Record<string, unknown> = { ...raw };
    for (const field of throwing) {
      Object.defineProperty(o, field, {
        get() {
          throw new Error('x');
        },
        enumerable: true,
        configurable: true,
      });
    }
    return o;
  });

/** Anything that may be passed as facts: mostly records, plus arbitrary values, non-objects and throwing getters. */
export const arbAnyFactsInput: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 8, arbitrary: arbRawFacts },
  { weight: 1, arbitrary: fc.anything() },
  { weight: 1, arbitrary: fc.constantFrom<unknown>(null, undefined, 0, 'x', [], NaN, true, BigInt(10), Symbol('s'), () => 1) },
  { weight: 1, arbitrary: arbThrowingGetters },
);

const orNull = <T>(a: fc.Arbitrary<T>): fc.Arbitrary<T | null> =>
  fc.oneof({ weight: 6, arbitrary: a }, { weight: 1, arbitrary: fc.constant(null) });

/** Fully-present, well-typed HealthFacts: every key set, each either valid or null. Base for metamorphic steps. */
export const arbValidFacts: fc.Arbitrary<HealthFacts> = fc.record({
  daysSinceLastRelease: orNull(arbValidDays),
  daysSinceLastCommit: orNull(arbValidDays),
  archived: orNull(fc.boolean()),
  deprecated: orNull(fc.boolean()),
  openVulnerabilityCount: orNull(arbValidCount),
  maxSeverity: orNull(arbValidSeverity),
  maintainerCount: orNull(arbValidCount),
});
