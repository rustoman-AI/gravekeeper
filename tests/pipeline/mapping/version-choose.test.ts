import { describe, expect, it } from 'vitest';
import { RANGE_MAX_LENGTH } from '../../../pipeline/constants';
import { chooseVersion } from '../../../pipeline/mapping/version-choose';

const VERSIONS = ['1.0.0', '1.2.0', '1.5.0', '2.0.0'];

describe('chooseVersion', () => {
  it('gives the default with no note for no specs and for whitespace specs', () => {
    const expected = { selected: '2.0.0', basis: 'default', notes: [] };
    expect(chooseVersion('npm', [], VERSIONS, '2.0.0')).toEqual(expected);
    expect(chooseVersion('npm', ['', '   ', '\t'], VERSIONS, '2.0.0')).toEqual(expected);
  });

  it('resolves one range', () => {
    expect(chooseVersion('npm', ['^1.0.0'], VERSIONS, '2.0.0')).toEqual({
      selected: '1.5.0',
      basis: 'resolved',
      notes: [],
    });
  });

  it('treats * as no constraint for pypi (Requirement 10.5)', () => {
    expect(chooseVersion('pypi', ['*'], VERSIONS, '2.0.0')).toEqual({
      selected: '2.0.0',
      basis: 'default',
      notes: [],
    });
    expect(chooseVersion('pypi', [' * '], VERSIONS, '2.0.0').notes).toEqual([]);
  });

  it('ignores * next to a range for pypi', () => {
    expect(chooseVersion('pypi', ['*', '>=1.0,<1.3'], VERSIONS, '2.0.0')).toEqual({
      selected: '1.2.0',
      basis: 'resolved',
      notes: [],
    });
  });

  it('keeps * as a range for npm', () => {
    expect(chooseVersion('npm', ['*'], VERSIONS, '1.0.0')).toEqual({
      selected: '2.0.0',
      basis: 'resolved',
      notes: [],
    });
  });

  it('prefers an exact pin over a range', () => {
    expect(chooseVersion('npm', ['^1.0.0', '1.2.0'], VERSIONS, '2.0.0')).toEqual({
      selected: '1.2.0',
      basis: 'pinned',
      notes: [],
    });
  });

  it('gives the default and pin-not-found for a pin that is not published', () => {
    expect(chooseVersion('npm', ['9.9.9'], VERSIONS, '2.0.0')).toEqual({
      selected: '2.0.0',
      basis: 'default',
      notes: [{ code: 'pin-not-found', pinned: '9.9.9' }],
    });
  });

  it('reports conflicting-pins for two distinct pins, whatever the order', () => {
    const expected = {
      selected: '2.0.0',
      basis: 'default',
      notes: [{ code: 'conflicting-pins', pins: ['1.0.0', '1.2.0'] }],
    };
    expect(chooseVersion('npm', ['1.2.0', '1.0.0'], VERSIONS, '2.0.0')).toEqual(expected);
    expect(chooseVersion('npm', ['1.0.0', '1.2.0'], VERSIONS, '2.0.0')).toEqual(expected);
  });

  it('gives the default plus one range-unresolved note with sorted distinct ranges', () => {
    const result = chooseVersion('npm', ['^9.0.0', '^8.0.0', '^9.0.0', ' ^8.0.0 '], VERSIONS, '2.0.0');
    expect(result).toEqual({
      selected: '2.0.0',
      basis: 'default',
      notes: [{ code: 'range-unresolved', ranges: ['^8.0.0', '^9.0.0'] }],
    });
  });

  it('cuts each range to RANGE_MAX_LENGTH code points', () => {
    const long = '^9.0.0 || ' + '\u{1F480}'.repeat(RANGE_MAX_LENGTH + 10);
    const result = chooseVersion('npm', [long], VERSIONS, '2.0.0');
    const note = result.notes[0];
    expect(note?.code).toBe('range-unresolved');
    if (note?.code !== 'range-unresolved') return;
    expect(note.ranges).toHaveLength(1);
    expect(Array.from(note.ranges[0] as string)).toHaveLength(RANGE_MAX_LENGTH);
    expect(long.startsWith(note.ranges[0] as string)).toBe(true);
  });

  it('adds no-default-version after range-unresolved when there is no default', () => {
    expect(chooseVersion('npm', ['^9.0.0'], VERSIONS, null)).toEqual({
      selected: null,
      basis: null,
      notes: [{ code: 'range-unresolved', ranges: ['^9.0.0'] }, { code: 'no-default-version' }],
    });
  });

  it('is total for an unknown ecosystem and for non-string specs', () => {
    expect(() => chooseVersion('maven', ['1.0.0', '^1'], VERSIONS, '2.0.0')).not.toThrow();
    expect(() => chooseVersion(undefined, [null, 5, {}, '^1'], VERSIONS, null)).not.toThrow();
    const result = chooseVersion('maven', ['^1'], VERSIONS, '2.0.0');
    expect(result.selected).toBe('2.0.0');
    expect(result.basis).toBe('default');
  });
});
