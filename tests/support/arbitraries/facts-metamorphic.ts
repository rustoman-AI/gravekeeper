// Metamorphic fact arbitraries: a base raw facts value plus one controlled edit (design: Generator strategy: facts).
// Each arbitrary builds the edit directly, so no `fc.pre` is needed. Later score and classify properties extend this file.
import * as fc from 'fast-check';
import type { RawHealthFacts, Severity } from '../../../core/model';
import { ABANDONMENT_DAYS, COMMIT_ABANDONMENT_DAYS, DEFAULT_SEVERITY, SEVERITIES, STALE_DAYS } from '../../../core/model';
import { oracleAbandoned, oracleReleaseAbandoned } from '../oracles/facts-oracle';
import { arbBadNumber, arbDaysFact, arbRawFactByField, arbRawFacts, arbValidCount, arbValidDays, arbValidSeverity, arbWrongTypeNonBoolean } from './facts';

export interface FactsPair {
  readonly before: RawHealthFacts;
  readonly after: RawHealthFacts;
}

/** Raw facts whose `openVulnerabilityCount` is a Valid_Fact, and the same facts with that count increased by 1. */
export const arbVulnIncrement: fc.Arbitrary<FactsPair> = fc
  .tuple(arbRawFacts, arbValidCount)
  .map(([base, count]) => ({
    before: { ...base, openVulnerabilityCount: count },
    after: { ...base, openVulnerabilityCount: count + 1 },
  }));

export interface SeverityRaise extends FactsPair {
  readonly from: Severity;
  readonly to: Severity;
}

/** Index pairs `i < j` into SEVERITIES, built without rejection: `i` first, then `j` from the indices above it. */
export const arbSeverityIndexPair: fc.Arbitrary<readonly [number, number]> = fc
  .integer({ min: 0, max: SEVERITIES.length - 2 })
  .chain((i) => fc.integer({ min: i + 1, max: SEVERITIES.length - 1 }).map((j) => [i, j] as const));

/** Raw facts whose `maxSeverity` is a known severity, and the same facts with a strictly higher known severity. */
export const arbSeverityRaise: fc.Arbitrary<SeverityRaise> = fc
  .tuple(arbRawFacts, arbSeverityIndexPair)
  .map(([base, [i, j]]) => ({
    before: { ...base, maxSeverity: SEVERITIES[i] },
    after: { ...base, maxSeverity: SEVERITIES[j] },
    from: SEVERITIES[i],
    to: SEVERITIES[j],
  }));


export interface ReleasePair extends FactsPair {
  readonly d1: number;
  readonly d2: number;
}

/** Ordered valid day pairs `d1 <= d2`; 40 percent straddle STALE_DAYS or ABANDONMENT_DAYS, built without rejection. */
const arbDayPair: fc.Arbitrary<readonly [number, number]> = fc.oneof(
  {
    weight: 4,
    arbitrary: fc
      .tuple(
        fc.constantFrom(STALE_DAYS, ABANDONMENT_DAYS, COMMIT_ABANDONMENT_DAYS),
        fc.constantFrom(0, 1, 2, 30, 400),
        fc.constantFrom(0, 1, 2, 30, 400),
      )
      .map(([t, below, above]) => [t - 1 - below, t + above] as const)
      .map(([a, b]) => [Math.max(0, a), b] as const),
  },
  {
    weight: 6,
    arbitrary: fc.tuple(arbValidDays, arbValidDays).map(([a, b]) => (a <= b ? ([a, b] as const) : ([b, a] as const))),
  },
);

/** Commit age biased to STALE_DAYS - 1, STALE_DAYS and null (the dormant and abandoned boundaries), else any day fact. */
const arbCommitBiased: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 2, arbitrary: fc.constant(STALE_DAYS - 1) },
  { weight: 2, arbitrary: fc.constant(STALE_DAYS) },
  { weight: 2, arbitrary: fc.constantFrom(364, 365, 729, 730, 731) },
  { weight: 2, arbitrary: fc.constant(null) },
  { weight: 3, arbitrary: arbDaysFact },
);

/** Same facts with `daysSinceLastRelease` set to valid `d1 <= d2`. */
export const arbReleasePair: fc.Arbitrary<ReleasePair> = fc
  .tuple(arbRawFacts, arbCommitBiased, arbDayPair)
  .map(([base, commit, [d1, d2]]) => {
    const shared = { ...base, daysSinceLastCommit: commit };
    return { before: { ...shared, daysSinceLastRelease: d1 }, after: { ...shared, daysSinceLastRelease: d2 }, d1, d2 };
  });

export interface FlagRaise extends FactsPair {
  readonly flag: 'archived' | 'deprecated';
}

/** Facts whose `archived` or `deprecated` is false, and the same facts with that flag true. */
export const arbFlagRaise: fc.Arbitrary<FlagRaise> = fc
  .tuple(arbRawFacts, fc.constantFrom<'archived' | 'deprecated'>('archived', 'deprecated'))
  .map(([base, flag]) => ({
    before: { ...base, [flag]: false },
    after: { ...base, [flag]: true },
    flag,
  }));

const arbAbandonmentFields = fc.record({
  daysSinceLastRelease: fc.oneof({ weight: 3, arbitrary: arbDaysFact }, { weight: 2, arbitrary: fc.constantFrom(ABANDONMENT_DAYS - 1, ABANDONMENT_DAYS) }),
  daysSinceLastCommit: arbCommitBiased,
  archived: fc.oneof({ weight: 3, arbitrary: fc.boolean() }, { weight: 1, arbitrary: fc.constant(null) }),
  deprecated: fc.oneof({ weight: 3, arbitrary: fc.boolean() }, { weight: 1, arbitrary: fc.constant(null) }),
});

/**
 * Two facts differing only in archived, deprecated and the two day fields, where the oracle says `before` is not
 * abandoned and `after` is. Filtered by the oracle (see Property 27); the filter rate is reported by the test run.
 */
export const arbAbandonmentRaise: fc.Arbitrary<FactsPair> = fc
  .tuple(arbRawFacts, arbAbandonmentFields, arbAbandonmentFields)
  .map(([base, a, b]) => ({ before: { ...base, ...a }, after: { ...base, ...b } }))
  .filter(({ before, after }) => !oracleAbandoned(before) && oracleAbandoned(after));

export { arbValidSeverity };

export interface MaintainerChange extends FactsPair {
  readonly from: unknown;
  readonly to: unknown;
}

/** One maintainerCount value: 0, 1, many, null, missing (undefined), or any raw fact (includes invalid values). */
const arbMaintainerValue: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 2, arbitrary: fc.constantFrom(0, 1, 2, 1000, null, undefined) },
  { weight: 3, arbitrary: arbRawFactByField.maintainerCount },
);

const withMaintainers = (base: RawHealthFacts, value: unknown): RawHealthFacts => {
  const { maintainerCount: _ignored, ...rest } = base as Record<string, unknown>;
  void _ignored;
  return (value === undefined ? rest : { ...rest, maintainerCount: value }) as RawHealthFacts;
};

/** The same facts with two different maintainerCount values (0, 1, many, unknown, missing or invalid). */
export const arbMaintainerChange: fc.Arbitrary<MaintainerChange> = fc
  .tuple(arbRawFacts, arbMaintainerValue, arbMaintainerValue)
  .map(([base, from, to]) => ({ before: withMaintainers(base, from), after: withMaintainers(base, to), from, to }));


// ---- Task 7.21 generators (Properties 24, 28, 29) ----

/** Drops keys whose value is `undefined`, so "missing" is a real missing key. */
const stripUndefined = (o: Record<string, unknown>): RawHealthFacts =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as RawHealthFacts;

const arbUnknownSeverity: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom<unknown>(null, undefined, 'critical', 'low', '', 'Medium', 'MEDIUM ', 5, true, {}, []),
  // Never a severity name: strings get a prefix, other types are not strings.
  fc.string().map((s) => `~${s}`),
  fc.oneof(fc.integer(), fc.boolean(), fc.array(fc.string(), { maxLength: 2 }), fc.object({ maxDepth: 1 }), fc.constantFrom<unknown>(Symbol('s'), BigInt(10), () => 1)),
);

const arbUnknownCount: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom<unknown>(null, undefined, '3', -1, 1.5, NaN),
  arbBadNumber,
);

const arbUnknownDays: fc.Arbitrary<unknown> = fc.constantFrom<unknown>(null, undefined, 'x', NaN, Infinity, -Infinity, -1, -0.5);
const arbUnknownBool: fc.Arbitrary<unknown> = fc.oneof(fc.constantFrom<unknown>(null, undefined), arbWrongTypeNonBoolean);

export interface UnknownSeverityPair {
  readonly unknown: RawHealthFacts;
  readonly known: RawHealthFacts;
}

/** Facts with an Unknown_Fact maxSeverity (count 0, unknown or >= 1), and the same facts with maxSeverity MEDIUM. */
export const arbUnknownSeverityPair: fc.Arbitrary<UnknownSeverityPair> = fc
  .tuple(
    arbRawFacts,
    arbUnknownSeverity,
    fc.oneof(
      { weight: 1, arbitrary: fc.constant<unknown>(0) },
      { weight: 1, arbitrary: arbUnknownCount },
      { weight: 3, arbitrary: fc.integer({ min: 1, max: 100 }) },
    ),
  )
  .map(([base, severity, count]) => {
    const unknown = stripUndefined({ ...base, maxSeverity: severity, openVulnerabilityCount: count });
    return { unknown, known: { ...unknown, maxSeverity: DEFAULT_SEVERITY } as RawHealthFacts };
  });

/** Same facts with no open vulnerability (`openVulnerabilityCount = 0`). */
export const removeVulnerability = (f: RawHealthFacts): RawHealthFacts => ({ ...f, openVulnerabilityCount: 0 });

/** Same facts with abandonment removed: archived and deprecated false, commit age 0 when 8.3 holds (changed by scan-accuracy: 0 is below COMMIT_ABANDONMENT_DAYS). */
export const removeAbandonment = (f: RawHealthFacts): RawHealthFacts => ({
  ...f,
  archived: false,
  deprecated: false,
  ...(oracleReleaseAbandoned(f) ? { daysSinceLastCommit: 0 } : {}),
});

const arbAnyAges = fc.record({
  daysSinceLastRelease: fc.oneof(arbDaysFact, arbValidDays),
  daysSinceLastCommit: fc.oneof(arbDaysFact, arbValidDays),
});
/** Dormant-eligible ages: release >= ABANDONMENT_DAYS and commit < COMMIT_ABANDONMENT_DAYS. */
const arbDormantAges = fc.record({
  daysSinceLastRelease: fc.constantFrom(ABANDONMENT_DAYS, ABANDONMENT_DAYS + 1, 3650, 5000),
  daysSinceLastCommit: fc.constantFrom(0, 1, STALE_DAYS - 1, COMMIT_ABANDONMENT_DAYS - 1),
});
/** Ages satisfying criterion 8.3: release >= ABANDONMENT_DAYS and commit unknown or >= COMMIT_ABANDONMENT_DAYS. */
const arbRelease83Ages = (unknownCommit: boolean) =>
  fc.record({
    daysSinceLastRelease: fc.oneof(fc.constantFrom(ABANDONMENT_DAYS, ABANDONMENT_DAYS + 1, 3650), fc.integer({ min: ABANDONMENT_DAYS, max: 5000 })),
    daysSinceLastCommit: unknownCommit
      ? arbUnknownDays
      : fc.oneof(fc.constantFrom(COMMIT_ABANDONMENT_DAYS, COMMIT_ABANDONMENT_DAYS + 1, 3650), fc.integer({ min: COMMIT_ABANDONMENT_DAYS, max: 5000 })),
  });
const arbNotAbandonedFlag: fc.Arbitrary<unknown> = fc.oneof(fc.constant(false), arbUnknownBool);

const arbAbandonmentRoute = fc.oneof(
  // archived only, deprecated only, both: with any ages, including dormant-eligible ones
  ...(['archived', 'deprecated', 'both'] as const).flatMap((route) =>
    [arbAnyAges, arbDormantAges].map((ages) =>
      fc.tuple(ages, arbNotAbandonedFlag, arbNotAbandonedFlag).map(([a, x, y]) => ({
        ...a,
        archived: route === 'deprecated' ? x : true,
        deprecated: route === 'archived' ? y : true,
      })),
    ),
  ),
  // 8.3 with stale commit and 8.3 with unknown commit, flags false or unknown
  ...[false, true].map((unknownCommit) =>
    fc.tuple(arbRelease83Ages(unknownCommit), arbNotAbandonedFlag, arbNotAbandonedFlag).map(([a, x, y]) => ({ ...a, archived: x, deprecated: y })),
  ),
  // 8.3 together with archived and/or deprecated
  fc
    .tuple(arbRelease83Ages(false), fc.constantFrom([true, true], [true, false], [false, true]))
    .map(([a, [x, y]]) => ({ ...a, archived: x, deprecated: y })),
);

/** Facts with vulnerable true and abandoned true, covering every abandonment route. Built by construction, no filter. */
export const arbHauntedAndAbandoned: fc.Arbitrary<RawHealthFacts> = fc
  .tuple(
    arbRawFacts,
    fc.integer({ min: 1, max: 100 }),
    fc.oneof(arbValidSeverity, arbUnknownSeverity),
    arbAbandonmentRoute,
  )
  .map(([base, count, severity, route]) =>
    stripUndefined({ ...base, ...route, openVulnerabilityCount: count, maxSeverity: severity }),
  );

/** Facts where none of criteria 7.1 and 8.1 to 8.3 applies. Built by construction, no filter. */
export const arbNoRisk: fc.Arbitrary<RawHealthFacts> = fc
  .tuple(
    arbRawFacts,
    fc.oneof(fc.constant<unknown>(0), arbUnknownCount),
    arbNotAbandonedFlag,
    arbNotAbandonedFlag,
    fc.oneof(
      // release unknown or below ABANDONMENT_DAYS, any commit age
      fc.record({
        daysSinceLastRelease: fc.oneof(arbUnknownDays, fc.integer({ min: 0, max: ABANDONMENT_DAYS - 1 }), fc.constantFrom(0, STALE_DAYS, ABANDONMENT_DAYS - 1)),
        daysSinceLastCommit: fc.oneof(arbDaysFact, arbValidDays),
      }),
      // dormant: old release but a fresh commit
      arbDormantAges,
    ),
  )
  .map(([base, count, archived, deprecated, ages]) =>
    stripUndefined({ ...base, ...ages, openVulnerabilityCount: count, archived, deprecated }),
  );



