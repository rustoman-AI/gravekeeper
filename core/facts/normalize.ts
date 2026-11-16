// Fact normalization: turns untrusted input into Valid_Facts or Unknown_Facts (null).
import { SEVERITIES } from '../model/constants';
import type { HealthFactField, Severity } from '../model/types';

export const HEALTH_FACT_FIELDS = [
  'daysSinceLastRelease',
  'daysSinceLastCommit',
  'archived',
  'deprecated',
  'openVulnerabilityCount',
  'maxSeverity',
  'maintainerCount',
] as const satisfies readonly HealthFactField[];

export interface NormalizedFacts {
  readonly daysSinceLastRelease: number | null;
  readonly daysSinceLastCommit: number | null;
  readonly archived: boolean | null;
  readonly deprecated: boolean | null;
  readonly openVulnerabilityCount: number | null;
  readonly maxSeverity: Severity | null;
  readonly maintainerCount: number | null;
  readonly unknownFields: readonly HealthFactField[];
}

type Check = (value: unknown) => boolean;

const isDays: Check = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isCount: Check = (v) => isDays(v) && Number.isInteger(v);
const isBool: Check = (v) => typeof v === 'boolean';
const isSeverity: Check = (v) => typeof v === 'string' && (SEVERITIES as readonly string[]).includes(v);

const CHECKS: Readonly<Record<HealthFactField, Check>> = {
  daysSinceLastRelease: isDays,
  daysSinceLastCommit: isDays,
  archived: isBool,
  deprecated: isBool,
  openVulnerabilityCount: isCount,
  maxSeverity: isSeverity,
  maintainerCount: isCount,
};

/** Own-property read only; a throwing getter or trap yields undefined (an Unknown_Fact). */
function readOwn(input: unknown, field: HealthFactField): unknown {
  try {
    if (typeof input === 'object' && input !== null && Object.hasOwn(input, field)) {
      return (input as Record<string, unknown>)[field];
    }
  } catch {
    // fall through: unreadable field is unknown
  }
  return undefined;
}

// Requirements 6.2, 6.4, 6.5, 6.6, 6.7
export function normalizeFacts(input: unknown): NormalizedFacts {
  const values: Record<string, unknown> = {};
  const unknownFields: HealthFactField[] = [];
  for (const field of HEALTH_FACT_FIELDS) {
    const raw = readOwn(input, field);
    if (CHECKS[field](raw)) {
      values[field] = raw;
    } else {
      values[field] = null;
      unknownFields.push(field);
    }
  }
  return { ...(values as Omit<NormalizedFacts, 'unknownFields'>), unknownFields };
}
