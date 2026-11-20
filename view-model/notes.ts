import { buildPickerModel } from './picker';
import type { NotesModel, ParsedScanResult, PickerModel, SourceName, SourceStatusWord } from './types';
import { canonicalRepoUrl } from './urls';

type Note = ParsedScanResult['notes'][number];

/** Requirement 11.8: title of the section, and heading of the group, for a code the UI does not know. */
export const OTHER_NOTES_TITLE = 'Other notes';
const OTHER_CODE = 'other';
const PREVIEW_COUNT = 5;

/**
 * Requirement 11.7: the four themed sections in fixed order, with the themed heading of each code
 * (Requirement 10.9, 15.6). Groups follow the code order of this table. One table for the Notes_Model
 * and for the per-package note headings of the Detail_Model.
 */
export const NOTE_SECTIONS: readonly {
  readonly title: string;
  readonly codes: readonly (readonly [code: string, heading: string])[];
}[] = [
  {
    title: "The caretaker's own limits",
    codes: [
      ['github-token-missing', 'The caretaker has no key to the GitHub gate'],
      ['github-budget-low', 'The caretaker is running low on GitHub visits'],
      ['dependency-cap-exceeded', 'The caretaker stopped counting graves'],
      ['scan-deadline-reached', 'The night ran short'],
      ['source-partial', 'A record office answered in part'],
      ['source-failed', 'A record office did not answer'],
      ['batch-fallback', 'The caretaker took the slow road'],
    ],
  },
  {
    title: 'Missing records',
    codes: [
      ['package-not-found', 'No record of this package'],
      ['no-default-version', 'No default version on record'],
      ['pin-not-found', 'The pinned version is not on record'],
      ['conflicting-pins', 'The manifests disagree on the version'],
      ['range-unresolved', 'The version range could not be resolved'],
      ['advisory-details-incomplete', 'The advisory records are incomplete'],
      ['osv-pagination-ignored', 'More advisories may exist'],
      ['maintainers-lower-bound', 'The maintainer count may be low'],
    ],
  },
  {
    title: 'Unverified links and special cases',
    codes: [
      ['source-repo-unverified', 'A source repository, unverified'],
      ['informational-advisory-excluded', 'Informational advisories, not counted'],
      ['unmaintained-advisory', 'Flagged as unmaintained'],
    ],
  },
  {
    title: 'The plot map',
    codes: [
      ['tree-truncated', 'The plot map is cut short'],
      ['no-manifests', 'No manifests on the plot map'],
      ['no-root-manifest', 'No manifest at the root'],
      ['manifest-too-large', 'A manifest is too large to read'],
      ['manifest-fetch-failed', 'A manifest could not be fetched'],
    ],
  },
];

const SOURCES: readonly (readonly [SourceName, string])[] = [
  ['github', 'GitHub'],
  ['depsdev', 'deps.dev'],
  ['osv', 'OSV'],
  ['npm', 'npm registry'],
  ['cratesio', 'crates.io'],
  ['pypi', 'PyPI'],
];
const SYMBOLS: Readonly<Record<SourceStatusWord, string>> = { ok: '✓', partial: '◐', failed: '✕' };

const INCOMPLETE_LIST_TEXT = 'The manifest list may be incomplete';
const EMPTY_TEXT = 'No manifests were found on the plot map';
const CAP_TEXT = 'Some dependencies were not assessed';

function firstMessage(notes: readonly Note[], code: string): string | null {
  return notes.find((n) => n.code === code)?.message ?? null;
}

function buildSections(notes: readonly Note[]): NotesModel['sections'] {
  const known = new Set(NOTE_SECTIONS.flatMap((s) => s.codes.map(([c]) => c)));
  const sections: { title: string; groups: NotesModel['sections'][number]['groups'][number][] }[] = [];
  const group = (code: string, heading: string, messages: string[]) => ({
    code,
    heading,
    count: messages.length,
    messages,
    previewCount: Math.min(PREVIEW_COUNT, messages.length),
  });
  for (const section of NOTE_SECTIONS) {
    const groups = [];
    for (const [code, heading] of section.codes) {
      const messages = notes.filter((n) => n.code === code).map((n) => n.message);
      if (messages.length > 0) groups.push(group(code, heading, messages));
    }
    if (groups.length > 0) sections.push({ title: section.title, groups });
  }
  const others = notes.filter((n) => !known.has(n.code)).map((n) => n.message);
  if (others.length > 0) {
    sections.push({ title: OTHER_NOTES_TITLE, groups: [group(OTHER_CODE, OTHER_NOTES_TITLE, others)] });
  }
  return sections;
}

/** Requirement 11 as a whole. */
export function buildNotesModel(result: ParsedScanResult): NotesModel {
  const { notes, discovery } = result;

  const sources = SOURCES.map(([name, label]) => {
    const status = result.sources[name];
    return {
      name,
      label,
      status,
      symbol: SYMBOLS[status],
      alert:
        status === 'ok' ? null : `${label}: ${status}, some facts that depend on it are unknown`,
    };
  });

  const skippedCount = result.capped.skipped.length;
  const capBanner =
    skippedCount === 0
      ? null
      : { message: firstMessage(notes, 'dependency-cap-exceeded') ?? CAP_TEXT, skippedCount };

  const noManifestsMessage = firstMessage(notes, 'no-manifests');
  const empty =
    noManifestsMessage !== null || result.manifests.length === 0
      ? { message: noManifestsMessage ?? EMPTY_TEXT }
      : null;

  let picker: PickerModel | null = null;
  if (notes.some((n) => n.code === 'no-root-manifest')) {
    const base = buildPickerModel(
      discovery.candidates.map((c) => c.path),
      [],
      canonicalRepoUrl(result.repo),
    );
    picker = {
      ...base,
      candidates: base.candidates.map((c) => {
        const found = discovery.candidates.find((d) => d.path === c.path);
        return found === undefined ? c : { ...c, format: found.format, sizeBytes: found.sizeBytes };
      }),
    };
  }

  const incomplete = discovery.truncatedTree || discovery.depthLimited || discovery.countLimited;
  const discoveryNote = !incomplete
    ? null
    : ((discovery.truncatedTree ? firstMessage(notes, 'tree-truncated') : null) ?? INCOMPLETE_LIST_TEXT);

  return {
    sources,
    sections: buildSections(notes),
    capBanner,
    empty,
    manifestWarnings: result.manifests
      .filter((m) => m.warnings.length > 0)
      .map((m) => ({ path: m.path, warnings: m.warnings })),
    discoveryNote,
    picker,
  };
}
