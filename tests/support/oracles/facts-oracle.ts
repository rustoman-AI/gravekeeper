// Independent oracle for Health_Facts properties (design: Generator strategy: facts).
// Valid_Fact, Unknown_Fact, vulnerable, abandoned and dormant are re-implemented here from the glossary
// and criteria 6.2, 6.6, 7.1, 8.1 to 8.4, so a bug in core/facts cannot hide itself. Only constants and
// types are imported from core; no production predicate or normalizer is called.
import type { HealthFactField } from '../../../core/model';
import { ABANDONMENT_DAYS, STALE_DAYS } from '../../../core/model';

/** All Health_Facts field names, in the canonical order of the glossary. */
export const FACT_FIELDS: readonly HealthFactField[] = [
  'daysSinceLastRelease',
  'daysSinceLastCommit',
  'archived',
  'deprecated',
  'openVulnerabilityCount',
  'maxSeverity',
  'maintainerCount',
];

const SEVERITY_NAMES: readonly string[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** Valid_Fact check for one field, from the glossary type rules. `null`, missing and any other value are Unknown_Facts. */
export function oracleIsValidFact(field: HealthFactField, value: unknown): boolean {
  switch (field) {
    case 'daysSinceLastRelease':
    case 'daysSinceLastCommit':
      return typeof value === 'number' && Number.isFinite(value) && value >= 0;
    case 'openVulnerabilityCount':
    case 'maintainerCount':
      return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
    case 'archived':
    case 'deprecated':
      return typeof value === 'boolean';
    case 'maxSeverity':
      return typeof value === 'string' && SEVERITY_NAMES.includes(value);
  }
}

/**
 * Reads a field from an arbitrary input without trusting it. Non-objects and throwing getters yield `undefined`,
 * which is an Unknown_Fact. Only own and inherited string-keyed reads on objects and functions are attempted.
 */
export function oracleReadField(input: unknown, field: HealthFactField): unknown {
  if ((typeof input !== 'object' && typeof input !== 'function') || input === null) return undefined;
  try {
    return (input as Record<string, unknown>)[field];
  } catch {
    return undefined;
  }
}

/** Returns the field's value when it is a Valid_Fact, otherwise `null`. */
export function oracleFactValue(input: unknown, field: HealthFactField): unknown {
  const v = oracleReadField(input, field);
  return oracleIsValidFact(field, v) ? v : null;
}

/** Expected Unknown_Fact field names (criterion 6.3), in canonical order, each once. */
export function oracleUnknownFields(input: unknown): HealthFactField[] {
  return FACT_FIELDS.filter((f) => !oracleIsValidFact(f, oracleReadField(input, f)));
}

function validNumber(input: unknown, field: HealthFactField): number | null {
  const v = oracleFactValue(input, field);
  return typeof v === 'number' ? v : null;
}

/** Criterion 7.1: `openVulnerabilityCount` is a Valid_Fact integer >= 1. */
export function oracleVulnerable(input: unknown): boolean {
  const n = validNumber(input, 'openVulnerabilityCount');
  return n !== null && n >= 1;
}

/** Criterion 8.3 condition: release is a Valid_Fact >= ABANDONMENT_DAYS and commit is Valid_Fact >= STALE_DAYS or Unknown_Fact. */
export function oracleReleaseAbandoned(input: unknown): boolean {
  const release = validNumber(input, 'daysSinceLastRelease');
  if (release === null || release < ABANDONMENT_DAYS) return false;
  const commit = validNumber(input, 'daysSinceLastCommit');
  return commit === null || commit >= STALE_DAYS;
}

/** Glossary "Abandoned": archived, deprecated, or the 8.3 condition. `maintainerCount` has no influence. */
export function oracleAbandoned(input: unknown): boolean {
  return (
    oracleFactValue(input, 'archived') === true ||
    oracleFactValue(input, 'deprecated') === true ||
    oracleReleaseAbandoned(input)
  );
}

/** Glossary "Dormant" (criterion 8.4): release Valid_Fact >= ABANDONMENT_DAYS and commit Valid_Fact < STALE_DAYS. */
export function oracleDormant(input: unknown): boolean {
  const release = validNumber(input, 'daysSinceLastRelease');
  const commit = validNumber(input, 'daysSinceLastCommit');
  return release !== null && release >= ABANDONMENT_DAYS && commit !== null && commit < STALE_DAYS;
}

/** Criterion 10.6 condition: release is a Valid_Fact in [STALE_DAYS, ABANDONMENT_DAYS). */
export function oracleStaleRelease(input: unknown): boolean {
  const release = validNumber(input, 'daysSinceLastRelease');
  return release !== null && release >= STALE_DAYS && release < ABANDONMENT_DAYS;
}

export interface OracleFlags {
  readonly vulnerable: boolean;
  readonly abandoned: boolean;
  readonly dormant: boolean;
}

export function oracleFlags(input: unknown): OracleFlags {
  return { vulnerable: oracleVulnerable(input), abandoned: oracleAbandoned(input), dormant: oracleDormant(input) };
}

/** Criteria 9.1 to 9.4. */
export function oracleStatus(input: unknown): 'HAUNTED' | 'DEAD' | 'ALIVE' {
  if (oracleVulnerable(input)) return 'HAUNTED';
  return oracleAbandoned(input) ? 'DEAD' : 'ALIVE';
}
