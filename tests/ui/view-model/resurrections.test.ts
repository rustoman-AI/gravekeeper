import { describe, expect, it } from 'vitest';
import { loadCurated, lookupCurated } from '../../../view-model/resurrections';

const GOOD = {
  ecosystem: 'npm',
  from: 'request',
  to: ['got'],
  why: 'The maintainers of request deprecated it.',
  source: 'https://github.com/request/request/issues/3142',
};
const other = { ...GOOD, from: 'tslint', to: ['eslint'] };
const wrap = (...entries: unknown[]) => ({ entries });

describe('loadCurated', () => {
  it('keeps a valid entry', () => {
    expect(loadCurated(wrap(GOOD))).toEqual([GOOD]);
  });

  it.each([null, undefined, 3, 'x', [], {}, { entries: 'x' }, { entries: {} }])('returns [] for %j', (raw) => {
    expect(loadCurated(raw)).toEqual([]);
  });

  const hostile: ReadonlyArray<readonly [string, unknown]> = [
    ['non-object entry', 'x'],
    ['extra key', { ...GOOD, extra: 1 }],
    ['missing key', { ecosystem: 'npm', from: 'a', to: ['b'], why: 'A.' }],
    ['unknown ecosystem', { ...GOOD, ecosystem: 'gem' }],
    ['http source', { ...GOOD, source: 'http://example.com/a' }],
    ['javascript source', { ...GOOD, source: 'javascript:alert(1)' }],
    ['credentials in source', { ...GOOD, source: 'https://user:pw@example.com/a' }],
    ['five alternatives', { ...GOOD, to: ['a', 'b', 'c', 'd', 'e'] }],
    ['no alternatives', { ...GOOD, to: [] }],
    ['duplicate alternative', { ...GOOD, to: ['got', 'got'] }],
    ['invalid to name', { ...GOOD, to: ['Bad Name'] }],
    ['invalid from name', { ...GOOD, from: '-rf' }],
    ['why with a URL', { ...GOOD, why: 'See https://example.com for details.' }],
    ['why with a line break', { ...GOOD, why: 'One.\nTwo.' }],
    ['why of two sentences', { ...GOOD, why: 'One. Two.' }],
    ['why without a period', { ...GOOD, why: 'No period' }],
    ['why too long', { ...GOOD, why: `${'a'.repeat(200)}.` }],
  ];
  it.each(hostile)('drops an entry with %s and keeps the others', (_label, bad) => {
    expect(loadCurated(wrap(GOOD, bad, other))).toEqual([GOOD, other]);
  });

  it('drops a later duplicate of a normalized from', () => {
    const a = { ...GOOD, ecosystem: 'pypi', from: 'my-pkg', to: ['x'] };
    const b = { ...a, to: ['y'] };
    expect(loadCurated(wrap(a, b))).toEqual([a]);
  });

  it('does not throw on a hostile getter', () => {
    const trap = Object.defineProperty({}, 'entries', {
      get() {
        throw new Error('boom');
      },
    });
    expect(loadCurated(trap)).toEqual([]);
  });
});

describe('lookupCurated', () => {
  it('finds an entry by normalized name', () => {
    expect(lookupCurated('npm', 'request')?.to).toContain('got');
  });
  it('returns null for an unknown name and for npm case changes', () => {
    expect(lookupCurated('npm', 'no-such-package-xyz')).toBeNull();
    expect(lookupCurated('npm', 'Request')).toBeNull();
  });
  it('treats PyPI spellings as equivalent', () => {
    const a = lookupCurated('pypi', 'mysql-python');
    expect(a).not.toBeNull();
    expect(lookupCurated('pypi', 'MySQL_Python')).toBe(a);
  });
});
