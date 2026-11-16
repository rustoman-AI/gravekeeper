import { describe, expect, it } from 'vitest';
import { compareDependencies } from '../../../core/formats/order';
import { sourceKindOfNpmSpec } from '../../../core/formats/npm-source-kind';
import { isNameToken, normalizePypiName, writtenName } from '../../../core/formats/requirements-lexical';
import type { SerializableDependency } from '../../../core/model';

describe('sourceKindOfNpmSpec', () => {
  it.each(['file:../x', 'link:../x', 'workspace:*'])('classifies %s as path', (spec) => {
    expect(sourceKindOfNpmSpec(spec)).toBe('path');
  });
  it.each(['git+https://x/y.git', 'git://x/y.git', 'github:a/b', 'gitlab:a/b', 'bitbucket:a/b', 'a/b#c', 'foo/bar#v1.0'])(
    'classifies %s as git',
    (spec) => {
      expect(sourceKindOfNpmSpec(spec)).toBe('git');
    },
  );
  it.each(['@scope/pkg', '1.0.0', '', '^1.2.3', 'latest'])('classifies %j as registry', (spec) => {
    expect(sourceKindOfNpmSpec(spec)).toBe('registry');
  });
});

describe('normalizePypiName', () => {
  it.each([
    ['Django', 'django'],
    ['PyYAML', 'pyyaml'],
    ['SQLAlchemy', 'sqlalchemy'],
    ['Foo_Bar', 'foo-bar'],
    ['foo.bar', 'foo-bar'],
    ['a-_.b', 'a-b'],
    ['a__b', 'a-b'],
  ])('maps %s to %s', (input, expected) => {
    expect(normalizePypiName(input)).toBe(expected);
  });
  it('lower-cases only ASCII A to Z', () => {
    expect(normalizePypiName('ÀÉİ')).toBe('ÀÉİ');
    expect(normalizePypiName('\u212AELVIN')).toBe('\u212Aelvin');
    expect(normalizePypiName('ÀB')).toBe('Àb');
  });
  it('is idempotent', () => {
    for (const s of ['Foo_Bar', 'a-_.B', 'ÀÉ.x', '', '---', 'Django']) {
      expect(normalizePypiName(normalizePypiName(s))).toBe(normalizePypiName(s));
    }
  });
});

describe('isNameToken', () => {
  it.each(['Django', 'a.b_c-d', 'a', '0x'])('accepts %j', (s) => {
    expect(isNameToken(s)).toBe(true);
  });
  it.each(['', '-a', 'a b', '.a', '_a', 'aé', 'a\n'])('rejects %j', (s) => {
    expect(isNameToken(s)).toBe(false);
  });
});

describe('writtenName', () => {
  it('returns rawName when its normalization equals name', () => {
    expect(writtenName({ name: 'django', rawName: 'Django' })).toBe('Django');
    expect(writtenName({ name: 'foo-bar', rawName: 'Foo_Bar' })).toBe('Foo_Bar');
  });
  it('returns name when rawName does not normalize to name', () => {
    expect(writtenName({ name: 'django', rawName: 'Flask' })).toBe('django');
  });
  it('returns name when rawName is absent', () => {
    expect(writtenName({ name: 'django' })).toBe('django');
  });
});

describe('compareDependencies', () => {
  const base: SerializableDependency = {
    name: 'a',
    ecosystem: 'pypi',
    versionSpec: '*',
    scope: 'runtime',
    sourceKind: 'registry',
  };
  const dep = (over: Partial<SerializableDependency>): SerializableDependency => ({ ...base, ...over });

  it('orders by name by code point, not UTF-16 unit', () => {
    expect(compareDependencies(dep({ name: '\u{1F600}' }), dep({ name: '\uFF5E' }))).toBeGreaterThan(0);
    expect(compareDependencies(dep({ name: '\uFF5E' }), dep({ name: '\u{1F600}' }))).toBeLessThan(0);
  });
  it('orders integer-like names as text', () => {
    const sorted = ['10', '9', '2', '1'].map((name) => dep({ name })).sort(compareDependencies);
    expect(sorted.map((d) => d.name)).toEqual(['1', '10', '2', '9']);
  });
  it('orders by name before scope', () => {
    expect(compareDependencies(dep({ name: 'a', scope: 'peer' }), dep({ name: 'b', scope: 'runtime' }))).toBeLessThan(0);
  });
  it('orders scopes by SCOPE_ORDER', () => {
    const scopes = ['peer', 'optional', 'build', 'dev', 'runtime'] as const;
    const sorted = scopes.map((scope) => dep({ scope })).sort(compareDependencies);
    expect(sorted.map((d) => d.scope)).toEqual(['runtime', 'dev', 'build', 'optional', 'peer']);
  });
  it('breaks ties by ecosystem, versionSpec and sourceKind', () => {
    expect(compareDependencies(dep({ ecosystem: 'cargo' }), dep({ ecosystem: 'npm' }))).toBeLessThan(0);
    expect(compareDependencies(dep({ versionSpec: '==1' }), dep({ versionSpec: '==2' }))).toBeLessThan(0);
    expect(compareDependencies(dep({ sourceKind: 'git' }), dep({ sourceKind: 'registry' }))).toBeLessThan(0);
  });
  it('ends with rawName, absent first, by code point', () => {
    expect(compareDependencies(dep({}), dep({ rawName: '' }))).toBeLessThan(0);
    expect(compareDependencies(dep({ rawName: '' }), dep({}))).toBeGreaterThan(0);
    expect(compareDependencies(dep({ rawName: 'Foo' }), dep({ rawName: 'foo' }))).toBeLessThan(0);
    expect(compareDependencies(dep({ rawName: '\u{1F600}' }), dep({ rawName: '\uFF5E' }))).toBeGreaterThan(0);
  });
  it('returns 0 for equal dependencies, with and without rawName', () => {
    expect(compareDependencies(dep({}), dep({}))).toBe(0);
    expect(compareDependencies(dep({ rawName: 'A' }), dep({ rawName: 'A' }))).toBe(0);
  });
});
