import { HINTS_MAX_PER_PACKAGE } from '../constants';
import { advisoryUrl } from './advisories';
import { compareCodePoints } from './compare-code-points';
import { normalizeHintText } from './hint-text';
import { readOwn } from './read-own';
import type { AdvisoryRecord, UpstreamHint } from './types';

/**
 * Requirement 2.1, 2.2, 2.3: the npm `deprecated` string of the latest
 * version document becomes one `deprecation-notice` hint with no source
 * URL (Requirement 2.5). Absent, empty or non-string values give no hint.
 * Total: never throws.
 */
export function npmDeprecationHint(latestBody: unknown): UpstreamHint[] {
  try {
    const text = normalizeHintText(readOwn(latestBody, 'deprecated'));
    if (text === null) return [];
    return [{ kind: 'deprecation-notice', text, sourceUrl: null }];
  } catch {
    return [];
  }
}

interface Candidate {
  readonly id: string;
  readonly text: string;
}

/** Requirement 3.2, 3.5, 3.7: text from details, else summary; null when neither is left. */
function candidateOf(record: AdvisoryRecord): Candidate | null {
  try {
    if (readOwn(record, 'withdrawn') === true) return null;
    if (readOwn(record, 'unmaintained') !== true) return null;
    const id = readOwn(record, 'id');
    if (typeof id !== 'string') return null;
    const text =
      normalizeHintText(readOwn(record, 'details')) ??
      normalizeHintText(readOwn(record, 'summary'));
    if (text === null) return null;
    return { id, text };
  } catch {
    return null;
  }
}

/**
 * Requirement 3.1 to 3.5, 3.7: one `advisory-notice` hint per non-withdrawn
 * unmaintained advisory, ids ascending by code point, de-duplicated, at most
 * HINTS_MAX_PER_PACKAGE. Total: never throws.
 */
export function advisoryNoticeHints(records: readonly AdvisoryRecord[]): UpstreamHint[] {
  try {
    const byId = new Map<string, Candidate>();
    for (const record of records) {
      const candidate = candidateOf(record);
      if (candidate !== null && !byId.has(candidate.id)) byId.set(candidate.id, candidate);
    }
    const sorted = [...byId.values()].sort((a, b) => compareCodePoints(a.id, b.id));
    return sorted.slice(0, HINTS_MAX_PER_PACKAGE).map((c) => ({
      kind: 'advisory-notice' as const,
      text: c.text,
      sourceUrl: advisoryUrl(c.id),
    }));
  } catch {
    return [];
  }
}

/**
 * Requirement 2.1, 2.2, 2.4, 2.5: the deprecation notice of the Checked_Version
 * document wins; when it gives no hint, the `/latest` notice is the fallback.
 * Either body may be absent. At most one hint, no source URL. Total: never throws.
 */
export function combineNpmHints(versionBody: unknown, latestBody: unknown): UpstreamHint[] {
  try {
    const fromVersion = npmDeprecationHint(versionBody);
    if (fromVersion.length > 0) return fromVersion;
    return npmDeprecationHint(latestBody);
  } catch {
    return [];
  }
}
