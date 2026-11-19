import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cargoToSemverRange } from '../../../pipeline/mapping/range-cargo';

describe('cargoToSemverRange accepted forms', () => {
  it.each([
    ['1.2.3', '^1.2.3'],
    ['0.2', '^0.2'],
    ['0.0.3', '^0.0.3'],
    ['^1.2', '^1.2'],
    ['~1.2', '~1.2'],
    ['~1', '~1'],
    ['=1.2', '=1.2'],
    ['>1.2', '>1.2'],
    ['>=1.2', '>=1.2'],
    ['<1.5', '<1.5'],
    ['<=1.2', '<=1.2'],
    ['>= 1.2, <1.5', '>=1.2 <1.5'],
    ['  ^ 1.2 ,<  1.5 ', '^1.2 <1.5'],
    ['1.*', '1.*'],
    ['1.2.*', '1.2.*'],
    ['=1.*', '=1.*'],
    ['*', '*'],
    ['1.2.3-beta.1+build.5', '^1.2.3-beta.1+build.5'],
  ])('maps %j to %j', (input, expected) => {
    expect(cargoToSemverRange(input)).toBe(expected);
  });
});

describe('cargoToSemverRange rejected forms', () => {
  it.each([
    ['empty string', ''],
    ['blank part', '  '],
    ['empty part', '>=1.2,,<1.5'],
    ['trailing comma', '>=1.2,'],
    ['leading comma', ',1.2'],
    ['||', '1.2 || 1.3'],
    ['hyphen range', '1.2 - 1.5'],
    ['leading v', 'v1.2'],
    ['x wildcard', '1.x'],
    ['X wildcard', '1.X'],
    ['wildcard with operator', '>=1.*'],
    ['caret wildcard', '^*'],
    ['space-separated comparators', '>=1.2 <1.5'],
    ['leading zero', '01.2'],
    ['prerelease without full triple', '1.2-beta'],
    ['four parts', '1.2.3.4'],
    ['junk', 'latest'],
  ])('rejects %s', (_name, input) => {
    expect(cargoToSemverRange(input)).toBeNull();
  });

  it('returns null for a non-string input without throwing', () => {
    expect(cargoToSemverRange(undefined as unknown as string)).toBeNull();
  });
});

describe('range-cargo.ts header', () => {
  it('starts with the mapping table header', () => {
    const file = resolve(__dirname, '../../../pipeline/mapping/range-cargo.ts');
    const head = readFileSync(file, 'utf8').split('\n').slice(0, 20).join('\n');
    expect(head).toContain('| Cargo part');
    expect(head).toContain('semver comparator');
  });
});
