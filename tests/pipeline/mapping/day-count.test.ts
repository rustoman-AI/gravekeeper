import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../../../pipeline/constants';
import { dayCount, parseIsoInstant } from '../../../pipeline/mapping/day-count';

const ASOF = '2024-03-10T12:00:00Z';
const ASOF_MS = Date.parse(ASOF);

function before(ms: number): string {
  return new Date(ASOF_MS - ms).toISOString();
}

describe('dayCount', () => {
  it('returns 0 for the same instant', () => {
    expect(dayCount(ASOF, ASOF)).toBe(0);
  });

  it('returns 0 at DAY_MS - 1 and 1 at DAY_MS', () => {
    expect(dayCount(before(DAY_MS - 1), ASOF)).toBe(0);
    expect(dayCount(before(DAY_MS), ASOF)).toBe(1);
    expect(dayCount(before(2 * DAY_MS - 1), ASOF)).toBe(1);
    expect(dayCount(before(2 * DAY_MS), ASOF)).toBe(2);
  });

  it('counts across leap days', () => {
    expect(dayCount('2024-02-28T00:00:00Z', '2024-03-01T00:00:00Z')).toBe(2);
    expect(dayCount('2023-02-28T00:00:00Z', '2023-03-01T00:00:00Z')).toBe(1);
    expect(dayCount('2024-01-01T00:00:00Z', '2025-01-01T00:00:00Z')).toBe(366);
    expect(dayCount('2023-01-01T00:00:00Z', '2024-01-01T00:00:00Z')).toBe(365);
  });

  it('accepts fractional seconds of 1 to 9 digits', () => {
    expect(dayCount('2024-03-09T12:00:00.001Z', ASOF)).toBe(0);
    expect(dayCount('2024-03-09T12:00:00.000Z', ASOF)).toBe(1);
    expect(dayCount('2024-03-09T12:00:00.5Z', ASOF)).toBe(0);
    expect(dayCount('2024-03-09T12:00:00.123456789Z', ASOF)).toBe(0);
    expect(dayCount('2024-03-09T12:00:00.000999999Z', ASOF)).toBe(1);
    expect(dayCount('2024-03-09T12:00:00Z', '2024-03-10T12:00:00.999999999Z')).toBe(1);
  });

  it('returns null for invalid ISO forms', () => {
    const bad = [
      '',
      '2024-03-09',
      '2024-03-09T12:00:00',
      '2024-03-09T12:00:00+00:00',
      '2024-03-09 12:00:00Z',
      '2024-03-09T12:00Z',
      '2024-03-09T12:00:00.Z',
      '2024-03-09T12:00:00.1234567890Z',
      '2024-03-09t12:00:00z',
      ' 2024-03-09T12:00:00Z',
      '2024-03-09T12:00:00Z ',
      '2024-13-09T12:00:00Z',
      '2024-00-09T12:00:00Z',
      '2024-03-00T12:00:00Z',
      '2024-02-30T12:00:00Z',
      '2023-02-29T12:00:00Z',
      '2024-04-31T12:00:00Z',
      '2024-03-09T24:00:00Z',
      '2024-03-09T12:60:00Z',
      '2024-03-09T12:00:60Z',
      'not a date',
    ];
    for (const value of bad) {
      expect(dayCount(value, ASOF), value).toBeNull();
    }
  });

  it('accepts a valid leap day', () => {
    expect(dayCount('2024-02-29T00:00:00Z', '2024-03-01T00:00:00Z')).toBe(1);
  });

  it('returns null for an invalid asOf', () => {
    expect(dayCount(ASOF, 'garbage')).toBeNull();
    expect(dayCount(ASOF, '')).toBeNull();
    expect(dayCount(ASOF, '2024-03-10')).toBeNull();
    expect(dayCount('garbage', 'garbage')).toBeNull();
  });

  // Requirement 6.4 (authoritative): a date after asOf yields 0. The task text
  // says null; the requirement wins.
  it('returns 0 for a date after asOf', () => {
    expect(dayCount('2024-03-10T12:00:00.001Z', ASOF)).toBe(0);
    expect(dayCount('2030-01-01T00:00:00Z', ASOF)).toBe(0);
  });

  it('returns null for non-string dates without throwing', () => {
    const values: unknown[] = [
      null,
      undefined,
      0,
      ASOF_MS,
      NaN,
      true,
      {},
      [],
      [ASOF],
      new Date(ASOF_MS),
      Symbol('x'),
      () => ASOF,
      { toString: () => ASOF },
    ];
    for (const value of values) {
      expect(() => dayCount(value, ASOF)).not.toThrow();
      expect(dayCount(value, ASOF)).toBeNull();
    }
  });
});

describe('parseIsoInstant', () => {
  it('parses to epoch milliseconds and truncates beyond milliseconds', () => {
    expect(parseIsoInstant('1970-01-01T00:00:00Z')).toBe(0);
    expect(parseIsoInstant('1970-01-01T00:00:01.5Z')).toBe(1500);
    expect(parseIsoInstant('1970-01-01T00:00:00.123999999Z')).toBe(123);
    expect(parseIsoInstant(ASOF)).toBe(ASOF_MS);
  });

  it('returns null for non-strings', () => {
    expect(parseIsoInstant(5)).toBeNull();
    expect(parseIsoInstant(null)).toBeNull();
  });
});
