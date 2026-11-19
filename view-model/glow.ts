import { DEFAULT_SEVERITY, type Severity } from '../core';
import { GLOW_LEVELS } from './constants';
import type { GlowLevel } from './types';

export { GLOW_LEVELS, DEFAULT_SEVERITY };

const SEVERITY_ORDER: readonly Severity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** Highest non-null severity, or null when there is none. */
export function maxSeverityOf(severities: readonly (Severity | null | undefined)[]): Severity | null {
  let best: Severity | null = null;
  for (const s of severities) {
    if (s === null || s === undefined) continue;
    if (best === null || SEVERITY_ORDER.indexOf(s) > SEVERITY_ORDER.indexOf(best)) best = s;
  }
  return best;
}

// Requirement 7.7: advisory severities, then facts.maxSeverity, then DEFAULT_SEVERITY.
export function glowOf(
  advisorySeverities: readonly (Severity | null | undefined)[],
  factSeverities: readonly (Severity | null | undefined)[],
): GlowLevel {
  const severity = maxSeverityOf(advisorySeverities) ?? maxSeverityOf(factSeverities) ?? DEFAULT_SEVERITY;
  return GLOW_LEVELS[severity];
}
