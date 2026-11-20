import { describe, expect, it } from 'vitest';
import { durationParts, humanizeDays } from '../../../view-model/duration';

describe('humanizeDays', () => {
  it.each([
    [0, 'less than a day'],
    [0.5, 'less than a day'],
    [1, '1 day'],
    [2, '2 days'],
    [40, '40 days'],
    [59, '59 days'],
    [59.9, '59 days'],
    [60, '2 months'],
    [61, '2 months'],
    [210, '7 months'],
    [729, '24 months'],
    [730, '2 years'],
    [731, '2 years'],
    [3285, '9 years'],
    [3507, '9 years'],
  ])('%s days is "%s"', (days, text) => {
    expect(humanizeDays(days)).toBe(text);
  });

  it.each([NaN, Infinity, -Infinity, -1, -5])('%s is an unknown time', (days) => {
    expect(humanizeDays(days)).toBe('an unknown time');
    expect(durationParts(days)).toEqual({ unit: 'none', count: 0 });
  });
});
