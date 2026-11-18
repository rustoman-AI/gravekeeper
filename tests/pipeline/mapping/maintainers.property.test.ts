import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  mapCratesOwners,
  mapNpmLatest,
  mapPypiOwnership,
  orderCratesLookups,
} from '../../../pipeline/mapping/maintainers';
import { cfg } from '../../support/fc-config';
import type { Scope } from '../../../core';

const SCOPES: readonly Scope[] = ['runtime', 'build', 'dev', 'optional', 'peer'];

const arbName = fc.oneof(
  fc.constantFrom('a', 'b', 'c', '', 'a b', '__proto__', 'é', '😀'),
  fc.string({ maxLength: 6 }),
);
const arbJunk = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.integer(),
  fc.string(),
  fc.constant([]),
  fc.constant({}),
);

// An entry is either a valid-or-invalid object built from `name`, or junk.
const arbNpmEntry = fc.oneof(
  arbName.map((name) => ({ name })),
  fc.oneof(arbJunk, arbJunk.map((name) => ({ name }))),
);
const arbUserEntry = fc.oneof(
  arbName.map((login) => ({ kind: 'user', login })),
  fc.oneof(arbJunk, arbJunk.map((login) => ({ kind: 'user', login }))),
  fc.constant({ kind: 'user' }),
);
const arbTeamEntry = arbName.map((login) => ({ kind: 'team', login }));
const arbOtherKind = fc.oneof(
  fc.string().filter((s) => s !== 'user' && s !== 'team').map((kind) => ({ kind, login: 'x' })),
  arbJunk,
);
const arbCratesEntry = fc.oneof(arbUserEntry, arbTeamEntry, arbOtherKind);
const arbRole = fc.oneof(
  fc.string({ maxLength: 4 }).map((user) => ({ role: 'Owner', user })),
  arbJunk.map((user) => ({ role: 'Maintainer', user })),
  arbJunk,
);

function withPermutation<T>(arb: fc.Arbitrary<T[]>): fc.Arbitrary<[T[], T[]]> {
  return arb.chain((list) =>
    fc.shuffledSubarray(list, { minLength: list.length, maxLength: list.length }).map((p): [T[], T[]] => [list, p]),
  );
}

function distinctNames(list: unknown[]): number {
  const s = new Set<string>();
  for (const e of list) {
    const n = (e as { name?: unknown } | null)?.name;
    if (e !== null && typeof e === 'object' && typeof n === 'string' && n.length > 0) s.add(n);
  }
  return s.size;
}
function distinctLogins(list: unknown[]): number {
  const s = new Set<string>();
  for (const e of list) {
    if (e === null || typeof e !== 'object') continue;
    const r = e as { kind?: unknown; login?: unknown };
    if (r.kind === 'user' && typeof r.login === 'string' && r.login.length > 0) s.add(r.login);
  }
  return s.size;
}
function hasTeam(list: unknown[]): boolean {
  return list.some((e) => e !== null && typeof e === 'object' && (e as { kind?: unknown }).kind === 'team');
}
function distinctUsers(list: unknown[]): number {
  const s = new Set<string>();
  for (const e of list) {
    const u = e !== null && typeof e === 'object' ? (e as { user?: unknown }).user : undefined;
    if (typeof u === 'string') s.add(u);
  }
  return s.size;
}

describe('maintainer mappers (properties)', () => {
  // Feature: scan-pipeline, Property 35: Maintainer count is the number of distinct valid entries
  // Validates: Requirements 12.11
  it('P35 npm: count is permutation-invariant and equals the distinct valid names', () => {
    fc.assert(
      fc.property(withPermutation(fc.array(arbNpmEntry, { maxLength: 12 })), ([list, perm]) => {
        const a = mapNpmLatest({ maintainers: list }).maintainerCount;
        const b = mapNpmLatest({ maintainers: perm }).maintainerCount;
        expect(a).toBe(b);
        if (a !== null) expect(a).toBe(list.length === 0 ? 0 : distinctNames(list));
        else expect(distinctNames(list)).toBe(0);
        // duplicating every entry changes nothing
        expect(mapNpmLatest({ maintainers: [...list, ...list] }).maintainerCount).toBe(a);
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 35: Maintainer count is the number of distinct valid entries
  // Validates: Requirements 12.11
  it('P35 crates: count is permutation-invariant and equals the distinct valid logins', () => {
    fc.assert(
      fc.property(withPermutation(fc.array(arbCratesEntry, { maxLength: 12 })), ([list, perm]) => {
        const a = mapCratesOwners({ users: list }).maintainerCount;
        const b = mapCratesOwners({ users: perm }).maintainerCount;
        expect(a).toBe(b);
        if (a !== null) expect(a).toBe(distinctLogins(list));
        else expect(list.length === 0 ? false : distinctLogins(list) === 0).toBe(true);
        expect(mapCratesOwners({ users: [...list, ...list] }).maintainerCount).toBe(a);
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 35: Maintainer count is the number of distinct valid entries
  // Validates: Requirements 12.11
  it('P35 pypi: count is permutation-invariant and equals the distinct string users', () => {
    fc.assert(
      fc.property(
        withPermutation(fc.array(arbRole, { minLength: 1, maxLength: 12 })),
        ([list, perm]) => {
          const a = mapPypiOwnership({ ownership: { organization: null, roles: list } }).maintainerCount;
          const b = mapPypiOwnership({ ownership: { organization: null, roles: perm } }).maintainerCount;
          expect(a).toBe(b);
          const expected = distinctUsers(list);
          expect(a).toBe(expected === 0 ? null : expected);
          expect(
            mapPypiOwnership({ ownership: { organization: null, roles: [...list, ...list] } }).maintainerCount,
          ).toBe(a);
        },
      ),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 35: Maintainer count is the number of distinct valid entries
  // Validates: Requirements 12.12
  it('P35 missing field gives null for every ecosystem', () => {
    fc.assert(
      fc.property(fc.anything(), fc.oneof(arbJunk, fc.constant(true)), (rest, bad) => {
        const noField = (key: string): unknown => {
          const o: Record<string, unknown> = {};
          if (rest !== null && typeof rest === 'object' && !Array.isArray(rest)) {
            for (const [k, v] of Object.entries(rest)) if (k !== key) o[k] = v;
          }
          return o;
        };
        expect(mapNpmLatest(noField('maintainers')).maintainerCount).toBeNull();
        expect(mapCratesOwners(noField('users')).maintainerCount).toBeNull();
        expect(mapPypiOwnership({ ownership: noField('roles') }).maintainerCount).toBeNull();
        expect(mapPypiOwnership(noField('ownership')).maintainerCount).toBeNull();
        // present but not an array
        if (!Array.isArray(bad)) {
          expect(mapNpmLatest({ maintainers: bad }).maintainerCount).toBeNull();
          expect(mapCratesOwners({ users: bad }).maintainerCount).toBeNull();
          expect(mapPypiOwnership({ ownership: { roles: bad } }).maintainerCount).toBeNull();
        }
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 36: Lower-bound note appears exactly for mixed owner lists
  // Validates: Requirements 12.15
  it('P36 lowerBound is true iff a valid user and a team are both present', () => {
    fc.assert(
      fc.property(fc.array(arbCratesEntry, { maxLength: 12 }), (list) => {
        const r = mapCratesOwners({ users: list });
        expect(r.lowerBound).toBe(distinctLogins(list) > 0 && hasTeam(list));
        if (r.lowerBound) expect(r.maintainerCount).toBe(distinctLogins(list));
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 74: Crates owners are looked up in scope order and cached owners send no request
  // Validates: Requirements 12.14
  it('P74 orderCratesLookups orders by first scope then code point name, independent of input order', () => {
    const arbTarget = fc.record({
      name: fc.constantFrom('a', 'b', 'c', 'd', 'Z', 'é', '😀', '\uFF5E', 'a-b', 'a_b'),
      scopes: fc.array(fc.constantFrom(...SCOPES), { maxLength: 5 }),
    });
    fc.assert(
      fc.property(
        withPermutation(fc.array(arbTarget, { maxLength: 10 })),
        ([targets, perm]) => {
          const out = orderCratesLookups(targets);
          const rank = (t: { scopes: readonly Scope[] }): number =>
            t.scopes.length === 0 ? 5 : Math.min(...t.scopes.map((s) => SCOPES.indexOf(s)));
          const best = new Map<string, number>();
          for (const t of targets) best.set(t.name, Math.min(best.get(t.name) ?? 99, rank(t)));
          // each distinct name once
          expect(new Set(out).size).toBe(out.length);
          expect([...out].sort()).toEqual([...best.keys()].sort());
          // non-decreasing (rank, code point name)
          for (let i = 1; i < out.length; i += 1) {
            const pr = best.get(out[i - 1]) as number;
            const cr = best.get(out[i]) as number;
            expect(pr <= cr).toBe(true);
            if (pr === cr) {
              const pa = Array.from(out[i - 1], (c) => c.codePointAt(0) as number);
              const ca = Array.from(out[i], (c) => c.codePointAt(0) as number);
              let cmp = 0;
              for (let k = 0; k < Math.min(pa.length, ca.length) && cmp === 0; k += 1) cmp = pa[k] - ca[k];
              if (cmp === 0) cmp = pa.length - ca.length;
              expect(cmp).toBeLessThan(0);
            }
          }
          expect(orderCratesLookups(perm)).toEqual(out);
        },
      ),
      cfg(),
    );
  });
});
