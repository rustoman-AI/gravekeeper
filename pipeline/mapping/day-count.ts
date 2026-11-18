// Requirement 6.2, 6.3, 6.4, 6.5, 6.8
import { DAY_MS } from '../constants';

const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/;

/**
 * Parses an ISO 8601 UTC timestamp (`YYYY-MM-DDTHH:mm:ss` with an optional
 * fraction of 1 to 9 digits and the suffix `Z`) into epoch milliseconds.
 * Digits beyond the millisecond are truncated. Returns null for anything
 * else, including non-strings and calendar dates or times that do not exist.
 * Never throws and never reads the clock.
 */
export function parseIsoInstant(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const m = ISO_INSTANT.exec(value);
  if (m === null) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);
  const fraction = m[7] === undefined ? '0' : m[7].slice(0, 3).padEnd(3, '0');
  const millis = Number(fraction);
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  d.setUTCHours(hour, minute, second, millis);
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  const ms = d.getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Whole days from `date` to `asOf`: `floor((asOf - date) / DAY_MS)`, clamped
 * to 0 when `date` is after `asOf`. Null when either argument is not a valid
 * ISO 8601 UTC timestamp.
 */
export function dayCount(date: unknown, asOf: string): number | null {
  const asOfMs = parseIsoInstant(asOf);
  if (asOfMs === null) return null;
  const dateMs = parseIsoInstant(date);
  if (dateMs === null) return null;
  if (dateMs >= asOfMs) return 0;
  return Math.floor((asOfMs - dateMs) / DAY_MS);
}
