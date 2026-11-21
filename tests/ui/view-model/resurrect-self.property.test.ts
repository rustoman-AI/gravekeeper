// Feature: resurrect, Property RS-P5: A package is never suggested as its own replacement
// Validates: Requirements 7.7
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Ecosystem } from '../../../core';
import { buildResurrectModel, type CuratedLookup } from '../../../view-model/resurrect';
import type { CuratedEntry } from '../../../view-model/resurrections';
import type { ParsedScanResult } from '../../../view-model/types';
import { arbEcosystem, makeRow, SLOT_CASES } from '../../support/arbitraries/resurrect';
import { cfg } from '../../support/fc-config';
import { buildScanResult } from '../../support/ui/scan-result-builder';

const emptyResult = buildScanResult([]) as unknown as ParsedScanResult;

/** Independent oracle: registry-equivalent spelling, written char by char. */
function oracle(eco: Ecosystem, name: string): string {
  if (eco === 'npm') return name;
  let out = '';
  for (const ch of name.toLowerCase()) {
    const sep = eco === 'pypi' ? ch === '-' || ch === '_' || ch === '.' : ch === '_' || ch === '-';
    if (sep) {
      if (eco === 'cargo' || !out.endsWith('-')) out += '-';
    } else out += ch;
  }
  return out;
}

const WORDS: readonly string[] = ['request', 'got', 'left', 'pad', 'bincode', 'serde', 'json', 'a', 'x1', 'tqdm'];
const OTHERS: readonly string[] = ['axios', 'node-fetch', 'wincode', 'httpx', 'ureq', 'zzz-other'];

const arbBase = fc.array(fc.constantFrom(...WORDS), { minLength: 1, maxLength: 3 });

const arbSep = (eco: Ecosystem): fc.Arbitrary<string> =>
  eco === 'pypi' ? fc.constantFrom('-', '_', '.', '--', '-_.', '__') : eco === 'cargo' ? fc.constantFrom('-', '_') : fc.constant('-');

const arbCase = (eco: Ecosystem): fc.Arbitrary<(s: string) => string> =>
  eco === 'npm'
    ? fc.constant((s: string) => s)
    : fc.constantFrom((s: string) => s, (s: string) => s.toUpperCase(), (s: string) => s[0]!.toUpperCase() + s.slice(1));

interface Scenario {
  readonly eco: Ecosystem;
  readonly name: string;
  readonly tos: readonly string[];
  readonly allSelf: boolean;
  readonly plotCase: (typeof SLOT_CASES)[number];
}

const arbScenario: fc.Arbitrary<Scenario> = arbEcosystem.chain((eco) =>
  fc
    .record({
      base: arbBase,
      // The row name is spelled in the canonical form of its ecosystem.
      rowSep: fc.constant('-'),
      variants: fc.array(fc.tuple(arbBase, arbSep(eco), arbCase(eco)), { maxLength: 4 }),
      useVariantsOfRow: fc.array(fc.tuple(arbSep(eco), arbCase(eco)), { maxLength: 3 }),
      others: fc.uniqueArray(fc.constantFrom(...OTHERS), { maxLength: 2 }),
      withName: fc.boolean(),
      plotCase: fc.constantFrom(...SLOT_CASES),
      order: fc.nat(1000),
    })
    .map(({ base, rowSep, useVariantsOfRow, variants, others, withName, plotCase, order }) => {
      const name = base.join(rowSep);
      const respelled = useVariantsOfRow.map(([sep, up]) => up(base.join(sep)));
      const unrelated = variants.map(([b, sep, up]) => up(b.join(sep)));
      const tos = [...(withName ? [name] : []), ...respelled, ...unrelated, ...others];
      if (tos.length === 0) tos.push(name);
      const k = order % tos.length;
      const rotated = [...tos.slice(k), ...tos.slice(0, k)];
      const unique = [...new Set(rotated)];
      const allSelf = unique.every((t) => oracle(eco, t) === oracle(eco, name));
      return { eco, name, tos: unique, allSelf, plotCase };
    }),
);

function run(s: Scenario) {
  const row = makeRow({ name: s.name, ecosystem: s.eco, plotCase: s.plotCase, hints: [] });
  const entry: CuratedEntry = {
    ecosystem: s.eco,
    from: s.name,
    to: s.tos,
    why: 'The maintainers point to alternatives.',
    source: 'https://example.com/source',
    evidence: 'https://example.com/evidence',
  };
  const curated: CuratedLookup = (e, n) => (e === s.eco && n === s.name ? entry : null);
  return buildResurrectModel(row, emptyResult, curated);
}

describe('RS-P5 A package is never suggested as its own replacement', () => {
  it('RS-P5 no alternative normalises to the name of the row', () => {
    fc.assert(
      fc.property(arbScenario, (s) => {
        const model = run(s);
        expect(model).not.toBeNull();
        const self = oracle(s.eco, s.name);
        for (const sug of model!.suggestions) {
          for (const alt of sug.alternatives) expect(oracle(s.eco, alt.name)).not.toBe(self);
        }
      }),
      cfg(),
    );
  });

  it('RS-P5 when every alternative is a self-reference the suggestion is absent and the fallback shows', () => {
    fc.assert(
      fc.property(
        arbScenario.filter((s) => s.allSelf),
        (s) => {
          const model = run(s);
          expect(model).not.toBeNull();
          expect(model!.suggestions).toEqual([]);
          expect(model!.fallback).not.toBeNull();
        },
      ),
      cfg(),
    );
  });

  it('RS-P5 an alternative that is not a self-reference is kept', () => {
    fc.assert(
      fc.property(
        arbScenario.filter((s) => !s.allSelf),
        (s) => {
          const model = run(s);
          const self = oracle(s.eco, s.name);
          const names = model!.suggestions.flatMap((x) => x.alternatives.map((a) => a.name));
          // Every listed name is one of the entry's names, and a name that is valid and not a self-reference appears.
          for (const n of names) expect(s.tos).toContain(n);
          const valid = s.tos.filter((t) => oracle(s.eco, t) !== self && oracle(s.eco, t) === t && !/[A-Z_.]|--/.test(t));
          for (const t of valid) expect(names).toContain(t);
        },
      ),
      cfg(),
    );
  });
});
