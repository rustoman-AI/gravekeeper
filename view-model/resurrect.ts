import type { Ecosystem } from '../core';
import { buildCommandBlocks } from './resurrect-commands';
import { isValidName, normalizeName } from './resurrect-names';
import { lookupCurated, type CuratedEntry } from './resurrections';
import type {
  PackageRow,
  ParsedHint,
  ParsedScanResult,
  ResurrectFallback,
  ResurrectHint,
  ResurrectLink,
  ResurrectModel,
  ResurrectSuggestion,
} from './types';
import { advisoryLink, registryLink, sourceRepoLink } from './urls';

// resurrect Requirements 9.1 to 9.11, 10.1, 12.4, 12.5. Pure: no clock, no random, no I/O.
export type CuratedLookup = (ecosystem: Ecosystem, name: string) => CuratedEntry | null;

const DEPRECATION_LABEL = "From the package's deprecation notice";
const ADVISORY_LABEL = 'From an advisory that marks this crate unmaintained';
const ADVISORY_LINK_LABEL = 'Read the advisory';
const REGISTRY_LINK_LABEL = 'Read it on the registry page';
const SUGGESTION_LABEL = "From the caretaker's list";
const SOURCE_LINK_LABEL = 'Source for this suggestion';
const REPO_LINK_LABEL = 'Source repository (listed by the package, not verified)';
const ISSUES_LINK_LABEL = 'Issues (listed by the package, not verified)';
const GENERIC_URGENT = 'This package is haunted by open vulnerabilities, so moving off it is urgent.';
const FORGOTTEN_PARAGRAPH =
  'No notice and no recommended replacement is on record for this package. ' +
  'It may be finished and need no change. ' +
  'Check its repository for recent activity and open issues. ' +
  'Pinning the version or vendoring the code is an option.';

type Note = ParsedScanResult['notes'][number];

function urgentSentence(row: PackageRow): string {
  const n = row.facts.openVulnerabilityCount;
  if (n === null || !Number.isInteger(n) || n < 1) return GENERIC_URGENT;
  return n === 1
    ? 'This package has 1 open vulnerability, so moving off it is urgent.'
    : `This package has ${n} open vulnerabilities, so moving off it is urgent.`;
}

function hintOf(row: PackageRow, hint: ParsedHint): ResurrectHint {
  if (hint.kind === 'advisory-notice') {
    const href = advisoryLink(hint.sourceUrl);
    return {
      label: ADVISORY_LABEL,
      text: hint.text,
      link: href === null ? null : { href, label: ADVISORY_LINK_LABEL },
    };
  }
  const href = registryLink(row.ecosystem, row.name);
  return {
    label: DEPRECATION_LABEL,
    text: hint.text,
    link: href === null ? null : { href, label: REGISTRY_LINK_LABEL },
  };
}

function suggestionOf(row: PackageRow, entry: CuratedEntry): ResurrectSuggestion | null {
  // resurrect Requirements 7.6, 10.10: no name that fails the strict rules reaches the model.
  const eco = row.ecosystem;
  if (!isValidName(eco, row.name) || !isValidName(eco, entry.from)) return null;
  const self = normalizeName(eco, row.name);
  const names = entry.to.filter((to) => isValidName(eco, to) && normalizeName(eco, to) !== self);
  if (names.length === 0) return null;
  return {
    label: SUGGESTION_LABEL,
    why: entry.why,
    source: { href: entry.source, label: SOURCE_LINK_LABEL },
    alternatives: names.map((name) => ({
      name,
      blocks: buildCommandBlocks({
        origins: row.manifestOrigins,
        scopes: row.scopes,
        from: row.name,
        to: name,
      }),
    })),
  };
}

function reasonWords(row: PackageRow): string | null {
  const ids = new Set((row.classification?.reasons ?? []).map((r) => r.ruleId as string));
  const archived = ids.has('8.1');
  const deprecated = ids.has('8.2');
  if (archived && deprecated) return 'archived and deprecated';
  if (archived) return 'archived';
  if (deprecated) return 'deprecated';
  return null;
}

function sourceRepoOf(row: PackageRow, notes: readonly Note[]): string | null {
  for (const note of notes) {
    if (note.code !== 'source-repo-unverified') continue;
    if (note.details?.['ecosystem'] !== row.ecosystem || note.details?.['name'] !== row.name) continue;
    return sourceRepoLink(note.details?.['sourceRepo']);
  }
  return null;
}

function fallbackOf(row: PackageRow, result: ParsedScanResult): ResurrectFallback {
  const words = reasonWords(row);
  const buried = row.kind === 'restless' || words !== null;
  const links: ResurrectLink[] = [];
  const registry = registryLink(row.ecosystem, row.name);
  if (registry !== null) links.push({ href: registry, label: REGISTRY_LINK_LABEL });
  const repo = sourceRepoOf(row, result.notes);
  if (repo !== null) {
    links.push({ href: repo, label: REPO_LINK_LABEL });
    links.push({ href: `${repo}/issues`, label: ISSUES_LINK_LABEL });
  }
  if (!buried) return { kind: 'forgotten', paragraph: FORGOTTEN_PARAGRAPH, links };
  const marked = words === null ? 'archived, deprecated or both' : words;
  return {
    kind: 'buried',
    paragraph:
      `This package is marked ${marked}. ` +
      'No notice text and no recommended replacement is on record. ' +
      'Read the package page and the repository, and look for a maintained alternative.',
    links,
  };
}

/** Requirement 9: null unless the row is DEAD or a restless ghost. */
export function buildResurrectModel(
  row: PackageRow,
  result: ParsedScanResult,
  curated: CuratedLookup = lookupCurated,
): ResurrectModel | null {
  const dead = row.classification !== null && row.classification.status === 'DEAD';
  const restless = row.kind === 'restless';
  if (!dead && !restless) return null;

  const hints = row.hints.map((h) => hintOf(row, h));
  const entry = curated(row.ecosystem, row.name);
  const suggestion = entry === null ? null : suggestionOf(row, entry);
  const suggestions = suggestion === null ? [] : [suggestion];

  return {
    heading: 'Resurrect',
    urgent: restless ? urgentSentence(row) : null,
    hints,
    suggestions,
    fallback: hints.length === 0 && suggestions.length === 0 ? fallbackOf(row, result) : null,
  };
}
