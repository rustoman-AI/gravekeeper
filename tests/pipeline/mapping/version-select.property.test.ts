import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { exactPin, selectVersion } from '../../../pipeline/mapping/version-select';
import { cfg } from '../../support/fc-config';

type Eco = 'npm' | 'pypi' | 'cargo';

const ALNUM_HYPHEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-';
const PYPI_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.+!_-';

// Independent oracle written by hand from Requirement 7 criteria 1 and 2.
function isDigits(s: string): boolean {
  if (s.length === 0) return false;
  for (const c of s) if (c < '0' || c > '9') return false;
  return true;
}
function isNumber(s: string): boolean {
  return isDigits(s) && (s === '0' || s[0] !== '0');
}
function isList(s: string): boolean {
  if (s.length === 0) return false;
  return s.split('.').every((item) => item.length > 0 && [...item].every((c) => ALNUM_HYPHEN.includes(c)));
}
function validSemver(v: string): boolean {
  let rest = v;
  let build: string | null = null;
  const plus = rest.indexOf('+');
  if (plus >= 0) {
    build = rest.slice(plus + 1);
    rest = rest.slice(0, plus);
  }
  let pre: string | null = null;
  const dash = rest.indexOf('-');
  if (dash >= 0) {
    pre = rest.slice(dash + 1);
    rest = rest.slice(0, dash);
  }
  const parts = rest.split('.');
  if (parts.length !== 3 || !parts.every(isNumber)) return false;
  if (pre !== null && !isList(pre)) return false;
  if (build !== null && !isList(build)) return false;
  return true;
}
function validPypi(v: string): boolean {
  return v.length > 0 && v[0] >= '0' && v[0] <= '9' && [...v].every((c) => PYPI_CHARS.includes(c));
}
function oracle(spec: string, eco: Eco): string | null {
  const s = spec.trim();
  if (eco === 'npm') {
    if (validSemver(s)) return s;
    if (s.startsWith('=') && validSemver(s.slice(1))) return s.slice(1);
    return null;
  }
  if (eco === 'cargo') {
    return s.startsWith('=') && validSemver(s.slice(1)) ? s.slice(1) : null;
  }
  if (s.startsWith('===') && validPypi(s.slice(3))) return s.slice(3);
  if (s.startsWith('==') && validPypi(s.slice(2))) return s.slice(2);
  return null;
}

const strOf = (unit: fc.Arbitrary<string>, opts: { maxLength: number }): fc.Arbitrary<string> =>
  fc.string({ unit, ...opts });

const ecosystem: fc.Arbitrary<Eco> = fc.constantFrom('npm', 'pypi', 'cargo');

const num = fc.oneof(fc.constant('0'), fc.nat(1000).map(String), fc.nat(99).map((n) => `0${n}`));
const ident = strOf(fc.constantFrom(...ALNUM_HYPHEN), { maxLength: 4 });
const identList = fc.array(ident, { minLength: 1, maxLength: 3 }).map((l) => l.join('.'));
const semverish: fc.Arbitrary<string> = fc
  .tuple(num, num, num, fc.option(identList, { nil: null }), fc.option(identList, { nil: null }))
  .map(([a, b, c, pre, build]) => `${a}.${b}.${c}${pre === null ? '' : `-${pre}`}${build === null ? '' : `+${build}`}`);
const pypiish: fc.Arbitrary<string> = fc.oneof(
  strOf(fc.constantFrom(...PYPI_CHARS, '*', ' ', ';', '=', 'é'), { maxLength: 8 }),
  fc.tuple(fc.nat(20), strOf(fc.constantFrom(...PYPI_CHARS), { maxLength: 6 })).map(([n, r]) => `${n}${r}`),
);
const operator = fc.constantFrom('', '=', '==', '===', '>=', '^', '~', '~=', 'v', '<', '!=', '====');
const pad = strOf(fc.constantFrom(' ', '\t', '\n', '\r', '\u00a0', '\u2003'), { maxLength: 2 });

const specArb: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 6, arbitrary: fc.tuple(pad, operator, fc.oneof(semverish, pypiish), pad).map(([a, o, v, b]) => `${a}${o}${v}${b}`) },
  { weight: 3, arbitrary: fc.string() },
  { weight: 1, arbitrary: fc.string({ unit: 'binary' }) },
  { weight: 1, arbitrary: fc.constantFrom('', ' ', '\n\t', '*', 'latest', '1.2.3 ', ' =1.2.3', '1.2.x', '1.2', 'v1.2.3', '1.2.3 - 2.0.0') },
  { weight: 1, arbitrary: fc.anything() },
);
const ecosystemArb: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 8, arbitrary: ecosystem },
  { weight: 1, arbitrary: fc.anything() },
  { weight: 1, arbitrary: fc.constantFrom('NPM', 'maven', 'go', '', 'Cargo') },
);

// Feature: scan-pipeline, Property 14: Version_Selector accepts only exact pins
// Validates: Requirements 7.10
describe('Property 14: Version_Selector accepts only exact pins', () => {
  it('returns null or the pin of R7.1 and R7.2 without its operator, and never throws', () => {
    fc.assert(
      fc.property(specArb, ecosystemArb, (spec, eco) => {
        const result = exactPin(spec, eco);
        const expected =
          typeof spec === 'string' && (eco === 'npm' || eco === 'cargo' || eco === 'pypi')
            ? oracle(spec, eco)
            : null;
        expect(result).toBe(expected);
      }),
      cfg(),
    );
  });

  it('accepts every well-formed pin in each ecosystem form', () => {
    fc.assert(
      fc.property(
        semverish.filter(validSemver),
        pypiish.filter(validPypi),
        pad,
        pad,
        (sv, py, a, b) => {
          expect(exactPin(`${a}${sv}${b}`, 'npm')).toBe(sv);
          expect(exactPin(`${a}=${sv}${b}`, 'npm')).toBe(sv);
          expect(exactPin(`${a}=${sv}${b}`, 'cargo')).toBe(sv);
          expect(exactPin(`${a}==${py}${b}`, 'pypi')).toBe(py);
          expect(exactPin(`${a}===${py}${b}`, 'pypi')).toBe(py);
          expect(exactPin(sv, 'cargo')).toBeNull();
        },
      ),
      cfg(),
    );
  });
});

const POOL = ['1.2.3', '1.2.4', '2.0.0', '0.1.0-beta.1', '3.0.0+build'];
const poolSpec: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom(...POOL), fc.constantFrom('', '=', '==', '===', '^', '>=', '~'), pad)
  .map(([v, o, p]) => `${p}${o}${v}${p}`);
const mixedSpec: fc.Arbitrary<string> = fc.oneof(poolSpec, fc.string({ maxLength: 8 }), fc.constantFrom('*', '', 'latest'));

// Feature: scan-pipeline, Property 15: Version selection does not depend on spec order
// Validates: Requirements 7.13
describe('Property 15: Version selection does not depend on spec order', () => {
  it('returns the same Selected_Version, Version_Basis and notes for every permutation of the specs', () => {
    const input = fc.record({
      eco: ecosystem,
      specs: fc.array(mixedSpec, { maxLength: 8 }),
      versions: fc.array(fc.constantFrom(...POOL, '9.9.9', ''), { maxLength: 6 }),
      defaultVersion: fc.option(fc.constantFrom(...POOL, '9.9.9', ''), { nil: null }),
    });
    fc.assert(
      fc.property(
        input.chain((r) =>
          fc.record({
            r: fc.constant(r),
            perm: fc.shuffledSubarray(
              r.specs.map((_, i) => i),
              { minLength: r.specs.length, maxLength: r.specs.length },
            ),
            versionsPerm: fc.shuffledSubarray(
              r.versions.map((_, i) => i),
              { minLength: r.versions.length, maxLength: r.versions.length },
            ),
          }),
        ),
        ({ r, perm }) => {
          const pinsOf = (specs: readonly string[]): string[] =>
            specs.map((s) => exactPin(s, r.eco)).filter((p): p is string => p !== null);
          const original = selectVersion(pinsOf(r.specs), r.versions, r.defaultVersion);
          const permuted = selectVersion(
            pinsOf(perm.map((i) => r.specs[i] as string)),
            r.versions,
            r.defaultVersion,
          );
          expect(permuted).toEqual(original);
        },
      ),
      cfg(),
    );
  });
});
