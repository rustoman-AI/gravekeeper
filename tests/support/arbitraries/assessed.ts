// Arbitraries for the Summarizer (design: Generator strategy: summarizer). A tiny alphabet of names, ecosystems and
// scopes makes Package_Key collisions, scope repetition and ties frequent. Classifications come from the real
// classify() and from synthetic but coherent values (flags agree with status) with boundary scores.
import * as fc from 'fast-check';
import type { AssessedDependency, Classification, Dependency, Ecosystem, Reason, RuleId, Scope, SourceKind, Status } from '../../../core/model';
import { SCOPE_ORDER } from '../../../core/model';
import { classify } from '../../../core/classifier';
import { arbValidFacts } from './facts';

export const SUMMARY_NAMES: readonly string[] = ['a', 'b', 'a-b', 'Z', '\u00e9'];
export const SUMMARY_ECOSYSTEMS: readonly Ecosystem[] = ['npm', 'pypi'];
export const SUMMARY_SCOPES: readonly Scope[] = ['runtime', 'dev', 'peer'];
export const SUMMARY_SCORES: readonly number[] = [0, 1, 19, 20, 39, 40, 59, 60, 79, 80, 100];

const RULE_IDS: readonly RuleId[] = ['6.3', '7.2', '8.1', '8.2', '8.3', '8.4', '10.6', '10.7', '10.8', '11.2'];
const MESSAGES: readonly string[] = ['m1', 'm2'];

const arbName = fc.constantFrom(...SUMMARY_NAMES);
const arbEcosystem = fc.constantFrom(...SUMMARY_ECOSYSTEMS);
const arbScope = fc.constantFrom(...SUMMARY_SCOPES);
const arbSourceKind: fc.Arbitrary<SourceKind> = fc.oneof(
  { weight: 70, arbitrary: fc.constant<SourceKind>('registry') },
  { weight: 15, arbitrary: fc.constant<SourceKind>('git') },
  { weight: 15, arbitrary: fc.constant<SourceKind>('path') },
);

const arbReasons: fc.Arbitrary<Reason[]> = fc
  .tuple(
    fc.uniqueArray(fc.constantFrom(...RULE_IDS), { minLength: 1, maxLength: 3 }),
    fc.constantFrom(...MESSAGES),
  )
  .map(([ids, message]) =>
    [...ids].sort().map((ruleId): Reason => ({ ruleId, message, facts: [] })),
  );

/** A Classification whose flags agree with its status; the score is unconstrained by the status. */
export const arbSyntheticClassification: fc.Arbitrary<Classification> = fc
  .tuple(fc.constantFrom<Status>('ALIVE', 'HAUNTED', 'DEAD'), fc.constantFrom(...SUMMARY_SCORES), fc.boolean(), arbReasons)
  .map(([status, score, dormant, reasons]) => ({
    status,
    score,
    reasons,
    vulnerable: status === 'HAUNTED',
    abandoned: status === 'DEAD',
    dormant: status === 'ALIVE' && dormant,
  }));

/** The output of the real classify() on valid facts. */
export const arbRealClassification: fc.Arbitrary<Classification> = arbValidFacts.map((facts) => classify(facts));

/** A Classification with every field but one Reason message equal to the base (ties on score, status, flags, ruleIds). */
const withOtherMessage = (c: Classification): Classification => ({
  ...c,
  reasons: c.reasons.map((r, i) => (i === 0 ? { ...r, message: `${r.message}-other` } : r)),
});

export const arbClassification: fc.Arbitrary<Classification> = fc.oneof(
  { weight: 1, arbitrary: arbRealClassification },
  { weight: 1, arbitrary: arbSyntheticClassification },
);

const arbNullableClassification: fc.Arbitrary<Classification | null> = fc.oneof(
  { weight: 15, arbitrary: fc.constant<Classification | null>(null) },
  { weight: 85, arbitrary: arbClassification },
);

export const makeDependency = (name: string, ecosystem: Ecosystem, sourceKind: SourceKind, scope: Scope): Dependency => ({
  name,
  rawName: name,
  ecosystem,
  versionSpec: '1.0',
  scope,
  sourceKind,
});

const entry = (d: Dependency, classification: Classification | null): AssessedDependency => ({ dependency: d, classification });

/** One Assessed_Dependency: tiny alphabets, 70 percent registry, 15 percent null classification. */
export const arbAssessedDependency: fc.Arbitrary<AssessedDependency> = fc
  .tuple(arbName, arbEcosystem, arbSourceKind, arbScope, arbNullableClassification)
  .map(([name, ecosystem, kind, scope, c]) => entry(makeDependency(name, ecosystem, kind, scope), c));

/** A list of up to 40 entries. */
export const arbAssessedList: fc.Arbitrary<AssessedDependency[]> = fc.array(arbAssessedDependency, { maxLength: 40 });

// ---------------------------------------------------------------------------
// Targeted lists
// ---------------------------------------------------------------------------

/**
 * Two entries of the same registry package whose Classifications tie on score, status, flags and ruleIds and differ
 * only in Reason text, mixed with other entries, in random order.
 */
export const arbTieList: fc.Arbitrary<AssessedDependency[]> = fc
  .tuple(arbName, arbEcosystem, arbScope, arbScope, arbSyntheticClassification, fc.array(arbAssessedDependency, { maxLength: 6 }))
  .chain(([name, eco, s1, s2, c, others]) =>
    arbPermutation([
      entry(makeDependency(name, eco, 'registry', s1), c),
      entry(makeDependency(name, eco, 'registry', s2), withOtherMessage(c)),
      ...others,
    ]),
  );

/** Lists in which every entry is a registry package with one of a few classifications, to force many ties and merges. */
export const arbMergeHeavyList: fc.Arbitrary<AssessedDependency[]> = fc.array(
  fc
    .tuple(fc.constantFrom('a', 'b'), arbScope, arbSyntheticClassification)
    .map(([name, scope, c]) => entry(makeDependency(name, 'npm', 'registry', scope), c)),
  { minLength: 1, maxLength: 40 },
);

/** Lists with more than `WORST_LIST_SIZE` distinct assessed registry packages, to exercise truncation. */
export const arbManyPackagesList: fc.Arbitrary<AssessedDependency[]> = fc.array(
  fc
    .tuple(fc.stringMatching(/^[a-z]{1,2}$/), arbEcosystem, arbScope, arbSyntheticClassification)
    .map(([name, eco, scope, c]) => entry(makeDependency(name, eco, 'registry', scope), c)),
  { minLength: 12, maxLength: 40 },
);

/** Lists with no assessed package: only git/path entries and registry entries with null classification. */
export const arbUnassessedOnlyList: fc.Arbitrary<AssessedDependency[]> = fc.array(
  fc
    .tuple(arbName, arbEcosystem, arbScope, arbSourceKind, arbClassificationOrNull())
    .map(([name, eco, scope, kind, c]) => entry(makeDependency(name, eco, kind, scope), kind === 'registry' ? null : c)),
  { maxLength: 15 },
);

function arbClassificationOrNull(): fc.Arbitrary<Classification | null> {
  return fc.oneof(fc.constant<Classification | null>(null), arbClassification);
}

// ---------------------------------------------------------------------------
// Permutation and scope repetition
// ---------------------------------------------------------------------------

/** `list` in a random order (same elements). */
export function arbPermutation<T>(list: readonly T[]): fc.Arbitrary<T[]> {
  return fc.shuffledSubarray([...list], { minLength: list.length, maxLength: list.length });
}

/** A copy of `e` in another scope with the same classification. */
export const withScope = (e: AssessedDependency, scope: Scope): AssessedDependency => entry({ ...e.dependency, scope }, e.classification);

/**
 * `list` followed by copies of some of its entries in other scopes (any of the five scopes, same classification),
 * in random order. For criterion 12.21: the summary is equal except that `scopes` gains scopes.
 */
export function arbScopeRepetition(list: readonly AssessedDependency[]): fc.Arbitrary<AssessedDependency[]> {
  if (list.length === 0) return fc.constant([]);
  return fc
    .array(fc.tuple(fc.nat({ max: list.length - 1 }), fc.constantFrom(...SCOPE_ORDER)), { maxLength: 40 })
    .chain((picks) => arbPermutation([...list, ...picks.map(([i, scope]) => withScope(list[i], scope))]));
}

// ---------------------------------------------------------------------------
// Append one entry (Property 46)
// ---------------------------------------------------------------------------

/** An extra entry for `list`: new package, new scope of an existing one, a duplicate, git/path, or null classification. */
export function arbExtraEntry(list: readonly AssessedDependency[]): fc.Arbitrary<AssessedDependency> {
  const cases: fc.Arbitrary<AssessedDependency>[] = [
    arbAssessedDependency,
    fc
      .tuple(arbName, arbEcosystem, arbScope, arbClassification)
      .map(([name, eco, scope, c]) => entry(makeDependency(name, eco, 'registry', scope), c)),
    fc
      .tuple(arbName, arbEcosystem, arbScope, fc.constantFrom<SourceKind>('git', 'path'), arbClassificationOrNull())
      .map(([name, eco, scope, kind, c]) => entry(makeDependency(name, eco, kind, scope), c)),
    fc
      .tuple(arbName, arbEcosystem, arbScope)
      .map(([name, eco, scope]) => entry(makeDependency(name, eco, 'registry', scope), null)),
  ];
  if (list.length > 0) {
    const index = fc.nat({ max: list.length - 1 });
    cases.push(
      index.map((i) => list[i]), // exact duplicate
      fc.tuple(index, fc.constantFrom(...SCOPE_ORDER)).map(([i, scope]) => withScope(list[i], scope)), // new scope
      fc.tuple(index, arbClassificationOrNull()).map(([i, c]) => entry(list[i].dependency, c)), // same package, other classification
    );
  }
  return fc.oneof(...cases);
}

export interface ListWithExtra {
  readonly list: AssessedDependency[];
  readonly extra: AssessedDependency;
  /** `list` followed by `extra`. */
  readonly extended: AssessedDependency[];
}

/** A list `L` and an entry `e` with `extended` equal to `L` plus `e`. */
export const arbListWithExtra: fc.Arbitrary<ListWithExtra> = arbAssessedList.chain((list) =>
  arbExtraEntry(list).map((extra) => ({ list, extra, extended: [...list, extra] })),
);
