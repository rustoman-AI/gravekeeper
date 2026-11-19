import { describe, expect, it } from 'vitest';
import { exactPin, readDepsDevVersions, selectVersion } from '../../../pipeline/mapping/version-select';

describe('exactPin', () => {
  it('accepts npm bare and = semver, trimming whitespace', () => {
    expect(exactPin('1.2.3', 'npm')).toBe('1.2.3');
    expect(exactPin('=1.2.3', 'npm')).toBe('1.2.3');
    expect(exactPin('  1.2.3-beta.1+build.5 ', 'npm')).toBe('1.2.3-beta.1+build.5');
  });

  it('accepts only =<v> for cargo and rejects bare versions', () => {
    expect(exactPin('=1.2.3', 'cargo')).toBe('1.2.3');
    expect(exactPin('1.2.3', 'cargo')).toBeNull();
  });

  it('accepts == and === for pypi only', () => {
    expect(exactPin('==1.0', 'pypi')).toBe('1.0');
    expect(exactPin('===1.0.post1', 'pypi')).toBe('1.0.post1');
    expect(exactPin('=1.0', 'pypi')).toBeNull();
    expect(exactPin('1.0', 'pypi')).toBeNull();
    expect(exactPin('==1.*', 'pypi')).toBeNull();
    expect(exactPin('==1.0 ; python_version>"3"', 'pypi')).toBeNull();
    expect(exactPin('==v1.0', 'pypi')).toBeNull();
  });

  // A non-pin string is a Declared_Range for chooseVersion, not an error here.
  it('rejects ranges, wildcards, leading zeros, leading v and spaces', () => {
    for (const spec of ['^1.2.3', '~1.2.3', '>=1.2.3', '1.2.x', '*', '1.2', 'v1.2.3', '01.2.3', '1.2.3 ', '= 1.2.3', '1.2.3 - 2.0.0', '']) {
      const expected = spec === '1.2.3 ' ? '1.2.3' : null;
      expect(exactPin(spec, 'npm')).toBe(expected);
    }
    expect(exactPin('=1.2.*', 'cargo')).toBeNull();
  });

  it('returns null for non-strings and unknown ecosystems without throwing', () => {
    expect(exactPin(null, 'npm')).toBeNull();
    expect(exactPin(undefined, 'npm')).toBeNull();
    expect(exactPin(123, 'npm')).toBeNull();
    expect(exactPin('1.2.3', 'maven')).toBeNull();
    expect(exactPin('1.2.3', null)).toBeNull();
  });
});

describe('selectVersion', () => {
  it('selects a single pin present in the version list', () => {
    expect(selectVersion(['1.0.0'], ['0.9.0', '1.0.0'], '2.0.0')).toEqual({
      selected: '1.0.0',
      basis: 'pinned',
      notes: [],
    });
  });

  it('treats duplicate equal pins as one pin', () => {
    expect(selectVersion(['1.0.0', '1.0.0'], ['1.0.0'], null).basis).toBe('pinned');
  });

  it('compares pins exactly and case-sensitively', () => {
    const r = selectVersion(['1.0.0-RC1'], ['1.0.0-rc1'], '2.0.0');
    expect(r.selected).toBe('2.0.0');
    expect(r.basis).toBe('default');
    expect(r.notes).toEqual([{ code: 'pin-not-found', pinned: '1.0.0-RC1' }]);
  });

  it('uses the default with no pins and no notes', () => {
    expect(selectVersion([], ['1.0.0'], '1.0.0')).toEqual({
      selected: '1.0.0',
      basis: 'default',
      notes: [],
    });
  });

  it('reports pin-not-found and no-default-version together', () => {
    expect(selectVersion(['1.0.0'], ['2.0.0'], null)).toEqual({
      selected: null,
      basis: null,
      notes: [{ code: 'pin-not-found', pinned: '1.0.0' }, { code: 'no-default-version' }],
    });
  });

  it('reports no-default-version for an empty default and empty lists', () => {
    expect(selectVersion([], [], '')).toEqual({
      selected: null,
      basis: null,
      notes: [{ code: 'no-default-version' }],
    });
    expect(selectVersion([], [], null).selected).toBeNull();
  });

  it('falls back to default on conflicting pins, sorted by code point, order independent', () => {
    const a = selectVersion(['2.0.0', '1.0.0'], ['1.0.0', '2.0.0'], '2.0.0');
    const b = selectVersion(['1.0.0', '2.0.0', '1.0.0'], ['1.0.0', '2.0.0'], '2.0.0');
    expect(a).toEqual({
      selected: '2.0.0',
      basis: 'default',
      notes: [{ code: 'conflicting-pins', pins: ['1.0.0', '2.0.0'] }],
    });
    expect(b).toEqual(a);
  });

  it('conflicting pins without a default yields null selection', () => {
    expect(selectVersion(['1.0.0', '2.0.0'], [], null)).toEqual({
      selected: null,
      basis: null,
      notes: [
        { code: 'conflicting-pins', pins: ['1.0.0', '2.0.0'] },
        { code: 'no-default-version' },
      ],
    });
  });
});

describe('readDepsDevVersions', () => {
  it('reads versions and the first isDefault entry', () => {
    const body = {
      versions: [
        { versionKey: { version: '1.0.0' } },
        { versionKey: { version: '2.0.0' }, isDefault: true },
        { versionKey: { version: '3.0.0' }, isDefault: true },
      ],
    };
    expect(readDepsDevVersions(body)).toEqual({
      defaultVersion: '2.0.0',
      versions: ['1.0.0', '2.0.0', '3.0.0'],
    });
  });

  it('skips entries without a non-empty string version or non-true isDefault', () => {
    const body = {
      versions: [
        null,
        { versionKey: { version: '' }, isDefault: true },
        { versionKey: { version: 5 }, isDefault: true },
        { versionKey: { version: '1.0.0' }, isDefault: 'true' },
      ],
    };
    expect(readDepsDevVersions(body)).toEqual({ defaultVersion: null, versions: ['1.0.0'] });
  });

  it('returns empty results for malformed bodies', () => {
    for (const body of [null, undefined, 1, 'x', {}, { versions: 'a' }, { versions: [] }]) {
      expect(readDepsDevVersions(body)).toEqual({ defaultVersion: null, versions: [] });
    }
  });
});
