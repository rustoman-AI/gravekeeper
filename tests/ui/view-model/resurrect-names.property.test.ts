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

// Fixed words of the command grammar; every other token on a command line is a name.
const FIXED_WORDS: ReadonlySet<string> = new Set([
  'npm', 'uninstall', 'install', '--save-dev', '--save-optional', '--save-peer',
  'pip', 'poetry', 'remove', 'add', 'cargo', '--dev', '--build', '--optional',
]);

type CaseInput = {
  ecosystem: Ecosystem;
  plotCase: (typeof SLOT_CASES)[number];
  rowName: string;
  to: string[];
  origins: NonNullable<Parameters<typeof makeRow>[0]>['origins'];
  scopes: NonNullable<Parameters<typeof makeRow>[0]>['scopes'];
};

function namesIn(
  model: NonNullable<ReturnType<typeof buildResurrectModel>>,
): { alternatives: string[]; codes: string[]; lines: string[][] } {
  const alternatives: string[] = [];
  const codes: string[] = [];
  const lines: string[][] = [];
  for (const s of model.suggestions) {
    for (const alt of s.alternatives) {
      alternatives.push(alt.name);
      for (const b of alt.blocks) {
        for (const seg of b.lead ?? []) if (seg.kind === 'code') codes.push(seg.text);
        for (const line of b.lines) lines.push(line.split(' '));
      }
    }
  }
  return { alternatives, codes, lines };
}

function checkCase({ ecosystem, plotCase, rowName, to, origins, scopes }: CaseInput): void {
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
  const { alternatives, codes, lines } = namesIn(model!);

  for (const n of alternatives) expect(isValidName(ecosystem, n)).toBe(true);
  // Lead sentences may cite a manifest path as a code segment; it must equal an origin path exactly.
  const originPaths = new Set(row.manifestOrigins.map((o) => o.path));
  for (const n of codes) {
    if (originPaths.has(n)) continue;
    expect(isValidName(ecosystem, n)).toBe(true);
  }

  const bad = to.filter((n) => !isValidName(ecosystem, n));
  for (const n of bad) {
    expect(alternatives).not.toContain(n);
    expect(codes).not.toContain(n);
  }

  // Name positions are the tokens that are not fixed command words (e.g. the --save-dev scope flag is not a name).
  const rowTokens = rowName.split(' ');
  for (const line of lines) {
    for (const tok of line.filter((x) => !FIXED_WORDS.has(x))) {
      expect(rowTokens.includes(tok) || alternatives.includes(tok)).toBe(true);
      if (!rowTokens.includes(tok)) expect(bad).not.toContain(tok);
    }
  }
  if (!isValidName(ecosystem, rowName)) {
    expect(codes).not.toContain(rowName);
  }
}

describe('RS-P3 resurrect names property', () => {
  it('RS-P3: every alternative and code name is valid; names that fail never appear', () => {
    fc.assert(fc.property(arbCase, checkCase), cfg());
  });

  it('RS-P3 example: the --save-dev scope flag is not an invalid name', () => {
    checkCase({
      ecosystem: 'npm',
      plotCase: 'buried',
      rowName: 'request',
      to: ['got', '--save-dev', ''],
      origins: [{ path: 'package.json', format: 'package.json', pyprojectTool: null }],
      scopes: ['dev'],
    } as unknown as CaseInput);
  });
});