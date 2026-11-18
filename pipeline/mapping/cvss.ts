import type { Severity } from '@/core';
import { CVSS_RANGES } from '../constants';

// Requirement 10.1, 10.2, 10.3, 10.4, 10.14

type Version = '3.0' | '3.1';

const PREFIX_30 = 'CVSS:3.0/';
const PREFIX_31 = 'CVSS:3.1/';

const BASE_KEYS = ['AV', 'AC', 'PR', 'UI', 'S', 'C', 'I', 'A'] as const;
type BaseKey = (typeof BASE_KEYS)[number];

const ALLOWED: Readonly<Record<BaseKey, string>> = {
  AV: 'NALP',
  AC: 'LH',
  PR: 'NLH',
  UI: 'NR',
  S: 'UC',
  C: 'NLH',
  I: 'NLH',
  A: 'NLH',
};

const AV_WEIGHT: Readonly<Record<string, number>> = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 };
const AC_WEIGHT: Readonly<Record<string, number>> = { L: 0.77, H: 0.44 };
const UI_WEIGHT: Readonly<Record<string, number>> = { N: 0.85, R: 0.62 };
const CIA_WEIGHT: Readonly<Record<string, number>> = { H: 0.56, L: 0.22, N: 0 };
const PR_UNCHANGED: Readonly<Record<string, number>> = { N: 0.85, L: 0.62, H: 0.27 };
const PR_CHANGED: Readonly<Record<string, number>> = { N: 0.85, L: 0.68, H: 0.5 };

function parseVector(vector: unknown): { version: Version; metrics: Record<BaseKey, string> } | null {
  if (typeof vector !== 'string') return null;
  let version: Version;
  let rest: string;
  if (vector.startsWith(PREFIX_31)) {
    version = '3.1';
    rest = vector.slice(PREFIX_31.length);
  } else if (vector.startsWith(PREFIX_30)) {
    version = '3.0';
    rest = vector.slice(PREFIX_30.length);
  } else {
    return null;
  }
  if (/\s/.test(rest)) return null;
  const segments = rest.split('/');
  if (segments.length !== BASE_KEYS.length) return null;
  const found = new Map<string, string>();
  for (const segment of segments) {
    const parts = segment.split(':');
    if (parts.length !== 2) return null;
    const key = parts[0] as string;
    const value = parts[1] as string;
    if (!(BASE_KEYS as readonly string[]).includes(key)) return null;
    if (found.has(key)) return null;
    if (value.length !== 1 || !ALLOWED[key as BaseKey].includes(value)) return null;
    found.set(key, value);
  }
  if (found.size !== BASE_KEYS.length) return null;
  const metrics = {} as Record<BaseKey, string>;
  for (const key of BASE_KEYS) metrics[key] = found.get(key) as string;
  return { version, metrics };
}

// CVSS 3.0 round-up: smallest number with one decimal that is >= input.
function roundUp30(value: number): number {
  return Math.ceil(value * 10) / 10;
}

// CVSS 3.1 Appendix A round-up, immune to floating point noise.
function roundUp31(value: number): number {
  const int = Math.round(value * 100000);
  if (int % 10000 === 0) return int / 100000;
  return (Math.floor(int / 10000) + 1) / 10;
}

/** Returns the base score (0.0 to 10.0, one decimal) of a CVSS 3.0 or 3.1 base vector, or null when invalid. */
export function cvssV3BaseScore(vector: unknown): number | null {
  const parsed = parseVector(vector);
  if (parsed === null) return null;
  const { version, metrics: m } = parsed;
  const roundUp = version === '3.1' ? roundUp31 : roundUp30;
  const changed = m.S === 'C';

  const iss =
    1 -
    (1 - (CIA_WEIGHT[m.C] as number)) *
      (1 - (CIA_WEIGHT[m.I] as number)) *
      (1 - (CIA_WEIGHT[m.A] as number));
  const impact = changed ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15) : 6.42 * iss;
  if (impact <= 0) return 0;

  const pr = (changed ? PR_CHANGED : PR_UNCHANGED)[m.PR] as number;
  const exploitability =
    8.22 * (AV_WEIGHT[m.AV] as number) * (AC_WEIGHT[m.AC] as number) * pr * (UI_WEIGHT[m.UI] as number);

  const raw = changed ? 1.08 * (impact + exploitability) : impact + exploitability;
  return roundUp(Math.min(raw, 10));
}

/** Maps a score to a Severity using CVSS_RANGES, comparing the unrounded value; 0.0 gives null. */
export function severityFromScore(score: number): Severity | null {
  if (!(score > 0)) return null;
  for (let i = CVSS_RANGES.length - 1; i >= 0; i--) {
    const range = CVSS_RANGES[i];
    if (range !== undefined && score >= range.min) return range.severity;
  }
  return CVSS_RANGES[0]?.severity ?? null;
}

/** Severity of a CVSS 3.0 or 3.1 base vector; null for 0.0 and for any invalid input. */
export function cvssSeverity(vector: unknown): Severity | null {
  const score = cvssV3BaseScore(vector);
  return score === null ? null : severityFromScore(score);
}
