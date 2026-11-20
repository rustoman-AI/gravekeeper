import { buildAdvisoryGroups } from './advisory-groups';
import { FACT_LABELS } from './fact-labels';
import { FACT_FIELDS, formatFact } from './format-fact';
import { unassessedLabelOf } from './package-rows';
import type { DetailModel, PackageKeyString, PackageRow, ParsedScanResult } from './types';
import { registryLink, sourceRepoLink } from './urls';

type Note = ParsedScanResult['notes'][number];

const OTHER_HEADING = 'Other notes';

/**
 * Requirement 10.9: themed heading per note code, in display order. The Notes_Model (Requirement 11.7)
 * uses the same codes; unknown codes go to "Other notes".
 */
const NOTE_HEADINGS: readonly (readonly [code: string, heading: string])[] = [
  ['github-token-missing', 'The caretaker has no key to the GitHub gate'],
  ['github-budget-low', 'The caretaker is running low on GitHub visits'],
  ['dependency-cap-exceeded', 'The caretaker stopped counting graves'],
  ['scan-deadline-reached', 'The night ran short'],
  ['source-partial', 'A record office answered in part'],
  ['source-failed', 'A record office did not answer'],
  ['batch-fallback', 'The caretaker took the slow road'],
  ['package-not-found', 'No record of this package'],
  ['no-default-version', 'No default version on record'],
  ['pin-not-found', 'The pinned version is not on record'],
  ['conflicting-pins', 'The manifests disagree on the version'],
  ['range-unresolved', 'The version range could not be resolved'],
  ['advisory-details-incomplete', 'The advisory records are incomplete'],
  ['osv-pagination-ignored', 'More advisories may exist'],
  ['maintainers-lower-bound', 'The maintainer count may be low'],
  ['source-repo-unverified', 'A source repository, unverified'],
  ['informational-advisory-excluded', 'Informational advisories, not counted'],
  ['unmaintained-advisory', 'Flagged as unmaintained'],
  ['tree-truncated', 'The plot map is cut short'],
  ['no-manifests', 'No manifests on the plot map'],
  ['no-root-manifest', 'No manifest at the root'],
  ['manifest-too-large', 'A manifest is too large to read'],
  ['manifest-fetch-failed', 'A manifest could not be fetched'],
];
const HEADING_BY_CODE = new Map(NOTE_HEADINGS);
const HEADING_RANK = new Map(NOTE_HEADINGS.map(([code], i) => [code, i] as const));
const VERSION_NOTE_CODES: ReadonlySet<string> = new Set([
  'pin-not-found',
  'conflicting-pins',
  'range-unresolved',
  'no-default-version',
]);

function detailString(note: Note, key: string): string | null {
  const v = note.details?.[key];
  return typeof v === 'string' ? v : null;
}

/** DG-14: notes whose details.ecosystem and details.name equal the package. */
function notesOf(row: PackageRow, notes: readonly Note[]): readonly Note[] {
  return notes.filter(
    (n) => detailString(n, 'ecosystem') === row.ecosystem && detailString(n, 'name') === row.name,
  );
}

function informationalIds(notes: readonly Note[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const n of notes) {
    if (n.code !== 'informational-advisory-excluded') continue;
    const list = n.details?.ids;
    if (!Array.isArray(list)) continue;
    for (const id of list) if (typeof id === 'string') ids.add(id);
  }
  return ids;
}

/** Requirement 10.6. */
function versionLineOf(row: PackageRow): string {
  const v = row.lookupVersion;
  if (v === null) return 'not looked up';
  switch (row.versionBasis) {
    case 'pinned':
      return `${v} (pinned)`;
    case 'resolved':
      return `${v} (resolved from range)`;
    case 'default':
      return `${v} (latest)`;
    default:
      return 'not looked up';
  }
}

/** Requirement 10.5. */
function maxSeverityText(row: PackageRow): string {
  const { maxSeverity, openVulnerabilityCount } = row.facts;
  if (maxSeverity !== null) return formatFact('maxSeverity', maxSeverity);
  if (openVulnerabilityCount === null) return 'unknown';
  return openVulnerabilityCount === 0 ? 'none (no open vulnerabilities)' : 'unknown, MEDIUM assumed';
}

/** Requirement 10 as a whole. Returns null when the key names no row. */
export function buildDetailModel(
  result: ParsedScanResult,
  rows: readonly PackageRow[],
  key: PackageKeyString,
): DetailModel | null {
  const row = rows.find((r) => r.key === key);
  if (row === undefined) return null;

  const mine = notesOf(row, result.notes);
  const classification = row.classification;
  const sourceRepoNote = mine.find((n) => n.code === 'source-repo-unverified');

  const notes = mine
    .map((n, i) => ({ n, i }))
    .sort(
      (a, b) =>
        (HEADING_RANK.get(a.n.code) ?? NOTE_HEADINGS.length) -
          (HEADING_RANK.get(b.n.code) ?? NOTE_HEADINGS.length) || a.i - b.i,
    )
    .map(({ n }) => ({ group: HEADING_BY_CODE.get(n.code) ?? OTHER_HEADING, message: n.message }));

  return {
    key: row.key,
    title: row.displayName,
    statusWord: row.statusWord,
    scoreText: row.score === null ? 'not assessed' : String(row.score),
    unassessedLabel: row.unassessedCause === null ? null : unassessedLabelOf(row.unassessedCause),
    reasons: (classification?.reasons ?? []).map((r) => ({
      ruleId: r.ruleId,
      message: r.message,
      isMain: r === row.strongestReason,
    })),
    facts: FACT_FIELDS.map((field) => ({
      field,
      label: FACT_LABELS[field],
      text: field === 'maxSeverity' ? maxSeverityText(row) : formatFact(field, row.facts[field]),
    })),
    versionLine: versionLineOf(row),
    versionSpecText: row.versionSpecs.join(', '),
    versionNotes: mine.filter((n) => VERSION_NOTE_CODES.has(n.code)).map((n) => n.message),
    scopes: row.scopes,
    manifestPaths: row.manifestPaths,
    rawName: row.ecosystem === 'pypi' ? row.displayName : null,
    notes,
    advisoryGroups: buildAdvisoryGroups(
      row.advisories,
      row.facts.openVulnerabilityCount,
      informationalIds(mine),
    ),
    advisoryEmptyText:
      row.advisories.length === 0 && (row.facts.openVulnerabilityCount ?? 0) > 0
        ? 'No advisory list is available for this version'
        : null,
    links: {
      registry: registryLink(row.ecosystem, row.name),
      sourceRepo: sourceRepoNote === undefined ? null : sourceRepoLink(sourceRepoNote.details?.sourceRepo),
    },
    resurrect: classification !== null && classification.status === 'DEAD',
  };
}
