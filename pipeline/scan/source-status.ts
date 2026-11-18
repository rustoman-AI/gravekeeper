// Requirement 17.1, 17.2, 17.3, 17.4, 17.5, 17.8, 17.9, 17.13, 17.14, 17.15, 17.16
import type { ReasonCategory, SourceName } from '../ports';
import type { LedgerEntry, ScanNote, SourceStatus } from './types';

const SOURCE_ORDER: readonly SourceName[] = [
  'github',
  'depsdev',
  'osv',
  'npm',
  'cratesio',
  'pypi',
];

export interface SourceStatusOptions {
  /** True when a querybatch result had a non-empty `next_page_token` (R17.13). Such a unit itself counts as `ok`. */
  readonly osvTruncated?: boolean;
}

/** Structured data of one `source-partial` or `source-failed` note (R17.9). */
export interface SourceNoteData {
  readonly source: SourceName;
  readonly status: 'partial' | 'failed';
  /** Distinct, ascending by Unicode code point. */
  readonly reasons: readonly ReasonCategory[];
  readonly failedUnits: number;
  readonly applicableUnits: number;
}

interface SourceTally {
  applicable: number;
  failed: number;
  ok: number;
  deadline: number;
  reasons: Set<ReasonCategory>;
}

function tally(entries: readonly LedgerEntry[], source: SourceName): SourceTally {
  const t: SourceTally = { applicable: 0, failed: 0, ok: 0, deadline: 0, reasons: new Set() };
  for (const entry of entries) {
    if (entry.source !== source) continue;
    t.applicable += 1;
    if (entry.outcome.ok) {
      t.ok += 1;
    } else {
      t.failed += 1;
      t.reasons.add(entry.outcome.reason);
      if (entry.outcome.reason === 'deadline') t.deadline += 1;
    }
  }
  return t;
}

function statusOf(t: SourceTally, truncated: boolean): SourceStatus {
  let status: SourceStatus;
  if (t.failed === 0) status = 'ok';
  else if (t.ok > 0 || t.deadline > 0) status = 'partial';
  else status = 'failed';
  if (truncated && status === 'ok') return 'partial';
  return status;
}

function isTruncated(source: SourceName, options: SourceStatusOptions | undefined): boolean {
  return source === 'osv' && options?.osvTruncated === true;
}

/** R17.1 to R17.5, R17.13: exactly one status per source. */
export function computeSourceStatuses(
  entries: readonly LedgerEntry[],
  options?: SourceStatusOptions,
): { readonly [S in SourceName]: SourceStatus } {
  const out = {} as { [S in SourceName]: SourceStatus };
  for (const source of SOURCE_ORDER) {
    out[source] = statusOf(tally(entries, source), isTruncated(source, options));
  }
  return out;
}

/** Note data for every source whose status is not `ok`, in the fixed source order (R17.9, R17.13). */
export function collectSourceNoteData(
  entries: readonly LedgerEntry[],
  options?: SourceStatusOptions,
): readonly SourceNoteData[] {
  const data: SourceNoteData[] = [];
  for (const source of SOURCE_ORDER) {
    const t = tally(entries, source);
    const truncated = isTruncated(source, options);
    const status = statusOf(t, truncated);
    if (status === 'ok') continue;
    const reasons = new Set(t.reasons);
    if (truncated) reasons.add('truncated');
    data.push({
      source,
      status,
      reasons: [...reasons].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
      failedUnits: t.failed,
      applicableUnits: t.applicable,
    });
  }
  return data;
}

/**
 * One `source-failed` or `source-partial` note per non-`ok` source (R17.9).
 * The message text and note shape come from `makeNote`, so this module holds
 * no message text.
 */
export function buildSourceNotes(
  entries: readonly LedgerEntry[],
  makeNote: (data: SourceNoteData) => ScanNote,
  options?: SourceStatusOptions,
): readonly ScanNote[] {
  return collectSourceNoteData(entries, options).map(makeNote);
}
