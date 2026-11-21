import { describe, expect, it } from 'vitest';
import type { Ecosystem } from '../../../core';
import { isCommandSafe, isValidName, normalizeName } from '../../../view-model/resurrect-names';

type Row = readonly [Ecosystem, string, boolean];

const VALID: readonly Row[] = [
  ['npm', 'left-pad', true],
  ['npm', '@scope/pkg', true],
  ['npm', 'Upper', false],
  ['npm', '~tilde', false],
  ['npm', '-rf', false],
  ['npm', 'a b', false],
  ['npm', 'a;b', false],
  ['npm', '$(x)', false],
  ['npm', '', false],
  ['npm', 'a'.repeat(214), true],
  ['npm', 'a'.repeat(215), false],
  ['pypi', 'requests', true],
  ['pypi', 'beautifulsoup', true],
  ['pypi', 'Requests', false],
  ['pypi', 'requests_toolkit', false],
  ['pypi', '-rf', false],
  ['pypi', 'a b', false],
  ['pypi', '', false],
  ['cargo', 'serde_json', true],
  ['cargo', 'serde-json', true],
  ['cargo', '1abc', false],
  ['cargo', 'a;b', false],
  ['cargo', '', false],
  ['cargo', 'a'.repeat(65), false],
];

const SAFE: readonly Row[] = [
  ['npm', 'Upper', true],
  ['npm', '@Scope/Pkg', true],
  ['npm', 'a'.repeat(214), true],
  ['npm', 'a'.repeat(215), false],
  ['npm', '~tilde', false],
  ['npm', '-rf', false],
  ['npm', 'a b', false],
  ['npm', 'a;b', false],
  ['npm', '$(x)', false],
  ['npm', '', false],
  ['pypi', 'requests', true],
  ['pypi', 'Requests', false],
  ['pypi', 'requests_toolkit', false],
  ['pypi', '-rf', false],
  ['pypi', '', false],
  ['cargo', 'serde_json', true],
  ['cargo', '1abc', false],
  ['cargo', '-rf', false],
  ['cargo', 'a b', false],
];

describe('resurrect names', () => {
  it.each(VALID)('isValidName(%s, %j) is %s', (eco, name, expected) => {
    expect(isValidName(eco, name)).toBe(expected);
  });

  it.each(SAFE)('isCommandSafe(%s, %j) is %s', (eco, name, expected) => {
    expect(isCommandSafe(eco, name)).toBe(expected);
  });

  it('normalizeName examples', () => {
    expect(normalizeName('pypi', 'Foo__Bar.baz')).toBe('foo-bar-baz');
    expect(normalizeName('cargo', 'Serde_JSON')).toBe('serde-json');
    expect(normalizeName('npm', 'Foo_Bar.baz')).toBe('Foo_Bar.baz');
  });

  it('is total for non-strings', () => {
    for (const v of [undefined, null, 1, {}, []]) {
      for (const eco of ['npm', 'pypi', 'cargo'] as const) {
        expect(isValidName(eco, v)).toBe(false);
        expect(isCommandSafe(eco, v)).toBe(false);
        expect(normalizeName(eco, v)).toBe('');
      }
    }
  });

  it('stays fast on long hostile input', () => {
    const hostile = 'a-'.repeat(50000) + '!';
    const start = Date.now();
    for (const eco of ['npm', 'pypi', 'cargo'] as const) {
      isValidName(eco, hostile);
      isCommandSafe(eco, hostile);
    }
    expect(Date.now() - start).toBeLessThan(500);
  });
});
