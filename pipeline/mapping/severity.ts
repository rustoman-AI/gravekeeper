import type { Severity } from '@/core';
import { cvssSeverity, severityFromScore } from './cvss';
import { readOwn } from './read-own';

// Requirement 10.5, 10.6, 10.7, 10.14, 9.21

const RANK: Readonly<Record<Severity, number>> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

function highestOf(values: readonly (Severity | null)[]): Severity | null {
  let best: Severity | null = null;
  for (const value of values) {
    if (value !== null && (best === null || RANK[value] > RANK[best])) best = value;
  }
  return best;
}

/** Severities of the `severity[]` entries of type `CVSS_V3` with a string score; other entries are ignored. */
function cvssEntrySeverities(osvBody: unknown): (Severity | null)[] {
  try {
    const entries = readOwn(osvBody, 'severity');
    if (!Array.isArray(entries)) return [];
    const result: (Severity | null)[] = [];
    for (let i = 0; i < entries.length; i++) {
      const entry: unknown = entries[i];
      if (readOwn(entry, 'type') !== 'CVSS_V3') continue;
      const score = readOwn(entry, 'score');
      if (typeof score !== 'string') continue;
      result.push(cvssSeverity(score));
    }
    return result;
  } catch {
    return [];
  }
}

/** Severity of one Advisory in the order of R10.5: Advisory_Score, label, CVSS_V3 entries, unknown. */
export function severityOf(advisoryScore: number | null, osvBody: unknown): Severity | null {
  if (advisoryScore !== null) return severityFromScore(advisoryScore);
  const label = readOwn(readOwn(osvBody, 'database_specific'), 'severity');
  if (label === 'LOW' || label === 'HIGH' || label === 'CRITICAL') return label;
  if (label === 'MODERATE') return 'MEDIUM';
  return highestOf(cvssEntrySeverities(osvBody));
}

/** The valid Advisory_Score of a deps.dev advisory body: a finite JSON number in [0, 10], else null. */
export function mapDepsDevAdvisory(body: unknown): number | null {
  const score = readOwn(body, 'cvss3Score');
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 10) return null;
  return score;
}
