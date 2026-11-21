// Feature: resurrect, Property RS-P1: The Resurrect_Model is deterministic
// Validates: Requirements 10.11
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildResurrectModel, type CuratedLookup } from '../../../view-model/resurrect';
import type { PackageRow, ParsedScanResult } from '../../../view-model/types';
import { arbAnyRow, arbCuratedEntry, arbSlotRow } from '../../support/arbitraries/resurrect';
import { cfg } from '../../support/fc-config';
import { buildScanResult, noteOf } from '../../support/ui/scan-result-builder';

const REPOS: readonly string[] = [
  'https://github.com/o/r',
  'https://github.com/o/r.git',
  'javascript:alert(1)',
  'http://evil.example/x',
  'not a url',
];

interface Scenario {
  readonly row: PackageRow;
  readonly result: ParsedScanResult;
  readonly curated: CuratedLookup;
  readonly otherNotes: readonly ParsedScanResult['notes'][number][];
}

// Notes of other packages and of other codes, and the note of the row itself (one note per package key).
const arbScenario: fc.Arbitrary<Scenario> = fc
  .oneof(arbSlotRow, arbAnyRow)
  .chain((row) =>
    fc.record({
      row: fc.constant(row),
      entry: fc.option(arbCuratedEntry(row.ecosystem, row.name), { nil: null }),
      ownRepo: fc.option(fc.constantFrom(...REPOS), { nil: null }),
      others: fc.uniqueArray(fc.constantFrom('a', 'b', 'c', 'd'), { maxLength: 4 }),
      otherRepo: fc.constantFrom(...REPOS),
    }),
  )
  .map(({ row, entry, ownRepo, others, otherRepo }) => {
    const notes = [
      ...(ownRepo === null
        ? []
        : [noteOf('source-repo-unverified', { ecosystem: row.ecosystem, name: row.name, sourceRepo: ownRepo })]),
      ...others.map((n) =>
        noteOf('source-repo-unverified', { ecosystem: row.ecosystem, name: `other-${n}`, sourceRepo: otherRepo }),
      ),
    ];
    const result = { ...buildScanResult([]), notes } as unknown as ParsedScanResult;
    const curated: CuratedLookup = (eco, name) => (entry !== null && eco === entry.ecosystem && name === entry.from ? entry : null);
    return { row, result, curated, otherNotes: notes };
  });

/** A deep copy with new object identities and every object's keys in reverse order. */
function reverseKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(reverseKeys) as unknown as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).reverse()) out[k] = reverseKeys((value as Record<string, unknown>)[k]);
    return out as T;
  }
  return value;
}

describe('RS-P1 The Resurrect_Model is deterministic', () => {
  it('RS-P1 building the model twice gives deeply equal values', () => {
    fc.assert(
      fc.property(arbScenario, ({ row, result, curated }) => {
        expect(buildResurrectModel(row, result, curated)).toEqual(buildResurrectModel(row, result, curated));
      }),
      cfg(),
    );
  });

  it('RS-P1 the model does not depend on object identity or key order of the inputs', () => {
    fc.assert(
      fc.property(arbScenario, ({ row, result, curated }) => {
        const expected = buildResurrectModel(row, result, curated);
        const copy = buildResurrectModel(reverseKeys(row), reverseKeys(result), curated);
        expect(copy).toEqual(expected);
      }),
      cfg(),
    );
  });

  it('RS-P1 permuting the notes of the scan does not change the model of a row', () => {
    fc.assert(
      fc.property(arbScenario, fc.nat(8), ({ row, result, curated }, shift) => {
        const notes = result.notes;
        const k = notes.length === 0 ? 0 : shift % notes.length;
        const rotated = [...notes.slice(k), ...notes.slice(0, k)];
        const permuted = [
          { ...result, notes: rotated },
          { ...result, notes: [...notes].reverse() },
        ];
        const expected = buildResurrectModel(row, result, curated);
        for (const p of permuted) expect(buildResurrectModel(row, p, curated)).toEqual(expected);
      }),
      cfg(),
    );
  });

  it('RS-P1 the model survives a JSON round trip unchanged', () => {
    fc.assert(
      fc.property(arbScenario, ({ row, result, curated }) => {
        const model = buildResurrectModel(row, result, curated);
        const text = JSON.stringify(model);
        expect(text).toBeDefined();
        expect(JSON.parse(text)).toEqual(model);
      }),
      cfg(),
    );
  });
});
