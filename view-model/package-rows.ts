import { uniquePackages } from '../core';
import { glowOf } from './glow';
import { graveTypeOf, plotKindOf, statusWordOf } from './grave-type';
import { compareCodePoints } from './internal/compare-code-points';
import { epitaphOf, shortForm, strongestReason } from './reasons';
import type {
  PackageRow,
  ParsedDependency,
  ParsedScanResult,
  PlotKind,
  UnassessedCause,
} from './types';

const UNASSESSED_LABELS: Readonly<Record<UnassessedCause, string>> = {
  git: 'git dependency, not checked',
  path: 'path dependency, not checked',
  'cap-skipped': 'skipped, scan limit reached',
  'no-health-data': 'no health data found',
};

/** Requirement 7.3: the label of an unassessed cause. */
export function unassessedLabelOf(cause: UnassessedCause): string {
  return UNASSESSED_LABELS[cause];
}

// Requirement 7.9: ghosts and restless ghosts share rank 0.
const KIND_RANK: Readonly<Record<PlotKind, number>> = {
  ghost: 0,
  restless: 0,
  tombstone: 1,
  overgrown: 1,
  lantern: 2,
  unmarked: 3,
};

function keyOf(ecosystem: string, name: string, sourceKind: string): string {
  return JSON.stringify([ecosystem, name, sourceKind]);
}

function distinct<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/** Design "Merged classification and rows", steps 1 to 8. */
export function buildPackageRows(result: ParsedScanResult): readonly PackageRow[] {
  const groups = uniquePackages(result.assessed);
  const byKey = new Map<string, ParsedDependency[]>();
  for (const d of result.dependencies) {
    const k = keyOf(d.dependency.ecosystem, d.dependency.name, d.dependency.sourceKind);
    const list = byKey.get(k);
    if (list === undefined) byKey.set(k, [d]);
    else list.push(d);
  }
  const skipped = new Set(result.capped.skipped.map((s) => JSON.stringify([s.ecosystem, s.name])));

  const rows = groups.map((g): PackageRow => {
    const key = keyOf(g.ecosystem, g.name, g.sourceKind);
    const entries = byKey.get(key) ?? [];
    const first = entries[0];
    const classification = g.classification;
    const kind = plotKindOf(classification);
    const graveType = kind === 'tombstone' || kind === 'overgrown' ? graveTypeOf(classification) : null;
    const strongest = strongestReason(classification);
    const displayName =
      g.ecosystem === 'pypi' && first !== undefined ? first.dependency.rawName : g.name;

    let unassessedCause: UnassessedCause | null = null;
    if (classification === null) {
      if (g.sourceKind === 'git') unassessedCause = 'git';
      else if (g.sourceKind === 'path') unassessedCause = 'path';
      else if (skipped.has(JSON.stringify([g.ecosystem, g.name]))) unassessedCause = 'cap-skipped';
      else unassessedCause = 'no-health-data';
    }

    const advisories = first?.advisories ?? [];
    const glow =
      kind === 'ghost' || kind === 'restless'
        ? glowOf(
            entries.flatMap((e) => e.advisories.map((a) => a.severity)),
            entries.map((e) => e.facts.maxSeverity),
          )
        : null;

    let epitaphShort: string;
    let epitaph: string;
    if (unassessedCause !== null) {
      epitaphShort = UNASSESSED_LABELS[unassessedCause];
      epitaph = `${displayName}, ${epitaphShort}`;
    } else {
      epitaphShort = strongest === null ? '' : shortForm(strongest);
      epitaph = epitaphOf(displayName, classification);
    }
    const statusWord = statusWordOf(kind);

    return {
      key,
      name: g.name,
      displayName,
      ecosystem: g.ecosystem,
      sourceKind: g.sourceKind,
      scopes: g.scopes,
      manifestPaths: distinct(entries.map((e) => e.manifestPath)).sort(compareCodePoints),
      versionSpecs: distinct(entries.map((e) => e.dependency.versionSpec)),
      kind,
      graveType,
      statusWord,
      score: classification === null ? null : classification.score,
      classification,
      strongestReason: strongest,
      epitaphShort,
      epitaph,
      unassessedCause,
      glow,
      facts: first?.facts ?? {
        daysSinceLastRelease: null,
        daysSinceLastCommit: null,
        archived: null,
        deprecated: null,
        openVulnerabilityCount: null,
        maxSeverity: null,
        maintainerCount: null,
      },
      lookupVersion: first?.lookupVersion ?? null,
      versionBasis: first?.versionBasis ?? null,
      advisories,
      accessibleLabel: `${displayName}, ${g.ecosystem}, ${statusWord}, ${epitaphShort}`,
    };
  });

  return rows.sort((a, b) => {
    const rank = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (rank !== 0) return rank;
    if (a.score !== b.score) {
      if (a.score === null) return 1;
      if (b.score === null) return -1;
      return b.score - a.score;
    }
    return compareCodePoints(a.ecosystem, b.ecosystem) || compareCodePoints(a.name, b.name);
  });
}
