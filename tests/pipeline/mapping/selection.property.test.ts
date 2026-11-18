import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DISCOVERY_MANIFEST_NAMES, SCAN_MAX_MANIFESTS } from '../../../pipeline/constants';
import { selectManifests } from '../../../pipeline/mapping/selection';
import type { ManifestCandidate, SelectionLimits } from '../../../pipeline/mapping/types';
import { arbTreePath } from '../../support/arbitraries/trees';
import { cfg } from '../../support/fc-config';

const limits: SelectionLimits = {
  maxManifests: SCAN_MAX_MANIFESTS,
  manifestNames: DISCOVERY_MANIFEST_NAMES,
};

const lastOf = (p: string): string => p.slice(p.lastIndexOf('/') + 1);

// Paths whose last segment is a manifest name. Skip directories stay possible.
const arbManifestPath: fc.Arbitrary<string> = arbTreePath.filter((p) =>
  DISCOVERY_MANIFEST_NAMES.includes(lastOf(p)),
);

function toCandidate(path: string): ManifestCandidate {
  const name = lastOf(path);
  return {
    path,
    format: name as ManifestCandidate['format'],
    depth: path.split('/').length - 1,
    sizeBytes: null,
  };
}

function cmpCodePoints(a: string, b: string): number {
  const x = Array.from(a, (c) => c.codePointAt(0) as number);
  const y = Array.from(b, (c) => c.codePointAt(0) as number);
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
    if (x[i] !== y[i]) return (x[i] as number) - (y[i] as number);
  }
  return x.length - y.length;
}

/** Candidate list (distinct paths, as discovery yields) plus a permutation of it. */
const arbCandidatesAndPermutation = fc
  .uniqueArray(arbManifestPath, { maxLength: 30 })
  .chain((paths) =>
    fc
      .tuple(fc.constant(paths), fc.shuffledSubarray(paths, { minLength: paths.length, maxLength: paths.length }))
      .map(([a, b]) => ({ a: a.map(toCandidate), b: b.map(toCandidate) })),
  );

describe('selectManifests properties', () => {
  // Feature: scan-pipeline, Property 10: Manifest selection invariants
  // Validates: Requirements 5.13
  it('P10 default selection is exactly the Root_Manifests in ascending order, uncapped, permutation-invariant', () => {
    fc.assert(
      fc.property(
        arbCandidatesAndPermutation,
        fc.constant<readonly string[]>([]),
        (cands, requested) => {
          const treePaths = new Set(cands.a.map((c) => c.path));
          const r1 = selectManifests(cands.a, requested, treePaths, limits);
          const r2 = selectManifests(cands.b, requested, treePaths, limits);
          expect(r1.ok).toBe(true);
          expect(r2).toEqual(r1);
          if (!r1.ok) return;
          const roots = cands.a.map((c) => c.path).filter((p) => !p.includes('/')).sort(cmpCodePoints);
          expect(r1.value.selected).toEqual(roots);
          expect(r1.value.noRootManifest).toBe(roots.length === 0 && cands.a.length > 0);
        },
      ),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 10: Manifest selection invariants
  // Validates: Requirements 5.13
  it('P10 explicit selection is distinct, capped, first-occurrence ordered and permutation-invariant', () => {
    fc.assert(
      fc.property(
        arbCandidatesAndPermutation,
        fc.array(arbManifestPath, { maxLength: 25 }),
        (cands, extra) => {
          const treePaths = new Set([...cands.a.map((c) => c.path), ...extra]);
          // Requested paths come from the tree, so R5.5 holds; the count decides R5.4.
          const requested = extra;
          const distinct = Array.from(new Set(requested));
          const r1 = selectManifests(cands.a, requested, treePaths, limits);
          const r2 = selectManifests(cands.b, requested, treePaths, limits);
          expect(r2).toEqual(r1);
          if (requested.length === 0) return;
          if (distinct.length > SCAN_MAX_MANIFESTS) {
            expect(r1).toEqual({
              ok: false,
              error: { code: 'too-many-manifests', details: { limit: SCAN_MAX_MANIFESTS } },
            });
            return;
          }
          expect(r1.ok).toBe(true);
          if (!r1.ok) return;
          expect(r1.value.selected).toEqual(distinct);
          expect(new Set(r1.value.selected).size).toBe(r1.value.selected.length);
          expect(r1.value.selected.length).toBeLessThanOrEqual(SCAN_MAX_MANIFESTS);
        },
      ),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 10: Manifest selection invariants
  // Validates: Requirements 5.13
  it('P10 never throws for any request list, and checks too-many before not-found', () => {
    fc.assert(
      fc.property(
        arbCandidatesAndPermutation,
        fc.array(fc.oneof(arbTreePath, fc.string()), { maxLength: 25 }),
        fc.uniqueArray(arbTreePath, { maxLength: 20 }),
        (cands, requested, tree) => {
          const treePaths = new Set(tree);
          const r = selectManifests(cands.a, requested, treePaths, limits);
          const distinct = Array.from(new Set(requested));
          if (requested.length === 0) {
            expect(r.ok).toBe(true);
            return;
          }
          if (distinct.length > SCAN_MAX_MANIFESTS) {
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.error.code).toBe('too-many-manifests');
            return;
          }
          const bad = distinct.find(
            (p) => !treePaths.has(p) || !DISCOVERY_MANIFEST_NAMES.includes(lastOf(p)),
          );
          if (bad === undefined) {
            expect(r).toEqual({ ok: true, value: { selected: distinct, noRootManifest: false } });
          } else {
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.error.code).toBe('manifest-not-found');
          }
        },
      ),
      cfg(),
    );
  });
});
