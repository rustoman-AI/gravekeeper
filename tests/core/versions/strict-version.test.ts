// Validates: Requirements 5.4
import { describe, expect, it } from 'vitest';
import { isStrictVersion } from '../../../core';

describe('isStrictVersion accepted', () => {
  it.each([
    ['npm', '1.2.3'],
    ['npm', '0.0.1'],
    ['npm', '1.2.3-beta.1'],
    ['cargo', '1.2.3'],
    ['cargo', '0.1.0-rc.1'],
    ['pypi', '2.31.0'],
    ['pypi', '2020.04.05'],
    ['pypi', '1.0rc1'],
    ['pypi', '1.0.post2'],
    ['pypi', '1.0.dev3'],
  ])('%s %s', (ecosystem, version) => {
    expect(isStrictVersion(ecosystem, version)).toBe(true);
  });
});

describe('isStrictVersion rejected', () => {
  it.each([
    ['npm', '1.2'],
    ['npm', '01.2.3'],
    ['npm', '1.2.3+build'],
    ['cargo', '1.2.3+build'],
    ['pypi', '1!2.0'],
    ['pypi', '1.0+local'],
    ['npm', '1.2.3;rm'],
    ['npm', '1 2 3'],
    ['npm', '1.2.3"'],
    ['npm', "1.2.3'"],
    ['npm', '1.2.3`'],
    ['npm', '$(x)'],
    ['npm', '1.2.3\n'],
    ['npm', '1.2.3-' + 'a'.repeat(59)],
    ['pypi', '1'.repeat(65)],
  ])('%s %j', (ecosystem, version) => {
    expect(isStrictVersion(ecosystem, version)).toBe(false);
  });

  it('accepts 64 characters and rejects 65', () => {
    expect(isStrictVersion('npm', '1.2.3-' + 'a'.repeat(58))).toBe(true);
    expect(isStrictVersion('npm', '1.2.3-' + 'a'.repeat(59))).toBe(false);
  });

  it('rejects non-strings and unknown ecosystems', () => {
    expect(isStrictVersion('npm', null)).toBe(false);
    expect(isStrictVersion('npm', 123)).toBe(false);
    expect(isStrictVersion('npm', undefined)).toBe(false);
    expect(isStrictVersion('gem', '1.2.3')).toBe(false);
    expect(isStrictVersion(null, '1.2.3')).toBe(false);
  });
});
