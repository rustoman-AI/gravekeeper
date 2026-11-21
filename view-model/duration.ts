import {
  DAYS_PER_MONTH_TEXT,
  DAYS_PER_YEAR_TEXT,
  DURATION_DAYS_MAX_EXCLUSIVE,
  DURATION_MONTHS_MAX_EXCLUSIVE,
} from './constants';
import { plural } from './plural';

export type DurationUnit = 'none' | 'lessThanDay' | 'days' | 'months' | 'years';

export interface DurationParts {
  readonly unit: DurationUnit;
  readonly count: number;
}

// graveyard-art Requirement 6.1, 6.3, 6.6: total, pure split of a day count into a unit and a count.
export function durationParts(days: number): DurationParts {
  if (typeof days !== 'number' || !Number.isFinite(days) || days < 0) {
    return { unit: 'none', count: 0 };
  }
  const d = Math.floor(days);
  if (d < 1) return { unit: 'lessThanDay', count: 0 };
  if (d < DURATION_DAYS_MAX_EXCLUSIVE) return { unit: 'days', count: d };
  if (d < DURATION_MONTHS_MAX_EXCLUSIVE) {
    return { unit: 'months', count: Math.floor(d / DAYS_PER_MONTH_TEXT) };
  }
  return { unit: 'years', count: Math.floor(d / DAYS_PER_YEAR_TEXT) };
}

// graveyard-art Requirement 6.1, 6.5: human wording of a number of days; no Date, no locale.
export function humanizeDays(days: number): string {
  const { unit, count } = durationParts(days);
  switch (unit) {
    case 'none':
      return 'an unknown time';
    case 'lessThanDay':
      return 'less than a day';
    case 'days':
      return `${count} ${plural(count, 'day', 'days')}`;
    case 'months':
      return `${count} ${plural(count, 'month', 'months')}`;
    case 'years':
      return `${count} ${plural(count, 'year', 'years')}`;
  }
}
