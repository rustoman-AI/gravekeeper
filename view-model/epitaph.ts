import { humanizeDays } from './duration';
import { unassessedLabelOf } from './package-rows';
import type { PackageRow } from './types';

export interface EpitaphModel {
  readonly lines: readonly string[];
  readonly text: string;
}

// graveyard-art Requirement 7.3: only a finite number of at least 0 counts as a known fact.
function finiteNonNegative(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

function hasRule(row: PackageRow, ruleId: string): boolean {
  return row.classification?.reasons.some((r) => r.ruleId === ruleId) ?? false;
}

// graveyard-art Requirement 7.6: the ghost sentence; the count and severity come only from the facts.
function ghostSentence(row: PackageRow): string {
  const count = finiteNonNegative(row.facts.openVulnerabilityCount);
  const severity = row.facts.maxSeverity;
  const severityText = typeof severity === 'string' ? ` of severity ${severity}` : '';
  if (count === null) return `It is haunted by open vulnerabilities${severityText}.`;
  const noun = count === 1 ? 'open vulnerability' : 'open vulnerabilities';
  return `It is haunted by ${count} ${noun}${severityText}.`;
}

function buriedParts(row: PackageRow): string {
  const archived = hasRule(row, '8.1');
  const deprecated = hasRule(row, '8.2');
  if (archived && deprecated) return 'archived and deprecated';
  return archived ? 'archived' : 'deprecated';
}

// graveyard-art Requirement 7.6: verdict sentences by plot kind.
function verdict(row: PackageRow): readonly string[] {
  const archived = hasRule(row, '8.1');
  const deprecated = hasRule(row, '8.2');
  switch (row.kind) {
    case 'overgrown':
      return ['It may be finished, or abandoned.'];
    case 'tombstone': {
      const out: string[] = [];
      if (archived) out.push('It was archived.');
      if (deprecated) out.push('It was deprecated.');
      if (out.length === 0) out.push('An advisory flags it as unmaintained.');
      return out;
    }
    case 'ghost':
      return [ghostSentence(row)];
    case 'restless':
      return archived || deprecated
        ? [ghostSentence(row), `It is also ${buriedParts(row)}.`]
        : [ghostSentence(row)];
    case 'lantern':
      return ['The records show no risk signals.'];
    case 'unmarked':
      return row.unassessedCause === null
        ? ['The caretaker could not assess it.']
        : [`The caretaker could not assess it: ${unassessedLabelOf(row.unassessedCause)}.`];
  }
}

// graveyard-art Requirements 7.2 to 7.6: name, release, commit, verdict; unknown facts are omitted or said as unknown.
export function buildEpitaph(row: PackageRow): EpitaphModel {
  const lines: string[] = [`Here lies ${row.displayName}.`];
  const release = finiteNonNegative(row.facts.daysSinceLastRelease);
  const commit = finiteNonNegative(row.facts.daysSinceLastCommit);
  if (release !== null) lines.push(`Last release ${humanizeDays(release)} ago.`);
  if (commit !== null) lines.push(`Last commit ${humanizeDays(commit)} ago.`);
  if (release === null && commit === null) {
    lines.push('The records do not say when it was last released or changed.');
  }
  lines.push(...verdict(row));
  return { lines, text: lines.join(' ') };
}
