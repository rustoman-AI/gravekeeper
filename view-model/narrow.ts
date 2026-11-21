// Requirement 14.5, 6.6: total narrowing of untrusted values. Nothing here throws.
import { isStrictVersion, type Severity } from '../core';
import { HINT_TEXT_MAX_LENGTH, HINTS_MAX_PER_PACKAGE } from '../pipeline/constants';
import type {
  AdvisoryExclusion,
  NarrowedFacts,
  ParsedAdvisory,
  ParsedHint,
  ParsedUpgrade,
  VersionBasis,
} from './types';
import { advisoryLink } from './urls';

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

/** Characters that normalizeHintText replaces by a space (Requirement 4.7); a text holding one is not trusted. */
function isRemovedChar(cp: number): boolean {
  return (
    cp <= 0x1f ||
    (cp >= 0x7f && cp <= 0x9f) ||
    cp === 0x2028 ||
    cp === 0x2029 ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2066 && cp <= 0x2069) ||
    cp === 0x200e ||
    cp === 0x200f ||
    (cp >= 0xd800 && cp <= 0xdfff)
  );
}

function isValidHintText(value: unknown): value is string {
  if (typeof value !== 'string' || value === '') return false;
  let count = 0;
  for (const ch of value) {
    count += 1;
    if (count > HINT_TEXT_MAX_LENGTH) return false;
    if (isRemovedChar(ch.codePointAt(0) ?? 0)) return false;
  }
  return true;
}

/**
 * Resurrect R4.7, 4.9, 4.10: total, order-keeping and idempotent narrowing of upstream hints.
 * A missing or non-array value gives []. The link is computed here, never taken from the input.
 */
export function narrowHints(value: unknown): readonly ParsedHint[] {
  if (!Array.isArray(value)) return [];
  const kept: ParsedHint[] = [];
  for (const entry of value as readonly unknown[]) {
    if (kept.length >= HINTS_MAX_PER_PACKAGE) break;
    if (!isRecord(entry)) continue;
    const { kind, text, sourceUrl } = entry;
    if (kind !== 'deprecation-notice' && kind !== 'advisory-notice') continue;
    if (!isValidHintText(text)) continue;
    const safeUrl = advisoryLink(sourceUrl);
    kept.push({
      kind,
      text,
      sourceUrl: safeUrl,
      link: kind === 'advisory-notice' && safeUrl !== null ? { href: safeUrl, label: 'Read the advisory' } : null,
    });
  }
  return kept;
}

/**
 * resurrect-upgrade R5.6, R5.7: total and idempotent narrowing of the registry-default upgrade.
 * Null unless the value is a record with exactly the keys ersion and asis, asis is
 * egistry-default, the version is a Strict_Version for the ecosystem and differs from lookupVersion.
 */
export function narrowUpgrade(value: unknown, ecosystem: unknown, lookupVersion: unknown): ParsedUpgrade | null {
  try {
    if (!isRecord(value)) return null;
    const keys = Object.keys(value);
    if (keys.length !== 2 || !keys.includes('version') || !keys.includes('basis')) return null;
    const { version, basis } = value;
    if (basis !== 'registry-default') return null;
    if (typeof version !== 'string' || !isStrictVersion(ecosystem, version)) return null;
    if (version === lookupVersion) return null;
    return { version, basis: 'registry-default' };
  } catch {
    return null;
  }
}