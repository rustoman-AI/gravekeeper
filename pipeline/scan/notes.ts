// Requirement 17.9, 17.15, 20.5, 21.5
// One builder per Scan_Note code. Every message comes from `renderNoteMessage`; `details` keys
// are exactly those of the Scan_Note codes table.
import type { Ecosystem } from '@/core';
import type { JsonValue } from '../ports/cache';
import { renderNoteMessage } from './messages';
import type { SourceNoteData } from './source-status';
import type { NoteCode, ScanCapped, ScanNote } from './types';

type Details = { readonly [key: string]: JsonValue };

function note(code: NoteCode, details?: Details): ScanNote {
  const message = renderNoteMessage(code, details);
  return details === undefined ? { code, message } : { code, message, details };
}

/** Copy sorted ascending by Unicode code point (no locale). */
function byCodePoint(values: readonly string[]): string[] {
  return [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

const target = (ecosystem: Ecosystem, name: string): Details => ({ ecosystem, name });

export const treeTruncatedNote = (): ScanNote => note('tree-truncated');
export const noManifestsNote = (): ScanNote => note('no-manifests');
export const noRootManifestNote = (paths: readonly string[]): ScanNote =>
  note('no-root-manifest', { paths: [...paths] });
export const manifestTooLargeNote = (path: string): ScanNote =>
  note('manifest-too-large', { path });
export const manifestFetchFailedNote = (path: string): ScanNote =>
  note('manifest-fetch-failed', { path });
export const pinNotFoundNote = (ecosystem: Ecosystem, name: string, pinned: string): ScanNote =>
  note('pin-not-found', { ...target(ecosystem, name), pinned });
export const noDefaultVersionNote = (ecosystem: Ecosystem, name: string): ScanNote =>
  note('no-default-version', target(ecosystem, name));
/** `pins`: distinct, ascending by code point. */
export const conflictingPinsNote = (
  ecosystem: Ecosystem,
  name: string,
  pins: readonly string[],
): ScanNote =>
  note('conflicting-pins', { ...target(ecosystem, name), pins: byCodePoint(unique(pins)) });
export const packageNotFoundNote = (ecosystem: Ecosystem, name: string): ScanNote =>
  note('package-not-found', target(ecosystem, name));
export const batchFallbackNote = (): ScanNote => note('batch-fallback');
export const sourceRepoUnverifiedNote = (
  ecosystem: Ecosystem,
  name: string,
  sourceRepo: string,
): ScanNote => note('source-repo-unverified', { ...target(ecosystem, name), sourceRepo });
/** `ids`: distinct, ascending by code point. */
export const informationalAdvisoryExcludedNote = (
  ecosystem: Ecosystem,
  name: string,
  ids: readonly string[],
): ScanNote =>
  note('informational-advisory-excluded', {
    ...target(ecosystem, name),
    ids: byCodePoint(unique(ids)),
  });
export const advisoryDetailsIncompleteNote = (
  ecosystem: Ecosystem,
  name: string,
  ids: readonly string[],
): ScanNote =>
  note('advisory-details-incomplete', { ...target(ecosystem, name), ids: byCodePoint(unique(ids)) });
export const osvPaginationIgnoredNote = (ecosystem: Ecosystem, name: string): ScanNote =>
  note('osv-pagination-ignored', target(ecosystem, name));
export const githubTokenMissingNote = (): ScanNote => note('github-token-missing');
/** `resetAt` is omitted from `details` when not observed. */
export const githubBudgetLowNote = (remaining: number, resetAt?: string | null): ScanNote =>
  note(
    'github-budget-low',
    resetAt === undefined || resetAt === null ? { remaining } : { remaining, resetAt },
  );
export const maintainersLowerBoundNote = (ecosystem: Ecosystem, name: string): ScanNote =>
  note('maintainers-lower-bound', target(ecosystem, name));
/** Takes `limit` and `total` of the `capped` of the target plan (R16.3). */
export const dependencyCapExceededNote = (
  capped: Pick<ScanCapped, 'limit' | 'total'>,
): ScanNote => note('dependency-cap-exceeded', { limit: capped.limit, total: capped.total });
export const scanDeadlineReachedNote = (): ScanNote => note('scan-deadline-reached');
export const unmaintainedAdvisoryNote = (
  ecosystem: Ecosystem,
  name: string,
  ids: readonly string[],
): ScanNote =>
  note('unmaintained-advisory', { ...target(ecosystem, name), ids: byCodePoint(unique(ids)) });

/**
 * `source-partial` or `source-failed` from the data of `source-status.ts` (R17.9).
 * `reasons` is unique and in code point order. This is the `makeNote` argument of `buildSourceNotes`.
 */
export function makeSourceNote(data: SourceNoteData): ScanNote {
  return note(data.status === 'failed' ? 'source-failed' : 'source-partial', {
    source: data.source,
    reasons: byCodePoint(unique(data.reasons)),
    failedUnits: data.failedUnits,
    applicableUnits: data.applicableUnits,
  });
}
