import { describe, expect, it } from 'vitest';
import { chooseUpgrade } from '../../../pipeline/mapping/upgrade';

interface V {
  v: string;
  def?: boolean;
  dep?: unknown;
}

const doc = (list: readonly V[]): unknown => ({
  versions: list.map((e) => ({
    versionKey: { version: e.v },
    ...(e.def === true ? { isDefault: true } : {}),
    ...(e.dep === undefined ? {} : { isDeprecated: e.dep }),
  })),
});

const run = (
  ecosystem: string,
  list: readonly V[],
  selected: string | null,
  latestBody: unknown = undefined,
) => chooseUpgrade({ ecosystem, depsdevBody: doc(list), selected, latestBody });

const UP = (version: string) => ({ version, basis: 'registry-default' });

describe('chooseUpgrade (resurrect-upgrade R4)', () => {
  it('uuid-like npm: deprecated 3.4.0, healthy default 11.1.0', () => {
    const list = [{ v: '3.4.0', dep: true }, { v: '11.1.0', def: true, dep: false }];
    expect(run('npm', list, '3.4.0')).toEqual(UP('11.1.0'));
  });

  it('rimraf-like npm: deprecated 3.0.2, default 6.0.1 without flag', () => {
    const list = [{ v: '3.0.2', dep: true }, { v: '6.0.1', def: true }];
    expect(run('npm', list, '3.0.2')).toEqual(UP('6.0.1'));
  });

  it('is independent of the order of versions[]', () => {
    const list = [{ v: '11.1.0', def: true }, { v: '2.0.0' }, { v: '3.4.0', dep: true }];
    expect(run('npm', list, '3.4.0')).toEqual(run('npm', [...list].reverse(), '3.4.0'));
  });

  it('returns null when the default is deprecated (har-validator-like)', () => {
    const list = [{ v: '5.0.0', dep: true }, { v: '5.1.5', def: true, dep: true }];
    expect(run('npm', list, '5.0.0')).toBeNull();
  });

  it('returns null when the default equals or is lower than the checked version', () => {
    expect(run('npm', [{ v: '2.0.0', def: true, dep: true }], '2.0.0')).toBeNull();
    const lower = [{ v: '3.0.0', dep: true }, { v: '2.0.0', def: true }];
    expect(run('npm', lower, '3.0.0')).toBeNull();
  });

  it('returns null when the checked version is not deprecated (HAUNTED case, R4.5)', () => {
    const list = [{ v: '1.0.0', dep: false }, { v: '2.0.0', def: true }];
    expect(run('npm', list, '1.0.0')).toBeNull();
    expect(run('npm', [{ v: '1.0.0', dep: 'true' }, { v: '2.0.0', def: true }], '1.0.0')).toBeNull();
  });

  it('returns null when the checked version is missing or the default is unlisted', () => {
    const list = [{ v: '1.0.0', dep: true }, { v: '2.0.0', def: true }];
    expect(run('npm', list, null)).toBeNull();
    expect(run('npm', list, '9.9.9')).toBeNull();
    expect(run('npm', [{ v: '1.0.0', dep: true }], '1.0.0')).toBeNull();
  });

  it('npm /latest with a deprecated string for the default version gives null (R4.3)', () => {
    const list = [{ v: '1.0.0', dep: true }, { v: '2.0.0', def: true }];
    expect(run('npm', list, '1.0.0', { version: '2.0.0', deprecated: 'old' })).toBeNull();
    expect(run('npm', list, '1.0.0', { version: '2.0.0', deprecated: '  ' })).toEqual(UP('2.0.0'));
    expect(run('npm', list, '1.0.0', { version: '1.5.0', deprecated: 'old' })).toEqual(UP('2.0.0'));
  });

  it('pypi uses PEP 440 order: 1.9 < 1.10', () => {
    const list = [{ v: '1.9', dep: true }, { v: '1.10', def: true }];
    expect(run('pypi', list, '1.9')).toEqual(UP('1.10'));
    expect(run('pypi', [{ v: '1.10', dep: true }, { v: '1.9', def: true }], '1.10')).toBeNull();
  });

  it('cargo uses semver order', () => {
    const list = [{ v: '1.0.0', dep: true }, { v: '1.0.1', def: true }];
    expect(run('cargo', list, '1.0.0')).toEqual(UP('1.0.1'));
    expect(run('cargo', [{ v: '1.0.1', dep: true }, { v: '1.0.0', def: true }], '1.0.1')).toBeNull();
  });

  it('returns null for unparsable versions and unknown ecosystems', () => {
    expect(run('npm', [{ v: 'x', dep: true }, { v: '2.0.0', def: true }], 'x')).toBeNull();
    expect(run('npm', [{ v: '1.0.0', dep: true }, { v: 'latest', def: true }], '1.0.0')).toBeNull();
    expect(run('pypi', [{ v: 'zzz', dep: true }, { v: '2.0', def: true }], 'zzz')).toBeNull();
    expect(run('go', [{ v: '1.0.0', dep: true }, { v: '2.0.0', def: true }], '1.0.0')).toBeNull();
  });

  it('never throws on hostile bodies', () => {
    const hostile = {
      get versions(): unknown {
        throw new Error('boom');
      },
    };
    expect(chooseUpgrade({ ecosystem: 'npm', depsdevBody: hostile, selected: '1.0.0', latestBody: hostile })).toBeNull();
    expect(chooseUpgrade({ ecosystem: 'npm', depsdevBody: null, selected: '1.0.0', latestBody: 5 })).toBeNull();
  });
});
