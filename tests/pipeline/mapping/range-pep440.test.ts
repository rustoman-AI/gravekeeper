import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pepSatisfies } from '../../../pipeline/mapping/range-pep440';

// Validates: Requirements 10.9
describe('pepSatisfies prefix zero padding', () => {
  it('pads a shorter candidate for ==V.*', () => {
    expect(pepSatisfies('1', '==1.0.*')).toBe(true);
    expect(pepSatisfies('1.0.0', '==1.0.*')).toBe(true);
    expect(pepSatisfies('1.1', '==1.0.*')).toBe(false);
  });

  it('pads a shorter candidate for !=V.*', () => {
    expect(pepSatisfies('1', '!=1.0.*')).toBe(false);
    expect(pepSatisfies('1.1', '!=1.0.*')).toBe(true);
  });

  it('allows whitespace around the operator and clauses', () => {
    expect(pepSatisfies('1', '== 1.0.* , >=0')).toBe(true);
  });

  it('requires the epoch to match', () => {
    expect(pepSatisfies('1!1.0', '==1.0.*')).toBe(false);
    expect(pepSatisfies('1!1.0', '==1!1.0.*')).toBe(true);
    expect(pepSatisfies('1.0', '==1!1.0.*')).toBe(false);
    expect(pepSatisfies('1!1.0', '!=1.0.*')).toBe(true);
  });

  it('keeps prereleases unchanged: the suffix is ignored by the prefix match', () => {
    expect(pepSatisfies('1.0rc1', '==1.0.*')).toBe(true);
    expect(pepSatisfies('1.1rc1', '==1.0.*')).toBe(false);
  });

  it('combines prefix and library clauses with AND', () => {
    expect(pepSatisfies('1.3', '==1.*,>=1.2')).toBe(true);
    expect(pepSatisfies('1.1', '==1.*,>=1.2')).toBe(false);
    expect(pepSatisfies('2.3', '==1.*,>=1.2')).toBe(false);
  });

  it('leaves specifiers without prefix clauses to the library', () => {
    expect(pepSatisfies('1.5', '>=1.2,<2')).toBe(true);
    expect(pepSatisfies('2.5', '>=1.2,<2')).toBe(false);
    expect(pepSatisfies('1', 'not a specifier')).toBe(false);
  });
});

describe('npm and cargo do not use range-pep440', () => {
  it.each(['range-semver.ts', 'range-cargo.ts'])('%s does not import range-pep440', (file) => {
    const source = readFileSync(`pipeline/mapping/${file}`, 'utf8');
    expect(source).not.toMatch(/range-pep440|@renovatebot\/pep440/);
  });
});
