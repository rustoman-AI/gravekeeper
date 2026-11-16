// Properties for summarize (design: Correctness Properties 32 to 35).
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { summarize } from '../../../core';
import { GRADE_C_MAX, SCOPE_ORDER, WORST_LIST_SIZE } from '../../../core/model';
import {
  arbAssessedList,
  arbListWithExtra,
  arbManyPackagesList,
  arbMergeHeavyList,
  arbPermutation,
  arbScopeRepetition,
  arbTieList,
  arbUnassessedOnlyList,
} from '../../support/arbitraries/assessed';
import { cfg } from '../../support/fc-config';
import {
  GRADE_ORDER,
  oracleGrade,
  oracleCanonicalJson,
  oracleCompareCodePoints,
  oracleGradeIsBetter,
  oracleSummarize,
  oracleUniquePackages,
} from '../../support/oracles/summary-oracle';

const arbAnyList = fc.oneof(arbAssessedList, arbMergeHeavyList, arbManyPackagesList, arbUnassessedOnlyList);

describe('summarize properties', () => {
  // Feature: dependency-graveyard-core, Property 32: Counts and unassessed partition the Unique_Packages
  // **Validates: Requirements 12.8, 12.1, 12.2, 12.3**
  it('Property 32: counts and unassessed partition the unique packages', () => {
    fc.assert(
      fc.property(arbAnyList, (list) => {
        const s = summarize(list);
        const keys = new Set(list.map((e) => JSON.stringify([e.dependency.ecosystem, e.dependency.name, e.dependency.sourceKind])));
        expect(s.total).toBe(oracleUniquePackages(list).length);
        expect(s.total).toBe(keys.size);
        expect(s.counts.ALIVE + s.counts.HAUNTED + s.counts.DEAD).toBe(s.assessed);
        expect(s.assessed + s.unassessed).toBe(s.total);
        expect(s.unassessed).toBe(s.unassessedItems.length);
        for (const n of [s.counts.ALIVE, s.counts.HAUNTED, s.counts.DEAD]) {
          expect(Number.isInteger(n)).toBe(true);
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThanOrEqual(s.assessed);
        }
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 33: Average and maximum are bounded
  // **Validates: Requirements 12.9, 12.4**
  it('Property 33: average and maximum are bounded by the merged scores', () => {
    fc.assert(
      fc.property(arbAnyList, (list) => {
        const s = summarize(list);
        const scores = oracleUniquePackages(list)
          .filter((p) => p.sourceKind === 'registry' && p.classification !== null)
          .map((p) => (p.classification as { score: number }).score);
        expect(s.assessed).toBe(scores.length);
        if (scores.length === 0) {
          expect(s.averageScore).toBeNull();
          expect(s.maxScore).toBeNull();
          return;
        }
        const min = Math.min(...scores);
        const max = Math.max(...scores);
        const sum = scores.reduce((a, b) => a + b, 0);
        expect(Number.isInteger(s.averageScore)).toBe(true);
        expect(Number.isInteger(s.maxScore)).toBe(true);
        expect(s.maxScore).toBe(max);
        expect(s.averageScore as number).toBeGreaterThanOrEqual(min);
        expect(s.averageScore as number).toBeLessThanOrEqual(max);
        expect(s.averageScore as number).toBeGreaterThanOrEqual(0);
        expect(s.maxScore as number).toBeLessThanOrEqual(100);
        expect(s.averageScore).toBe(Math.floor((2 * sum + scores.length) / (2 * scores.length)));
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 34: Confluence under input permutation
  // **Validates: Requirements 12.10, 12.17**
  it('Property 34: summarize is invariant under input permutation', () => {
    const arbListAndPermutation = fc.oneof(arbAnyList, arbTieList).chain((list) => fc.tuple(fc.constant(list), arbPermutation(list)));
    fc.assert(
      fc.property(arbListAndPermutation, ([list, permuted]) => {
        expect(summarize(permuted)).toEqual(summarize(list));
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 35: Summarizer determinism
  // **Validates: Requirements 12.11, 12.17**
  it('Property 35: summarize is deterministic and equals the oracle', () => {
    fc.assert(
      fc.property(fc.oneof(arbAnyList, arbTieList), (list) => {
        const first = summarize(list);
        expect(summarize(list)).toEqual(first);
        expect(first).toEqual(oracleSummarize(list));
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 36: Worst list is bounded and ordered
  // **Validates: Requirements 12.12, 12.6, 12.7**
  it('Property 36: worst list is bounded, ordered and equals the oracle prefix', () => {
    fc.assert(
      fc.property(arbAnyList, (list) => {
        const s = summarize(list);
        expect(s.worst.length).toBeLessThanOrEqual(WORST_LIST_SIZE);
        const registryKeys = new Set(
          oracleUniquePackages(list)
            .filter((p) => p.sourceKind === 'registry' && p.classification !== null)
            .map((p) => JSON.stringify([p.ecosystem, p.name, p.sourceKind])),
        );
        for (const p of s.worst) {
          expect(registryKeys.has(JSON.stringify([p.ecosystem, p.name, p.sourceKind]))).toBe(true);
          expect(p.sourceKind).toBe('registry');
          expect(p.classification.status === 'ALIVE' && p.classification.score === 0).toBe(false);
        }
        for (let i = 1; i < s.worst.length; i++) {
          expect(s.worst[i - 1].classification.score).toBeGreaterThanOrEqual(s.worst[i].classification.score);
        }
        const eligible = oracleSummarize(list).worst;
        expect(s.worst).toEqual(eligible);
        expect(s.worst.length).toBe(Math.min(WORST_LIST_SIZE, eligible.length));
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 37: Grade domain
  // **Validates: Requirements 12.17, 12.5**
  it('Property 37: grade is in A-F when assessed > 0 and null otherwise', () => {
    fc.assert(
      fc.property(arbAnyList, (list) => {
        const s = summarize(list);
        if (s.assessed > 0) {
          expect(['A', 'B', 'C', 'D', 'F']).toContain(s.grade);
        } else {
          expect(s.grade).toBeNull();
          expect(s.averageScore).toBeNull();
          expect(s.maxScore).toBeNull();
          expect(s.maxScorePackage).toBeNull();
          expect(s.counts).toEqual({ ALIVE: 0, HAUNTED: 0, DEAD: 0 });
          expect(s.worst).toEqual([]);
        }
      }),
      cfg(),
    );
    fc.assert(
      fc.property(arbUnassessedOnlyList, (list) => {
        const s = summarize(list);
        expect(s.assessed).toBe(0);
        expect(s.grade).toBeNull();
        expect(s.worst).toEqual([]);
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 38: Repo grade equals the grade of the maximum score
  // **Validates: Requirements 12.18, 12.15, 12.16**
  it('Property 38: grade equals grade(maxScore), independent of averageScore, with monotonic thresholds', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 100 }), (x, y) => {
        const [lo, hi] = x <= y ? [x, y] : [y, x];
        expect(oracleGradeIsBetter(oracleGrade(hi), oracleGrade(lo))).toBe(false);
        const expected = x <= 19 ? 'A' : x <= 39 ? 'B' : x <= 59 ? 'C' : x <= 79 ? 'D' : 'F';
        expect(oracleGrade(x)).toBe(expected);
      }),
      cfg(),
    );
    fc.assert(
      fc.property(arbAnyList, (list) => {
        const s = summarize(list);
        if (s.assessed === 0) return;
        const scores = oracleUniquePackages(list)
          .filter((p) => p.sourceKind === 'registry' && p.classification !== null)
          .map((p) => (p.classification as { score: number }).score);
        const max = Math.max(...scores);
        expect(s.grade).toBe(oracleGrade(s.maxScore as number));
        expect(s.grade).toBe(oracleGrade(max));
        if (max > GRADE_C_MAX) expect(['D', 'F']).toContain(s.grade);
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 39: maxScore is consistent with the package it names
  // **Validates: Requirements 12.19, 12.13**
  it('Property 39: maxScore equals the maximum merged score and the score of maxScorePackage', () => {
    fc.assert(
      fc.property(arbAnyList, (list) => {
        const s = summarize(list);
        if (s.assessed === 0) return;
        const assessed = oracleUniquePackages(list).filter((p) => p.sourceKind === 'registry' && p.classification !== null);
        const max = Math.max(...assessed.map((p) => (p.classification as { score: number }).score));
        expect(s.maxScore).toBe(max);
        expect(s.maxScore as number).toBeGreaterThanOrEqual(s.averageScore as number);
        const named = assessed.filter((p) => p.name === s.maxScorePackage?.name && p.ecosystem === s.maxScorePackage?.ecosystem);
        expect(named.length).toBeGreaterThanOrEqual(1);
        expect(named.some((p) => (p.classification as { score: number }).score === s.maxScore)).toBe(true);
        // It is the first package of the full 12.6 ordering, before the 12.7 exclusion and before truncation.
        expect(s.maxScorePackage).toEqual(oracleSummarize(list).maxScorePackage);
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 45: Repo grade is never better than any assessed package
  // **Validates: Requirements 12.23**
  it('Property 45: grade is not better than grade(score) of any assessed package', () => {
    fc.assert(
      fc.property(arbAnyList, (list) => {
        const s = summarize(list);
        if (s.assessed === 0) return;
        const assessed = oracleUniquePackages(list).filter((p) => p.sourceKind === 'registry' && p.classification !== null);
        for (const p of assessed) {
          const g = oracleGrade((p.classification as { score: number }).score);
          expect(GRADE_ORDER.indexOf(s.grade as never)).toBeGreaterThanOrEqual(GRADE_ORDER.indexOf(g));
          expect(oracleGradeIsBetter(s.grade as never, g)).toBe(false);
        }
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 46: Adding an assessed dependency never improves the repo grade
  // **Validates: Requirements 12.24**
  it('Property 46: appending an entry never improves the grade', () => {
    const assessedScores = (list: Parameters<typeof summarize>[0]): string =>
      JSON.stringify(
        oracleUniquePackages(list)
          .filter((p) => p.sourceKind === 'registry' && p.classification !== null)
          .map((p) => [p.ecosystem, p.name, (p.classification as { score: number }).score])
          .sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)),
      );
    fc.assert(
      fc.property(arbListWithExtra, ({ list, extended }) => {
        const before = summarize(list).grade;
        const after = summarize(extended).grade;
        if (before !== null) {
          expect(after).not.toBeNull();
          expect(oracleGradeIsBetter(after as never, before)).toBe(false);
        }
        if (assessedScores(list) === assessedScores(extended)) expect(after).toBe(before);
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 40: Unassessed items match unassessed packages
  // **Validates: Requirements 12.20, 12.14**
  it('Property 40: unassessed items match unassessed packages', () => {
    fc.assert(
      fc.property(arbAnyList, (list) => {
        const s = summarize(list);
        expect(s.unassessedItems.length).toBe(s.unassessed);
        for (const item of s.unassessedItems) {
          expect(item.unassessedReason).toBe(item.sourceKind === 'registry' ? 'no-health-data' : 'non-registry-source');
        }
        for (let i = 1; i < s.unassessedItems.length; i++) {
          const a = s.unassessedItems[i - 1];
          const b = s.unassessedItems[i];
          const cmp =
            oracleCompareCodePoints(a.ecosystem, b.ecosystem) ||
            oracleCompareCodePoints(a.name, b.name) ||
            oracleCompareCodePoints(a.sourceKind, b.sourceKind);
          expect(cmp).toBeLessThan(0);
        }
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 41: Repeating an entry in another scope only adds a scope
  // **Validates: Requirements 12.21, 12.1**
  it('Property 41: repeating an entry in another scope only adds a scope', () => {
    const stripScopes = (s: ReturnType<typeof summarize>) => ({
      ...s,
      worst: s.worst.map((w) => ({ ...w, scopes: [] })),
      unassessedItems: s.unassessedItems.map((u) => ({ ...u, scopes: [] })),
    });
    fc.assert(
      fc.property(arbAnyList.chain((list) => arbScopeRepetition(list).map((rep) => ({ list, rep }))), ({ list, rep }) => {
        const before = summarize(list);
        const after = summarize(rep);
        expect(stripScopes(after)).toEqual(stripScopes(before));
        const expected = new Map<string, Set<string>>();
        for (const e of rep) {
          const d = e.dependency;
          const k = JSON.stringify([d.ecosystem, d.name, d.sourceKind]);
          if (!expected.has(k)) expected.set(k, new Set());
          expected.get(k)?.add(d.scope);
        }
        for (const item of [...after.worst, ...after.unassessedItems]) {
          expect(item.scopes.length).toBeGreaterThan(0);
          expect(new Set(item.scopes).size).toBe(item.scopes.length);
          const idx = item.scopes.map((sc) => SCOPE_ORDER.indexOf(sc));
          expect(idx).toEqual([...idx].sort((a, b) => a - b));
          const k = JSON.stringify([item.ecosystem, item.name, item.sourceKind]);
          expect(new Set(item.scopes)).toEqual(expected.get(k));
        }
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 42: Merged classification picks the best classification of the group
  // **Validates: Requirements 12.1, 12.2, 12.22**
  it('Property 42: merged classification equals the oracle choice, independent of order and null entries', () => {
    type Entry = Parameters<typeof summarize>[0][number];
    type Cls = NonNullable<Entry['classification']>;
    const statusRank = (s: string): number => ['HAUNTED', 'DEAD', 'ALIVE'].indexOf(s);
    const flagsOf = (c: Cls): number => [c.vulnerable, c.abandoned, c.dormant].reduce((a, f) => a * 2 + (f ? 1 : 0), 0);
    // True when `a` is strictly preferred over `b` (independent of production merge code).
    const better = (a: Cls, b: Cls): boolean => {
      if (a.score !== b.score) return a.score > b.score;
      if (a.status !== b.status) return statusRank(a.status) < statusRank(b.status);
      if (flagsOf(a) !== flagsOf(b)) return flagsOf(a) < flagsOf(b);
      const ia = a.reasons.map((r) => r.ruleId).join(',');
      const ib = b.reasons.map((r) => r.ruleId).join(',');
      if (ia !== ib) return oracleCompareCodePoints(ia, ib) < 0;
      return oracleCompareCodePoints(oracleCanonicalJson(a), oracleCanonicalJson(b)) < 0;
    };
    const expectedChoices = (list: Entry[]): Map<string, { d: Entry['dependency']; c: Cls | null }> => {
      const m = new Map<string, { d: Entry['dependency']; c: Cls | null }>();
      for (const e of list) {
        const k = JSON.stringify([e.dependency.ecosystem, e.dependency.name, e.dependency.sourceKind]);
        const cur = m.get(k) ?? { d: e.dependency, c: null };
        if (e.classification !== null && (cur.c === null || better(e.classification, cur.c))) cur.c = e.classification;
        m.set(k, cur);
      }
      return m;
    };
    const check = (list: Entry[]): void => {
      const s = summarize(list);
      const choices = [...expectedChoices(list).values()].filter((g) => g.d.sourceKind === 'registry' && g.c !== null);
      const key = (g: { ecosystem: string; name: string; sourceKind: string }): string => JSON.stringify([g.ecosystem, g.name, g.sourceKind]);
      const expectedByKey = new Map(choices.map((g) => [key(g.d), g.c as Cls]));
      for (const p of s.worst) expect(p.classification).toEqual(expectedByKey.get(key(p)));
      const eligible = choices.filter((g) => !((g.c as Cls).status === 'ALIVE' && (g.c as Cls).score === 0));
      if (eligible.length <= WORST_LIST_SIZE) expect(s.worst.length).toBe(eligible.length);
      const counts = { ALIVE: 0, HAUNTED: 0, DEAD: 0 };
      for (const g of choices) counts[(g.c as Cls).status] += 1;
      expect(s.counts).toEqual(counts);
      expect(s.assessed).toBe(choices.length);
      if (choices.length > 0) {
        expect(s.maxScore).toBe(Math.max(...choices.map((g) => (g.c as Cls).score)));
        const mp = s.maxScorePackage;
        expect(mp).not.toBeNull();
        const named = choices.filter((g) => g.d.name === mp?.name && g.d.ecosystem === mp?.ecosystem);
        expect(named.some((g) => (g.c as Cls).score === s.maxScore)).toBe(true);
      }
    };
    const arbCase = fc.oneof(arbMergeHeavyList, arbTieList).chain((list) =>
      fc.tuple(
        fc.constant(list),
        arbPermutation(list),
        fc
          .array(fc.nat({ max: Math.max(0, list.length - 1) }), { maxLength: 10 })
          .map((idx) => (list.length === 0 ? [] : idx.map((i) => ({ dependency: list[i].dependency, classification: null })))),
      ),
    );
    fc.assert(
      fc.property(arbCase, ([list, permuted, nulls]) => {
        check(list);
        check(permuted);
        const withNulls = [...list, ...nulls];
        check(withNulls);
        expect(summarize(withNulls)).toEqual(summarize(list));
        expect(summarize(permuted)).toEqual(summarize(list));
        expect(summarize(withNulls).total).toBe(summarize(list).total);
      }),
      cfg(),
    );
  });});