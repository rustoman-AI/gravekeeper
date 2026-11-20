import type { HealthFactField } from '../core';

/** The seven facts in the order of core `HealthFacts` (Requirements 10.4, 10.15). */
export const FACT_FIELDS: readonly HealthFactField[] = [
  'daysSinceLastRelease',
  'daysSinceLastCommit',
  'archived',
  'deprecated',
  'openVulnerabilityCount',
  'maxSeverity',
  'maintainerCount',
];

const UNKNOWN = 'unknown';
const SEVERITY_WORDS: readonly string[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function isDays(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function isCount(v: unknown): v is number {
  return isDays(v) && Number.isInteger(v);
}

/**
 * Requirement 10.4, 10.14: the text of one fact. Any value that is not valid for its field is an
 * Unknown_Value and is written "unknown", never 0, "no" or empty. The validity rules are those of core.
 */
export function formatFact(field: HealthFactField, value: unknown): string {
  switch (field) {
    case 'daysSinceLastRelease':
    case 'daysSinceLastCommit':
      return isDays(value) ? `${String(value)} days` : UNKNOWN;
    case 'archived':
    case 'deprecated':
      return typeof value === 'boolean' ? (value ? 'yes' : 'no') : UNKNOWN;
    case 'openVulnerabilityCount':
    case 'maintainerCount':
      return isCount(value) ? String(value) : UNKNOWN;
    case 'maxSeverity':
      return typeof value === 'string' && SEVERITY_WORDS.includes(value) ? value : UNKNOWN;
    default:
      return UNKNOWN;
  }
}
