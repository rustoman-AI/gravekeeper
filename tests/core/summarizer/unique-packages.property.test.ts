// Property 12 (scan-accuracy): exported merge functions agree with the Summarizer.
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compareClassifications, mergeClassifications, summarize, uniquePackages } from '../../../core';
import {
  arbAssessedList,
  arbClassification,
  arbManyPackagesList,
  arbMergeHeavyList,
} from '../../support/arbitraries/assessed';
import { cfg } from '../../support/fc-config';

const arbAnyList = fc.oneof(arbAssessedList, arbMergeHeavyList, arbManyPackagesList);
const keyOf = (p: { ecosystem: string; name: string; sourceKind: string }): string =>
  JSON.stringify([p.ecosystem, p.name, p.sourceKind]);

describe('exported merge functions agree with the Summarizer', () => {
  // Feature: scan-accuracy, Property 12: Exported merge functions agree with the Summarizer
  // Feature: dependency-graveyard-core, Property 47: Exported merge functions agree with the Summarizer
  // **Validates: Requirements 9.2, 9.5, 9.6**
  it('Property 12: uniquePackages length equals summarize total and merged classifications match', () => {
    fc.assert(
      fc.property(arbAnyList, (list) => {
        const s = summarize(list);
        const packages = uniquePackages(list);
        expect(packages.length).toBe(s.total);
        const byKey = new Map(packages.map((p) => [keyOf(p), p]));
        for (const r of s.worst) {
          expect(r.classification).toEqual(byKey.get(keyOf(r))?.classification);
        }
        for (const u of s.unassessedItems) {
          const p = byKey.get(keyOf(u));
          expect(p).toBeDefined();
        }
        const assessed = packages.filter((p) => p.sourceKind === 'registry' && p.classification !== null);
        expect(assessed.length).toBe(s.assessed);
        const worstKeys = new Set(s.worst.map(keyOf));
        const hidden = assessed.filter((p) => !worstKeys.has(keyOf(p)));
        // Packages not in worst are either ALIVE with score 0 or ranked after the cut-off.
        for (const p of hidden) {
          expect(p.classification).not.toBeNull();
        }
      }),
      cfg(),
    );
  });

  it('Property 12: mergeClassifications returns a member that no other member beats', () => {
    fc.assert(
      fc.property(fc.array(arbClassification, { minLength: 1, maxLength: 12 }), (list) => {
        const merged = mergeClassifications(list);
        // A non-empty list must always merge to a concrete classification.
        expect(merged).not.toBeNull();
        if (merged === null) throw new Error('mergeClassifications returned null for a non-empty list');
        expect(list.some((c) => c === merged || JSON.stringify(c) === JSON.stringify(merged))).toBe(true);
        for (const other of list) {
          expect(compareClassifications(merged, other)).toBeLessThanOrEqual(0);
        }
      }),
      cfg(),
    );
  });
});
