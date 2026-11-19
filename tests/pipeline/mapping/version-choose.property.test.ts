import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { RANGE_MAX_LENGTH } from '../../../pipeline/constants';
import { compareCodePoints } from '../../../pipeline/mapping/compare-code-points';
import { cargoToSemverRange } from '../../../pipeline/mapping/range-cargo';
import { resolveRange } from '../../../pipeline/mapping/range-resolve';
import { chooseVersion } from '../../../pipeline/mapping/version-choose';
import { exactPin } from '../../../pipeline/mapping/version-select';
import { cfg } from '../../support/fc-config';

const ecosystem = fc.constantFrom('npm', 'pypi', 'cargo');
const num = fc.integer({ min: 0, max: 4 });
const full = fc.tuple(num, num, num).map(([a, b, c]) => `${a}.${b}.${c}`);
const versionList = fc.array(full, { maxLength: 15 });
const defaultVersion = fc.option(full, { nil: null });
const pin = fc.tuple(fc.constantFrom('', '=', '==', '==='), full).map(([p, v]) => p + v);
const range = fc
  .tuple(fc.constantFrom('^', '~', '>=', '>', '<', '<=', ''), full, fc.constantFrom('', ' <9.0.0', ', <9.0.0', ' || ^1.0.0'))
  .map(([op, v, tail]) => op + v + tail);
const longString = fc.string({ unit: 'binary', minLength: RANGE_MAX_LENGTH, maxLength: RANGE_MAX_LENGTH + 60 });
const spec = fc.oneof(
  pin,
  range,
  fc.constantFrom('', ' ', '\t\n', '*', 'latest'),
  fc.string({ unit: 'binary', maxLength: 30 }),
  longString,
);
const specList = fc.array(spec, { maxLength: 6 });

function permute<T>(items: readonly T[], stream: Iterable<number>): T[] {
  const out = [...items];
  const it = stream[Symbol.iterator]();
  for (let i = out.length - 1; i > 0; i--) {
    const j = (it.next().value as number) % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

describe('Property 5: Version choice does not depend on spec order', () => {
  // Feature: scan-accuracy, Property 5: Version choice does not depend on spec order
  // Validates: Requirements 3.8, 3.9, 3.15
  it('returns the same selection, basis and notes for any permutation of the specs', () => {
    fc.assert(
      fc.property(ecosystem, specList, versionList, defaultVersion, fc.infiniteStream(fc.nat()), (eco, specs, versions, def, stream) => {
        const expected = chooseVersion(eco, specs, versions, def);
        const actual = chooseVersion(eco, permute(specs, stream), versions, def);
        expect(actual).toEqual(expected);
      }),
      cfg(),
    );
  });

  // Feature: scan-accuracy, Property 5: Version choice does not depend on spec order
  // Validates: Requirements 3.8, 3.9
  it('never resolves a range when at least one Exact_Pin is present', () => {
    fc.assert(
      fc.property(ecosystem, fc.array(pin, { minLength: 1, maxLength: 3 }), specList, versionList, defaultVersion, (eco, pins, others, versions, def) => {
        const specs = [...pins, ...others];
        fc.pre(specs.some((s) => exactPin(s, eco) !== null));
        const result = chooseVersion(eco, specs, versions, def);
        expect(result.basis === 'pinned' || result.basis === 'default' || result.basis === null).toBe(true);
        expect(result.notes.some((n) => n.code === 'range-unresolved')).toBe(false);
      }),
      cfg(),
    );
  });
});

describe('Property 7: Resolution is total and falls back with one note', () => {
  const anySpec = fc.oneof(spec, fc.string({ unit: 'binary', maxLength: 600 }), fc.constantFrom('', '   ', '\u2014', '\u0000'));

  // Feature: scan-accuracy, Property 7: Resolution is total and falls back with one note
  // Validates: Requirements 3.16, 4.11
  it('cargoToSemverRange and chooseVersion do not throw for any string', () => {
    fc.assert(
      fc.property(fc.oneof(ecosystem, fc.string({ maxLength: 8 })), fc.array(anySpec, { maxLength: 6 }), versionList, defaultVersion, (eco, specs, versions, def) => {
        for (const s of specs) {
          expect(() => cargoToSemverRange(s)).not.toThrow();
        }
        expect(() => chooseVersion(eco, specs, versions, def)).not.toThrow();
      }),
      cfg(),
    );
  });

  // Feature: scan-accuracy, Property 7: Resolution is total and falls back with one note
  // Validates: Requirements 3.6, 3.7, 3.16
  it('an unresolved outcome falls back to the default with exactly one range-unresolved note and sorted, cut ranges', () => {
    fc.assert(
      fc.property(ecosystem, fc.array(anySpec, { maxLength: 6 }), versionList, defaultVersion, (eco, specs, versions, def) => {
        const result = chooseVersion(eco, specs, versions, def);
        const trimmed = specs.filter((s) => exactPin(s, eco) === null && s.trim() !== '').map((s) => s.trim());
        const hasPin = specs.some((s) => exactPin(s, eco) !== null);
        const ranges = [...new Set(trimmed)].sort(compareCodePoints);
        const unresolved = !hasPin && ranges.length > 0 && resolveRange(eco, ranges, versions).kind === 'unresolved';
        const unresolvedNotes = result.notes.filter((n) => n.code === 'range-unresolved');

        if (!unresolved) {
          expect(unresolvedNotes).toHaveLength(0);
          return;
        }
        expect(unresolvedNotes).toHaveLength(1);
        const note = unresolvedNotes[0] as { code: 'range-unresolved'; ranges: string[] };
        if (def === null || def === '') {
          expect(result.basis).toBeNull();
          expect(result.selected).toBeNull();
          expect(result.notes.some((n) => n.code === 'no-default-version')).toBe(true);
        } else {
          expect(result.basis).toBe('default');
          expect(result.selected).toBe(def);
        }
        for (let i = 1; i < note.ranges.length; i++) {
          expect(compareCodePoints(note.ranges[i - 1] as string, note.ranges[i] as string)).toBeLessThanOrEqual(0);
        }
        for (const r of note.ranges) expect(Array.from(r).length).toBeLessThanOrEqual(RANGE_MAX_LENGTH);
      }),
      cfg(),
    );
  });
});
