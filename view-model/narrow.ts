// Requirement 14.5, 6.6: total narrowing of untrusted values. Nothing here throws.
import type { Severity } from '../core';
import type {
  AdvisoryExclusion,
  NarrowedFacts,
  ParsedAdvisory,
  VersionBasis,
} from './types';

const SEVERITIES: readonly string[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Same host shape the pipeline accepts for a configured web host (github-config HOST_NAME).
const REPO_HOST = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;
// Same character set as the sourceRepo pattern of Requirement 21, criterion 3.
const REPO_NAME_PART = /^[A-Za-z0-9_.-]+$/;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function hostIsUrlSafe(host: string): boolean {
  if (!REPO_HOST.test(host)) return false;
  try {
    return new URL(`https://${host}/`).hostname === host;
  } catch {
    return false;
  }
}

function encodesCleanly(value: string): boolean {
  try {
    encodeURIComponent(value);
    return true;
  } catch {
    return false; // lone surrogate
  }
}

/**
 * Requirement 21, criterion 3 and Requirement 14, criterion 2: the parts of the Canonical_Repo_URL
 * must be validated before any link is built from them. Total, never throws.
 */
export function isValidRepo(repo: unknown): boolean {
  if (!isRecord(repo)) return false;
  const { host, owner, repo: name, branch, defaultBranch } = repo;
  return (
    typeof host === 'string' &&
    hostIsUrlSafe(host) &&
    typeof owner === 'string' &&
    REPO_NAME_PART.test(owner) &&
    typeof name === 'string' &&
    REPO_NAME_PART.test(name) &&
    isNonEmptyString(branch) &&
    encodesCleanly(branch) &&
    isNonEmptyString(defaultBranch) &&
    encodesCleanly(defaultBranch)
  );
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function severityOrNull(value: unknown): Severity | null {
  return typeof value === 'string' && SEVERITIES.includes(value) ? (value as Severity) : null;
}

/** Each of the seven facts becomes a valid value or null (the Unknown_Value). */
export function narrowFacts(facts: unknown): NarrowedFacts {
  const f = isRecord(facts) ? facts : {};
  return {
    daysSinceLastRelease: nonNegativeInteger(f['daysSinceLastRelease']),
    daysSinceLastCommit: nonNegativeInteger(f['daysSinceLastCommit']),
    archived: booleanOrNull(f['archived']),
    deprecated: booleanOrNull(f['deprecated']),
    openVulnerabilityCount: nonNegativeInteger(f['openVulnerabilityCount']),
    maxSeverity: severityOrNull(f['maxSeverity']),
    maintainerCount: nonNegativeInteger(f['maintainerCount']),
  };
}

function narrowExclusion(value: unknown): AdvisoryExclusion {
  if (value === null) return 'counted';
  if (value === 'informational') return 'informational';
  if (value === 'withdrawn') return 'withdrawn';
  return 'unknown';
}

/** Keeps an entry only when id is a non-empty string, aliases a list of strings, severity a Severity or null, url a string. */
export function narrowAdvisories(advisories: unknown): readonly ParsedAdvisory[] {
  if (!Array.isArray(advisories)) return [];
  const kept: ParsedAdvisory[] = [];
  for (const entry of advisories as readonly unknown[]) {
    if (!isRecord(entry)) continue;
    const { id, aliases, severity, url } = entry;
    if (typeof id !== 'string' || id === '') continue;
    if (!Array.isArray(aliases) || !(aliases as readonly unknown[]).every((a) => typeof a === 'string')) continue;
    if (severity !== null && severityOrNull(severity) === null) continue;
    if (typeof url !== 'string') continue;
    kept.push({
      id,
      aliases: aliases as readonly string[],
      severity: severity as Severity | null,
      url,
      exclusion: narrowExclusion(entry['excluded']),
    });
  }
  return kept;
}

export function narrowVersionBasis(value: unknown): VersionBasis {
  return value === 'pinned' || value === 'resolved' || value === 'default' ? value : null;
}
