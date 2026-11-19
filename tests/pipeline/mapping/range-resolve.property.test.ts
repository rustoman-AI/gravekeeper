import * as fc from 'fast-check';
import * as semver from 'semver';
import { describe, expect, it } from 'vitest';
import { pepSatisfies, pepRange } from '../../../pipeline/mapping/range-pep440';
import { resolveRange } from '../../../pipeline/mapping/range-resolve';
import { cfg } from '../../support/fc-config';

type Eco = 'npm' | 'pypi' | 'cargo';
type Tup = readonly [number, number, number];
type Op = '>=' | '>' | '<=' | '<' | '=';
interface Constraint {
  readonly op: Op;
  readonly t: Tup;
}

// Independent oracle: integer tuple comparison, no library calls.
function cmp(a: Tup, b: Tup): number {
  for (let i = 0; i < 3; i += 1) {
    const d = (a[i] as number) - (b[i] as number);
    if (d !== 0) return d;
  }
  return 0;
}
function holds(c: Constraint, v: Tup): boolean {
  const d = cmp(v, c.t);
  switch (c.op) {
    case '>=':
      return d >= 0;
    case '>':
      return d > 0;
    case '<=':
      return d <= 0;
    case '<':
      return d < 0;
    default:
      return d === 0;
  }
}
function oracleMax(stable: readonly Tup[], cs: readonly Constraint[]): Tup | null {
  let best: Tup | null = null;
  for (const v of stable) {
    if (!cs.every((c) => holds(c, v))) continue;
    if (best === null || cmp(v, best) > 0) best = v;
  }
  return best;
}
const str = (t: Tup): string => t.join('.');

function render(eco: Eco, c: Constraint): string {
  if (eco === 'pypi') return `${c.op === '=' ? '==' : c.op}${str(c.t)}`;
  return `${c.op}${str(c.t)}`;
}
function toRanges(eco: Eco, cs: readonly Constraint[], joined: boolean): string[] {
  const parts = cs.map((c) => render(eco, c));
  if (!joined) return parts;
  return [parts.join(eco === 'npm' ? ' ' : eco === 'cargo' ? ', ' : ',')];
}

const num = fc.integer({ min: 0, max: 5 });
const tup: fc.Arbitrary<Tup> = fc.tuple(num, num, num);
const op: fc.Arbitrary<Op> = fc.constantFrom('>=', '>', '<=', '<', '=');
const constraint: fc.Arbitrary<Constraint> = fc.record({ op, t: tup });
const ecosystem: fc.Arbitrary<Eco> = fc.constantFrom('npm', 'pypi', 'cargo');

function decorate(eco: Eco, t: Tup, kind: number): string {
  // Prereleases of the given triple, always syntactically valid for the ecosystem.
  if (eco === 'pypi') return [`${str(t)}rc1`, `${str(t)}a1`, `${str(t)}b2`, `${str(t)}.dev1`][kind % 4] as string;
  return [`${str(t)}-rc.1`, `${str(t)}-alpha`, `${str(t)}-0`, `${str(t)}-beta.2`][kind % 4] as string;
}
const JUNK: Readonly<Record<Eco, readonly string[]>> = {
  npm: ['', 'abc', '1.2', 'v1.2.3', '01.2.3', '1.2.3.4', 'latest', '1.2.x'],
  cargo: ['', 'abc', '1.2', 'v1.2.3', '01.2.3', '1.2.3.4', 'latest', '1.2.x'],
  pypi: ['', 'abc', 'not a version', '1.2.x', 'v..', 'latest'],
};

interface Scenario {
  readonly eco: Eco;
  readonly stable: readonly Tup[];
  readonly versions: readonly string[];
}
// Stable versions, their duplicates, prereleases (often above the stable maximum) and junk.
const scenario: fc.Arbitrary<Scenario> = fc
  .tuple(
    ecosystem,
    fc.array(tup, { maxLength: 12 }),
    fc.array(fc.tuple(tup, fc.nat(3)), { maxLength: 8 }),
    fc.array(fc.nat(7), { maxLength: 4 }),
    fc.array(fc.nat(30), { maxLength: 6 }),
    fc.nat(1000),
  )
  .map(([eco, stable, pres, junkIdx, dupIdx, shuffle]) => {
    const list: string[] = [
      ...stable.map(str),
      ...pres.map(([t, k]) => decorate(eco, t, k)),
      ...junkIdx.map((i) => JUNK[eco][i % JUNK[eco].length] as string),
    ];
    if (list.length > 0) for (const i of dupIdx) list.push(list[i % list.length] as string);
    // deterministic rotation to vary order
    const r = list.length === 0 ? 0 : shuffle % list.length;
    return { eco, stable, versions: [...list.slice(r), ...list.slice(0, r)] };
  });

describe('Property 3: The resolved version is listed and satisfies every range', () => {
  it('a resolved version is an element of the list and satisfies each range under the library', () => {
    fc.assert(
      fc.property(scenario, fc.array(constraint, { minLength: 1, maxLength: 3 }), fc.boolean(), (s, cs, joined) => {
        const ranges = toRanges(s.eco, cs, joined);
        const out = resolveRange(s.eco, ranges, s.versions);
        if (out.kind !== 'resolved') return;
        expect(s.versions).toContain(out.version);
        for (const r of ranges) {
          if (s.eco === 'pypi') {
            const normalized = pepRange(r);
            expect(normalized).not.toBeNull();
            expect(pepSatisfies(out.version, normalized as string)).toBe(true);
          } else {
            const semverText = r.replace(/,/g, ' ');
            expect(semver.satisfies(out.version, semver.validRange(semverText) as string)).toBe(true);
          }
        }
      }),
      cfg(),
    );
  });

  it('a satisfiable range set over a list containing a stable match always resolves', () => {
    fc.assert(
      fc.property(
        scenario.filter((s) => s.stable.length > 0),
        fc.nat(),
        fc.array(constraint, { minLength: 1, maxLength: 4 }),
        fc.boolean(),
        (s, pick, raw, joined) => {
          const target = s.stable[pick % s.stable.length] as Tup;
          const cs = raw.filter((c) => holds(c, target));
          fc.pre(cs.length > 0);
          const out = resolveRange(s.eco, toRanges(s.eco, cs, joined), s.versions);
          expect(out.kind).toBe('resolved');
          if (out.kind === 'resolved') expect(s.versions).toContain(out.version);
        },
      ),
      cfg(),
    );
  });
});

describe('Property 4: The resolved version is the highest non-prerelease match', () => {
  it('equals the independent integer maximum of the listed stable versions (or unresolved when none match)', () => {
    fc.assert(
      fc.property(scenario, fc.array(constraint, { minLength: 1, maxLength: 3 }), fc.boolean(), (s, cs, joined) => {
        const expected = oracleMax(s.stable, cs);
        const out = resolveRange(s.eco, toRanges(s.eco, cs, joined), s.versions);
        if (expected === null) expect(out).toEqual({ kind: 'unresolved' });
        else expect(out).toEqual({ kind: 'resolved', version: str(expected) });
      }),
      cfg(),
    );
  });

  it('never returns a prerelease even when it is the highest match', () => {
    fc.assert(
      fc.property(
        ecosystem,
        tup,
        fc.nat(3),
        (eco, t, kind) => {
          const pre = decorate(eco, [t[0] + 1, t[1], t[2]], kind);
          const stableV = str(t);
          const ranges = toRanges(eco, [{ op: '>=', t }], false);
          expect(resolveRange(eco, ranges, [pre, stableV])).toEqual({ kind: 'resolved', version: stableV });
          expect(resolveRange(eco, ranges, [pre])).toEqual({ kind: 'unresolved' });
        },
      ),
      cfg(),
    );
  });

  it('cargo bare and caret requirements pick the integer maximum below the caret bound', () => {
    fc.assert(
      fc.property(
        fc.array(tup, { maxLength: 12 }),
        tup,
        fc.boolean(),
        (stable, base, caret) => {
          const [a, b, c] = base;
          const upper: Tup | null = a > 0 ? [a + 1, 0, 0] : b > 0 ? [0, b + 1, 0] : null;
          const expected = stable
            .filter((v) => cmp(v, base) >= 0 && (upper === null ? cmp(v, base) === 0 : cmp(v, upper) < 0))
            .reduce<Tup | null>((best, v) => (best === null || cmp(v, best) > 0 ? v : best), null);
          const range = `${caret ? '^' : ''}${a}.${b}.${c}`;
          const out = resolveRange('cargo', [range], stable.map(str));
          if (expected === null) expect(out).toEqual({ kind: 'unresolved' });
          else expect(out).toEqual({ kind: 'resolved', version: str(expected) });
        },
      ),
      cfg(),
    );
  });
});
