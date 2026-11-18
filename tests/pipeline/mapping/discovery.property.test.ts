import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DISCOVERY_MANIFEST_NAMES,
  DISCOVERY_MAX_DEPTH,
  DISCOVERY_MAX_MANIFESTS,
  DISCOVERY_SKIP_DIRS,
} from '../../../pipeline/constants';
import { discoverManifests } from '../../../pipeline/mapping/discovery';
import type { DiscoveryLimits } from '../../../pipeline/mapping/types';
import { arbJson } from '../../support/arbitraries/json';
import { arbTreeBody, arbTreeEntries } from '../../support/arbitraries/trees';
import { cfg } from '../../support/fc-config';

const limits: DiscoveryLimits = {
  maxDepth: DISCOVERY_MAX_DEPTH,
  maxManifests: DISCOVERY_MAX_MANIFESTS,
  manifestNames: DISCOVERY_MANIFEST_NAMES,
  skipDirs: DISCOVERY_SKIP_DIRS,
};

// Independent oracle written from Requirements 4.2 to 4.7.
function cmpCodePoints(a: string, b: string): number {
  const x = Array.from(a, (c) => c.codePointAt(0) as number);
  const y = Array.from(b, (c) => c.codePointAt(0) as number);
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
    if (x[i] !== y[i]) return (x[i] as number) - (y[i] as number);
  }
  return x.length - y.length;
}

interface Kept {
  readonly path: string;
  readonly depth: number;
}

function oracle(entries: readonly unknown[]): { kept: Kept[]; depthLimited: boolean } {
  const kept: Kept[] = [];
  let depthLimited = false;
  for (const e of entries) {
    if (e === null || typeof e !== 'object') continue;
    const rec = e as Record<string, unknown>;
    if (typeof rec.path !== 'string' || rec.path === '' || rec.type !== 'blob') continue;
    const segs = rec.path.split('/');
    const last = segs[segs.length - 1] as string;
    if (!DISCOVERY_MANIFEST_NAMES.includes(last)) continue;
    if (segs.slice(0, -1).some((s) => DISCOVERY_SKIP_DIRS.includes(s))) continue;
    const depth = segs.length - 1;
    if (depth > DISCOVERY_MAX_DEPTH) {
      depthLimited = true;
      continue;
    }
    kept.push({ path: rec.path, depth });
  }
  kept.sort((a, b) => a.depth - b.depth || cmpCodePoints(a.path, b.path));
  return { kept, depthLimited };
}

function run(body: unknown) {
  const r = discoverManifests(body, limits);
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.value;
}

describe('discoverManifests properties', () => {
  // Feature: scan-pipeline, Property 7: Discovery_Result invariants
  // Validates: Requirements 4.9, 4.13
  it('Property 7: invariants and the first DISCOVERY_MAX_MANIFESTS in depth then path order', () => {
    fc.assert(
      fc.property(arbTreeBody, (body) => {
        const v = run(body);
        const { kept, depthLimited } = oracle(body.tree);
        expect(v.candidates.length).toBeLessThanOrEqual(DISCOVERY_MAX_MANIFESTS);
        for (const c of v.candidates) {
          expect(c.depth).toBeLessThanOrEqual(DISCOVERY_MAX_DEPTH);
          const segs = c.path.split('/');
          expect(segs.slice(0, -1).some((s) => DISCOVERY_SKIP_DIRS.includes(s))).toBe(false);
          expect(DISCOVERY_MANIFEST_NAMES).toContain(segs[segs.length - 1]);
          expect(c.depth).toBe(segs.length - 1);
        }
        expect(v.countLimited).toBe(kept.length > DISCOVERY_MAX_MANIFESTS);
        expect(v.depthLimited).toBe(depthLimited);
        expect(v.candidates.map((c) => ({ path: c.path, depth: c.depth }))).toEqual(
          kept.slice(0, DISCOVERY_MAX_MANIFESTS),
        );
        expect(v.truncatedTree).toBe(body.truncated === true);
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 8: Discovery does not depend on tree entry order
  // Validates: Requirements 4.10
  it('Property 8: any permutation of the entries gives an equal result', () => {
    fc.assert(
      fc.property(
        arbTreeEntries,
        fc.array(fc.nat(), { minLength: 1, maxLength: 400 }),
        fc.oneof(fc.boolean(), arbJson),
        (entries, keys, truncated) => {
          const permuted = entries
            .map((entry, i) => ({ entry, i, key: keys[i % keys.length] as number }))
            .sort((a, b) => a.key - b.key || a.i - b.i)
            .map((x) => x.entry);
          expect(run({ tree: permuted, truncated })).toEqual(run({ tree: entries, truncated }));
          expect(run({ tree: [...entries].reverse(), truncated })).toEqual(
            run({ tree: entries, truncated }),
          );
        },
      ),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 9: Tree responses are handled totally
  // Validates: Requirements 4.12
  it('Property 9: any JSON value gives a result or invalid-tree and never throws', () => {
    fc.assert(
      fc.property(arbJson, (body) => {
        const r = discoverManifests(body, limits);
        if (!r.ok) expect(r.error).toBe('invalid-tree');
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 9: Tree responses are handled totally
  // Validates: Requirements 4.12
  it('Property 9: entries with a non-string path or type are ignored', () => {
    fc.assert(
      fc.property(arbTreeBody, (body) => {
        const valid = body.tree.filter((e) => {
          if (e === null || typeof e !== 'object') return false;
          const rec = e as Record<string, unknown>;
          return typeof rec.path === 'string' && typeof rec.type === 'string';
        });
        expect(run(body)).toEqual(run({ tree: valid, truncated: body.truncated }));
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 9: Tree responses are handled totally
  // Validates: Requirements 4.12
  it('Property 9: a tree field that is not an array gives invalid-tree', () => {
    fc.assert(
      fc.property(
        arbJson.filter((t) => !Array.isArray(t)),
        (tree) => {
          const r = discoverManifests({ tree }, limits);
          expect(r).toEqual({ ok: false, error: 'invalid-tree' });
        },
      ),
      cfg(),
    );
  });
});
