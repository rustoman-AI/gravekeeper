// Feature: resurrect, Property RS-P3: Every suggested name is validated
// Validates: Requirements 7.2, 7.6, 10.1, 10.10
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Ecosystem } from '../../../core';
import { buildResurrectModel } from '../../../view-model/resurrect';
import { isValidName } from '../../../view-model/resurrect-names';
import type { CuratedEntry } from '../../../view-model/resurrections';
import type { ParsedScanResult } from '../../../view-model/types';
import { cfg } from '../../support/fc-config';
import { arbEcosystem, arbOrigin, arbScope, makeRow, SLOT_CASES } from '../../support/arbitraries/resurrect';

// Local generators: curated entries that hold hostile names, injected after loading.
const HOSTILE: readonly string[] = [
  'a b', 'a;b', '$(x)', '`x`', '-rf', '--save-dev', '~tilde', 'é-ünï', '日本語', 'a\nb', '', ' ',
  'x'.repeat(300), 'a'.repeat(65) + 'b', 'a|b', 'a&b', '../x', "a'b", 'a"b', '\u202eabc', 'A_B', '@scope/UPPER',
];
const VALID: readonly string[] = ['got', 'axios', 'node-fetch', 'wincode', 'serde-json', 'requests', 'httpx', '@scope/pkg'];

const arbHostileName = fc.oneof(
  fc.constantFrom(...HOSTILE),
  fc.string({ maxLength: 20 }),
  fc.string({ unit: 'grapheme', maxLength: 10 }),
  fc.tuple(fc.constantFrom('-', '~', ' ', ';', '$(', '`'), fc.constantFrom('got', 'abc', 'x')).map(([p, w]) => p + w),
);
const arbToNames = fc.uniqueArray(fc.oneof(arbHostileName, fc.constantFrom(...VALID)), { minLength: 1, maxLength: 4 });

const arbCase = arbEcosystem.chain((ecosystem) =>
  fc.record({
    ecosystem: fc.constant(ecosystem),
    plotCase: fc.constantFrom(...SLOT_CASES),
    rowName: fc.oneof(fc.constantFrom('request', 'bincode', 'a-b', 'x'), arbHostileName),
    to: arbToNames,
    origins: fc.array(arbOrigin(ecosystem), { minLength: 1, maxLength: 3 }),
    scopes: fc.array(arbScope, { minLength: 1, maxLength: 2 }),
  }),
);

const EMPTY_RESULT = { notes: [] } as unknown as ParsedScanResult;

function namesIn(
  model: NonNullable<ReturnType<typeof buildResurrectModel>>,
): { alternatives: string[]; codes: string[]; tokens: string[] } {
  const alternatives: string[] = [];
  const codes: string[] = [];
  const tokens: string[] = [];
  for (const s of model.suggestions) {
    for (const alt of s.alternatives) {
      alternatives.push(alt.name);
      for (const b of alt.blocks) {
        for (const seg of b.lead ?? []) if (seg.kind === 'code') codes.push(seg.text);
        for (const line of b.lines) tokens.push(...line.split(' '));
      }
    }
  }
  return { alternatives, codes, tokens };
}

describe('RS-P3 resurrect names property', () => {
  it('RS-P3: every alternative and code name is valid; names that fail never appear', () => {
    fc.assert(
      fc.property(arbCase, ({ ecosystem, plotCase, rowName, to, origins, scopes }) => {
        const row = makeRow({ ecosystem, plotCase, name: rowName, origins, scopes });
        const entry: CuratedEntry = {
          ecosystem,
          from: rowName,
          to,
          why: 'The maintainers point to alternatives.',
          source: 'https://example.com/source',
        };
        const lookup = (e: Ecosystem, n: string): CuratedEntry | null => (e === ecosystem && n === rowName ? entry : null);
        const model = buildResurrectModel(row, EMPTY_RESULT, lookup);
        expect(model).not.toBeNull();
        const { alternatives, codes, tokens } = namesIn(model!);

        for (const n of alternatives) expect(isValidName(ecosystem, n)).toBe(true);
        // Lead sentences may cite a manifest path as a code segment; it must equal an origin path exactly.
        const originPaths = new Set(row.manifestOrigins.map((o) => o.path));
        for (const n of codes) {
          if (originPaths.has(n)) continue;
          expect(isValidName(ecosystem, n)).toBe(true);
        }

        const bad = to.filter((n) => !isValidName(ecosystem, n) && !to.some((m) => m === n && isValidName(ecosystem, m)));
        for (const n of bad) {
          expect(alternatives).not.toContain(n);
          expect(codes).not.toContain(n);
          if (n !== '' && !n.includes(' ')) expect(tokens).not.toContain(n);
        }
        if (!isValidName(ecosystem, rowName)) {
          expect(codes).not.toContain(rowName);
        }
      }),
      cfg(),
    );
  });
});