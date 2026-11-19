import { describe, expect, it } from 'vitest';
import { RANGE_MAX_LENGTH } from '../../../pipeline/constants';
import { resolveRange } from '../../../pipeline/mapping/range-resolve';

const resolved = (version: string) => ({ kind: 'resolved', version });
const unresolved = { kind: 'unresolved' };

describe('resolveRange npm', () => {
  it.each([
    ['^4.17.0', ['4.17.0', '4.17.21', '4.18.0-beta.1', '5.0.0'], '4.17.21'],
    ['~1.2', ['1.1.9', '1.2.0', '1.2.7', '1.3.0'], '1.2.7'],
    ['>=1 <2', ['0.9.0', '1.0.0', '1.9.9', '2.0.0'], '1.9.9'],
    ['1.x', ['0.9.0', '1.0.0', '1.4.2', '2.0.0'], '1.4.2'],
    ['^1.0.0 || ^3.0.0', ['1.2.0', '2.5.0', '3.1.0', '4.0.0'], '3.1.0'],
    ['1.0.0 - 2.0.0', ['0.9.0', '1.5.0', '2.0.0', '2.0.1'], '2.0.0'],
    ['*', ['1.0.0', '3.2.1', '2.0.0'], '3.2.1'],
  ])('%s', (range, versions, expected) => {
    expect(resolveRange('npm', [range], versions)).toEqual(resolved(expected));
  });
});

describe('resolveRange cargo', () => {
  it.each([
    ['1.3.1', ['1.3.0', '1.3.1', '1.9.0', '2.0.0'], '1.9.0'],
    ['0.0.3', ['0.0.3', '0.0.4', '0.1.0'], '0.0.3'],
    ['>=1.2, <1.5', ['1.1.0', '1.2.0', '1.4.9', '1.5.0'], '1.4.9'],
  ])('%s', (range, versions, expected) => {
    expect(resolveRange('cargo', [range], versions)).toEqual(resolved(expected));
  });
});

describe('resolveRange pypi', () => {
  it.each([
    ['>=1.4,<2', ['1.3', '1.4', '1.9.2', '2.0'], '1.9.2'],
    ['~=1.4.0', ['1.3.9', '1.4.0', '1.4.7', '1.5.0'], '1.4.7'],
    ['==1.*', ['0.9', '1.0', '1.8', '2.0'], '1.8'],
    ['!=1.4.5,>=1.0', ['0.9', '1.4.4', '1.4.5'], '1.4.4'],
  ])('%s', (range, versions, expected) => {
    expect(resolveRange('pypi', [range], versions)).toEqual(resolved(expected));
  });

  it('keeps the first listed of equal versions', () => {
    expect(resolveRange('pypi', ['>=1'], ['1.0', '1.0.0'])).toEqual(resolved('1.0'));
    expect(resolveRange('pypi', ['>=1'], ['1.0.0', '1.0'])).toEqual(resolved('1.0.0'));
  });
});

describe('resolveRange candidates', () => {
  it('never chooses prereleases or junk strings', () => {
    const versions = ['not-a-version', '', '9.0.0-rc.1', '1.2.0', '9.9.9-beta'];
    expect(resolveRange('npm', ['*'], versions)).toEqual(resolved('1.2.0'));
    expect(resolveRange('npm', ['>=1.0.0-0'], ['2.0.0-rc.1', 'junk'])).toEqual(unresolved);
    expect(resolveRange('pypi', ['>=1'], ['3.0rc1', '3.0a1', 'junk', '2.0'])).toEqual(resolved('2.0'));
  });

  it('intersects several ranges', () => {
    expect(resolveRange('npm', ['>=1', '<2'], ['0.5.0', '1.5.0', '2.1.0'])).toEqual(resolved('1.5.0'));
    expect(resolveRange('npm', ['>=2', '<2'], ['1.5.0', '2.1.0'])).toEqual(unresolved);
  });
});

describe('resolveRange unresolved', () => {
  it('range longer than RANGE_MAX_LENGTH', () => {
    const long = `>=1${' '.repeat(RANGE_MAX_LENGTH)}`;
    expect(resolveRange('npm', [long], ['1.0.0'])).toEqual(unresolved);
  });

  it('unparseable range', () => {
    expect(resolveRange('npm', ['not a range!!'], ['1.0.0'])).toEqual(unresolved);
    expect(resolveRange('pypi', ['>>>1'], ['1.0'])).toEqual(unresolved);
    expect(resolveRange('cargo', ['~~1'], ['1.0.0'])).toEqual(unresolved);
  });

  it('range matching nothing, and empty inputs', () => {
    expect(resolveRange('npm', ['^9.0.0'], ['1.0.0', '2.0.0'])).toEqual(unresolved);
    expect(resolveRange('npm', ['*'], [])).toEqual(unresolved);
    expect(resolveRange('npm', [], ['1.0.0'])).toEqual(unresolved);
  });
});
