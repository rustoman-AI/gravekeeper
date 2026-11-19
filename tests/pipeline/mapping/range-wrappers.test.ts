import { describe, expect, it, vi } from 'vitest';
import {
  pepCompare,
  pepRange,
  pepSatisfies,
  pepVersion,
} from '../../../pipeline/mapping/range-pep440';
import {
  semverCompare,
  semverIsPrerelease,
  semverRange,
  semverSatisfies,
  semverVersion,
} from '../../../pipeline/mapping/range-semver';

const state = vi.hoisted(() => ({ throwing: false }));

vi.mock('semver', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('semver');
  const wrapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(actual)) {
    wrapped[key] =
      typeof value === 'function'
        ? (...args: unknown[]) => {
            if (state.throwing) throw new Error('boom');
            return (value as (...a: unknown[]) => unknown)(...args);
          }
        : value;
  }
  return { ...wrapped, default: wrapped };
});

vi.mock('@renovatebot/pep440', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@renovatebot/pep440');
  const wrapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(actual)) {
    wrapped[key] =
      typeof value === 'function'
        ? (...args: unknown[]) => {
            if (state.throwing) throw new Error('boom');
            return (value as (...a: unknown[]) => unknown)(...args);
          }
        : value;
  }
  return { ...wrapped, default: wrapped };
});

describe('semverVersion', () => {
  it.each(['1.2.3', '1.0.0+build', '1.0.0-rc.1'])('accepts %s', (v) => {
    expect(semverVersion(v)).toBe(v);
  });

  it.each(['v1.2.3', '=1.2.3', '1.2', ''])('rejects %j', (v) => {
    expect(semverVersion(v)).toBeNull();
  });
});

describe('semver wrappers', () => {
  it('normalises a valid range and rejects junk', () => {
    expect(semverRange('^1.2.3')).toBe('>=1.2.3 <2.0.0-0');
    expect(semverRange('not a range')).toBeNull();
  });

  it('flags prereleases', () => {
    expect(semverIsPrerelease('1.0.0-rc.1')).toBe(true);
    expect(semverIsPrerelease('1.0.0')).toBe(false);
  });

  it('compares and satisfies', () => {
    expect(semverCompare('1.2.0', '1.10.0')).toBeLessThan(0);
    expect(semverSatisfies('1.2.3', '^1.0.0')).toBe(true);
    expect(semverSatisfies('2.0.0', '^1.0.0')).toBe(false);
  });
});

describe('pep440 wrappers', () => {
  it.each(['1.5.0a1', '2.1.0.dev1'])('%s is a prerelease', (v) => {
    expect(pepVersion(v)).toEqual({ isPrerelease: true });
  });

  it('2.2.post1 is not a prerelease', () => {
    expect(pepVersion('2.2.post1')).toEqual({ isPrerelease: false });
  });

  it('pepVersion rejects junk', () => {
    expect(pepVersion('junk')).toBeNull();
  });

  it.each(['badrange', '*'])('pepRange rejects %j', (r) => {
    expect(pepRange(r)).toBeNull();
  });

  it('pepRange returns a valid specifier unchanged', () => {
    expect(pepRange('>=1.4,<2')).toBe('>=1.4,<2');
  });

  it('compares and satisfies', () => {
    expect(pepCompare('1.0', '1.0.0')).toBe(0);
    expect(pepCompare('1.0', '2.0')).toBeLessThan(0);
    expect(pepSatisfies('1.4.5', '>=1.4,<2')).toBe(true);
    expect(pepSatisfies('2.0', '>=1.4,<2')).toBe(false);
  });
});

describe('a throwing library', () => {
  it('gives null, false or 0 from every function', () => {
    state.throwing = true;
    try {
      expect(semverRange('^1.0.0')).toBeNull();
      expect(semverVersion('1.2.3')).toBeNull();
      expect(semverIsPrerelease('1.0.0-rc.1')).toBe(false);
      expect(semverCompare('1.0.0', '2.0.0')).toBe(0);
      expect(semverSatisfies('1.0.0', '^1.0.0')).toBe(false);
      expect(pepRange('>=1.0')).toBeNull();
      expect(pepVersion('1.0')).toBeNull();
      expect(pepCompare('1.0', '2.0')).toBe(0);
      expect(pepSatisfies('1.0', '>=1.0')).toBe(false);
    } finally {
      state.throwing = false;
    }
  });
});
