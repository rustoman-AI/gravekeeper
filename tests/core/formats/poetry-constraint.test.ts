import { describe, expect, it } from 'vitest';
import { poetryToPep440 } from '../../../core/formats/poetry-constraint';

/** Requirements 6.1 to 6.9 and the design "Poetry translation table". */

const okCases: ReadonlyArray<readonly [string, string]> = [
  // caret (6.2)
  ['^1.2.3', '>=1.2.3,<2.0.0'],
  ['^0.2.3', '>=0.2.3,<0.3.0'],
  ['^0.0.3', '>=0.0.3,<0.0.4'],
  ['^1.2', '>=1.2,<2.0'],
  ['^0.0', '>=0.0,<0.1'],
  ['^0', '>=0,<1'],
  ['^1', '>=1,<2'],
  // tilde (6.3)
  ['~1.2.3', '>=1.2.3,<1.3.0'],
  ['~1.2', '>=1.2,<1.3'],
  ['~1', '>=1,<2'],
  ['~0', '>=0,<1'],
  // wildcard and bare (6.4, 6.5)
  ['1.*', '==1.*'],
  ['1.2.*', '==1.2.*'],
  ['*', '*'],
  ['1.2.3', '==1.2.3'],
  ['1.2', '==1.2'],
  // comparison and multi-term (6.1, 6.6)
  ['>= 1.2, < 2.0', '>=1.2,<2.0'],
  ['>=1.2 <2.0', '>=1.2,<2.0'],
  ['!=1.2.*', '!=1.2.*'],
  ['~=1.4.0', '~=1.4.0'],
  ['^1.2, !=1.2.5', '>=1.2,<2.0,!=1.2.5'],
];

describe('poetryToPep440', () => {
  describe('ok outcomes', () => {
    it.each(okCases)('%s -> %s', (input, spec) => {
      expect(poetryToPep440(input)).toEqual({ kind: 'ok', spec });
    });

    it('treats an empty or blank constraint as any version (6.9)', () => {
      expect(poetryToPep440('')).toEqual({ kind: 'ok', spec: '*' });
      expect(poetryToPep440('   ')).toEqual({ kind: 'ok', spec: '*' });
    });

    it('drops * terms from a multi-term constraint', () => {
      expect(poetryToPep440('*, ^1')).toEqual({ kind: 'ok', spec: '>=1,<2' });
    });
  });

  describe('alternatives outcomes (6.7)', () => {
    it.each(['^1 || ^2', '^1 | ^2'])('%s', (input) => {
      expect(poetryToPep440(input)).toEqual({ kind: 'alternatives' });
    });
  });

  describe('unsupported outcomes (6.8)', () => {
    it.each([
      ['an empty term between commas', '^1,,^2'],
      ['a lone comma', ','],
      ['a trailing comma', '^1,'],
      ['a leading v', 'v1'],
      ['x as wildcard', '1.x'],
      ['wildcard with >=', '>=1.*'],
      ['a pre-release suffix', '^1.2.3rc1'],
      ['too many parts for caret', '^1.2.3.4'],
      ['~= with one part', '~=1'],
      ['a ten-digit part', '1.1234567890'],
      ['a lone operator', '>='],
    ])('%s: %s', (_label, input) => {
      expect(poetryToPep440(input)).toEqual({ kind: 'unsupported' });
    });

    it('accepts a nine-digit part', () => {
      expect(poetryToPep440('^123456789')).toEqual({ kind: 'ok', spec: '>=123456789,<123456790' });
    });
  });
});
