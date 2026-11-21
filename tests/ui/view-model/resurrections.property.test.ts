// Feature: resurrect, Property RS-P10: Curated lookup is invariant under equivalent spellings
// Validates: Requirements 7.4, 7.5
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Ecosystem } from '../../../core';
import { CURATED_ENTRIES, loadCurated, lookupCurated, type CuratedEntry } from '../../../view-model/resurrections';
import { cfg } from '../../support/fc-config';

const ECOS: readonly Ecosystem[] = ['npm', 'pypi', 'cargo'];

// Independent oracle: character-by-character, no regexes.
function oracleNormalize(eco: Ecosystem, name: string): string {
  if (eco === 'npm') return name;
  let out = '';
  for (const ch of name) {
    const lower = ch.toLowerCase();
    if (eco === 'cargo') {
      out += lower === '_' ? '-' : lower;
    } else {
      const sep = lower === '-' || lower === '_' || lower === '.';
      if (sep) {
        if (!out.endsWith('-')) out += '-';
      } else {
        out += lower;
      }
    }
  }
  return out;
}

const oracleKey = (eco: Ecosystem, name: string) => `${eco}|${oracleNormalize(eco, name)}`;

const ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
const word = fc.array(fc.constantFrom(...ALNUM), { minLength: 1, maxLength: 6 }).map((c) => c.join(''));
const npmName = fc
  .tuple(fc.option(word, { nil: null }), word, fc.constantFrom('', '-x', '.y', '_z'))
  .map(([scope, base, tail]) => (scope === null ? '' : `@${scope}/`) + base + tail);
const pypiName = fc.array(word, { minLength: 1, maxLength: 3 }).map((w) => w.join('-'));
const cargoName = fc
  .tuple(fc.constantFrom('a', 'b', 'S', 'T', 'x'), fc.array(fc.constantFrom('a', 'B', '0', '-', '_', 'z'), { maxLength: 8 }))
  .map(([h, rest]) => h + rest.join(''));
const nameFor = (eco: Ecosystem): fc.Arbitrary<string> => (eco === 'npm' ? npmName : eco === 'pypi' ? pypiName : cargoName);
const ecosystem = fc.constantFrom(...ECOS);
const seeds = fc.array(fc.nat(1000), { minLength: 1, maxLength: 24 });

/** An equivalent spelling of `name`, shaped by `seeds`. */
function variantOf(eco: Ecosystem, name: string, s: readonly number[]): string {
  if (eco === 'npm') return name;
  let i = 0;
  const next = () => s[i++ % s.length]!;
  let out = '';
  for (const ch of name) {
    const flip = next() % 2 === 0;
    if (eco === 'pypi' && (ch === '-' || ch === '_' || ch === '.')) {
      const run = 1 + (next() % 3);
      for (let k = 0; k < run; k++) out += '-_.'[next() % 3];
    } else if (eco === 'cargo' && (ch === '-' || ch === '_')) {
      out += flip ? '-' : '_';
    } else {
      out += flip ? ch.toUpperCase() : ch.toLowerCase();
    }
  }
  return out;
}

const rawEntry = (ecosystem: Ecosystem, from: string) => ({
  ecosystem,
  from,
  to: ['alt'],
  why: 'It is no longer maintained.',
  source: 'https://example.com/notice',
});

const rawList = fc
  .array(ecosystem.chain((e) => nameFor(e).map((from) => rawEntry(e, from))), { maxLength: 8 })
  .chain((base) =>
    // Re-add some entries under an equivalent spelling so duplicates after normalization occur.
    fc
      .array(fc.tuple(fc.nat(), seeds), { maxLength: 4 })
      .map((dups) => {
        const extra = base.length === 0 ? [] : dups.map(([n, s]) => {
          const b = base[n % base.length]!;
          return rawEntry(b.ecosystem, variantOf(b.ecosystem, b.from, s));
        });
        return [...base, ...extra];
      }),
  );

/** Lookup built over a loaded list, using only the oracle. First entry per key wins. */
function oracleLookup(list: readonly CuratedEntry[]) {
  const map = new Map<string, CuratedEntry>();
  for (const e of list) {
    const k = oracleKey(e.ecosystem, e.from);
    if (!map.has(k)) map.set(k, e);
  }
  return (eco: Ecosystem, name: string): CuratedEntry | null => map.get(oracleKey(eco, name)) ?? null;
}

describe('RS-P10 curated lookup invariance', () => {
  it('RS-P10 loaded lists hold one entry per normalized from, and every equivalent spelling resolves to it', () => {
    fc.assert(
      fc.property(rawList, seeds, (raw, s) => {
        const list = loadCurated({ entries: raw });
        const keys = list.map((e) => oracleKey(e.ecosystem, e.from));
        expect(new Set(keys).size).toBe(keys.length);
        const find = oracleLookup(list);
        for (const e of list) {
          expect(find(e.ecosystem, variantOf(e.ecosystem, e.from, s))).toBe(e);
        }
      }),
      cfg(),
    );
  });

  it('RS-P10 a name whose normalized form is not a from gives null in a loaded list', () => {
    fc.assert(
      fc.property(rawList, ecosystem.chain((e) => fc.tuple(fc.constant(e), nameFor(e))), (raw, [eco, probe]) => {
        const list = loadCurated({ entries: raw });
        const present = list.some((e) => oracleKey(e.ecosystem, e.from) === oracleKey(eco, probe));
        expect(oracleLookup(list)(eco, probe) !== null).toBe(present);
      }),
      cfg(),
    );
  });

  it('RS-P10 lookupCurated returns the same entry for every equivalent spelling of a shipped from', () => {
    expect(CURATED_ENTRIES.length).toBeGreaterThan(0);
    fc.assert(
      fc.property(fc.constantFrom(...CURATED_ENTRIES), seeds, (entry, s) => {
        expect(lookupCurated(entry.ecosystem, entry.from)).toBe(entry);
        expect(lookupCurated(entry.ecosystem, variantOf(entry.ecosystem, entry.from, s))).toBe(entry);
      }),
      cfg(),
    );
  });

  it('RS-P10 lookupCurated agrees with the oracle on arbitrary names, null when the normalized form is not a from', () => {
    const find = oracleLookup(CURATED_ENTRIES);
    fc.assert(
      fc.property(
        ecosystem.chain((e) => fc.tuple(fc.constant(e), fc.oneof(nameFor(e), fc.string({ maxLength: 12 })))),
        ([eco, name]) => {
          expect(lookupCurated(eco, name)).toBe(find(eco, name));
        },
      ),
      cfg(),
    );
  });

  it('RS-P10 an npm name is looked up exactly, so a different case is not an equivalent spelling', () => {
    const npm = CURATED_ENTRIES.filter((e) => e.ecosystem === 'npm' && e.from !== e.from.toUpperCase());
    fc.assert(
      fc.property(fc.constantFrom(...npm), (entry) => {
        const upper = entry.from.toUpperCase();
        const expected = CURATED_ENTRIES.find((e) => e.ecosystem === 'npm' && e.from === upper) ?? null;
        expect(lookupCurated('npm', upper)).toBe(expected);
      }),
      cfg(),
    );
  });
});
