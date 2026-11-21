import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pepSatisfies } from '../../../pipeline/mapping/range-pep440';
import { resolveRange } from '../../../pipeline/mapping/range-resolve';

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

// Validates: Requirements 10.10
describe('pepSatisfies zero padding for every clause', () => {
  it('treats 2.0 as 2.0.0.0', () => {
    expect(pepSatisfies('2.0', '~=2.0.0.0')).toBe(true);
    expect(pepSatisfies('2', '>=2.0.0')).toBe(true);
    expect(pepSatisfies('2', '<2.0.1')).toBe(true);
  });

  it('still rejects versions that are different', () => {
    expect(pepSatisfies('1.9', '~=2.0.0.0')).toBe(false);
  });

  it('does not pad for arbitrary equality', () => {
    expect(pepSatisfies('2.0', '===2.0.0.0')).toBe(false);
    expect(pepSatisfies('2.0.0.0', '===2.0.0.0')).toBe(true);
  });

  it('keeps the prerelease rules', () => {
    expect(pepSatisfies('2.0rc1', '>=2.0.0.0')).toBe(false);
    expect(pepSatisfies('2.0rc1', '>=2.0.0.0rc1')).toBe(true);
    expect(pepSatisfies('2.0rc1', '<2.0.0.0')).toBe(false);
    expect(pepSatisfies('1.9rc1', '<2.0.0.0')).toBe(false);
  });

  it('returns the original candidate string from resolveRange', () => {
    const result = resolveRange('pypi', ['~=2.0.0.0'], ['2.0']);
    expect(JSON.stringify(result)).toContain('2.0');
    expect(JSON.stringify(result)).not.toContain('2.0.0.0');
  });
});
describe('npm and cargo do not use range-pep440', () => {
  it.each(['range-semver.ts', 'range-cargo.ts'])('%s does not import range-pep440', (file) => {
    const source = readFileSync(`pipeline/mapping/${file}`, 'utf8');
    expect(source).not.toMatch(/range-pep440|@renovatebot\/pep440/);
  });
});
