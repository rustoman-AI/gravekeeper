// Feature: graveyard-art, Property GA-P9: The epitaph invents no fact
// Validates: Requirements 7.3, 7.4, 7.5, 7.6, 7.8
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { humanizeDays } from '../../../view-model/duration';
import { buildEpitaph } from '../../../view-model/epitaph';
import { buildPackageRows, unassessedLabelOf } from '../../../view-model/package-rows';
import type { PackageRow, ParsedScanResult, PlotKind, UnassessedCause } from '../../../view-model/types';
import { cfg } from '../../support/fc-config';
import { buildScanResult } from '../../support/ui/scan-result-builder';

const KINDS: readonly PlotKind[] = ['tombstone', 'overgrown', 'ghost', 'restless', 'lantern', 'unmarked'];
const CAUSES: readonly UnassessedCause[] = ['git', 'path', 'cap-skipped', 'no-health-data'];

const BASE: PackageRow = buildPackageRows(
  buildScanResult([{ name: 'base', kind: 'alive' }]) as unknown as ParsedScanResult,
)[0]!;

/** Own definition of a known day or count fact (Requirement 7.3). */
function known(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

const arbNumFact = fc.oneof(
  { weight: 3, arbitrary: fc.constant(null) },
  { weight: 1, arbitrary: fc.constantFrom(-1, -0.5, Number.NaN, Infinity, -Infinity, 0, 0.5, 1, 59.9, 60, 730) },
  { weight: 3, arbitrary: fc.integer({ min: 0, max: 100000 }) },
  { weight: 1, arbitrary: fc.double({ min: 0, max: 1e6, noNaN: true }) },
  { weight: 1, arbitrary: fc.double({ noNaN: false }) },
  { weight: 1, arbitrary: fc.integer({ min: -1000, max: -1 }) },
);

const arbRow = fc
  .record({
    name: fc.oneof(
      fc.string({ minLength: 1 }),
      fc.constantFrom('archived', 'deprecated-abandoned 99', 'pkg.', '@scope/x'),
    ),
    kind: fc.constantFrom(...KINDS),
    release: arbNumFact,
    commit: arbNumFact,
    count: arbNumFact,
    severity: fc.constantFrom(null, 'LOW', 'MODERATE', 'HIGH', 'CRITICAL'),
    archived: fc.boolean(),
    deprecated: fc.boolean(),
    cause: fc.constantFrom<UnassessedCause | null>(null, ...CAUSES),
    nullClassification: fc.boolean(),
  })
  .map((s) => {
    const ruleIds = [...(s.archived ? ['8.1'] : []), ...(s.deprecated ? ['8.2'] : []), '10.6'];
    const classification =
      s.kind === 'unmarked' && s.nullClassification
        ? null
        : { ...BASE.classification!, reasons: ruleIds.map((ruleId) => ({ ruleId, message: 'm', facts: [] })) };
    const row = {
      ...BASE,
      displayName: s.name,
      kind: s.kind,
      classification,
      unassessedCause: s.kind === 'unmarked' ? s.cause : null,
      facts: {
        ...BASE.facts,
        daysSinceLastRelease: s.release,
        daysSinceLastCommit: s.commit,
        openVulnerabilityCount: s.count,
        maxSeverity: s.severity,
      },
    } as unknown as PackageRow;
    return { row, s };
  });

/** Sentences that may follow the release and commit sentences, per kind and known facts. */
function ghostSentence(row: PackageRow): string {
  const c = row.facts.openVulnerabilityCount as unknown;
  const sev = row.facts.maxSeverity as unknown;
  const sevText = typeof sev === 'string' ? ` of severity ${sev}` : '';
  if (!known(c)) return `It is haunted by open vulnerabilities${sevText}.`;
  return `It is haunted by ${c} open vulnerabilit${c === 1 ? 'y' : 'ies'}${sevText}.`;
}

function allowedVerdicts(row: PackageRow, archived: boolean, deprecated: boolean): string[] {
  switch (row.kind) {
    case 'overgrown':
      return ['It may be finished, or abandoned.'];
    case 'tombstone': {
      const out: string[] = [];
      if (archived) out.push('It was archived.');
      if (deprecated) out.push('It was deprecated.');
      if (!archived && !deprecated) out.push('An advisory flags it as unmaintained.');
      return out;
    }
    case 'ghost':
      return [ghostSentence(row)];
    case 'restless': {
      const out = [ghostSentence(row)];
      if (archived && deprecated) out.push('It is also archived and deprecated.');
      else if (archived) out.push('It is also archived.');
      else if (deprecated) out.push('It is also deprecated.');
      return out;
    }
    case 'lantern':
      return ['The records show no risk signals.'];
    case 'unmarked':
      return [
        row.unassessedCause === null
          ? 'The caretaker could not assess it.'
          : `The caretaker could not assess it: ${unassessedLabelOf(row.unassessedCause)}.`,
      ];
  }
}

function digitRuns(text: string): string[] {
  return text.match(/\d+/g) ?? [];
}

describe('GA-P9 The epitaph invents no fact', () => {
  it('GA-P9 release, commit and the unknown sentence appear if and only if their facts say so', () => {
    fc.assert(
      fc.property(arbRow, ({ row }) => {
        const body = buildEpitaph(row).lines.slice(1);
        const release = row.facts.daysSinceLastRelease as unknown;
        const commit = row.facts.daysSinceLastCommit as unknown;
        const releaseLines = body.filter((l) => l.startsWith('Last release'));
        const commitLines = body.filter((l) => l.startsWith('Last commit'));
        const unknownLines = body.filter((l) => l.startsWith('The records do not say'));
        expect(releaseLines).toEqual(known(release) ? [`Last release ${humanizeDays(release)} ago.`] : []);
        expect(commitLines).toEqual(known(commit) ? [`Last commit ${humanizeDays(commit)} ago.`] : []);
        expect(unknownLines.length).toBe(!known(release) && !known(commit) ? 1 : 0);
      }),
      cfg(),
    );
  });

  it('GA-P9 the text is the name sentence, the fact sentences and only allowed verdict sentences', () => {
    fc.assert(
      fc.property(arbRow, ({ row, s }) => {
        const e = buildEpitaph(row);
        expect(e.lines[0]).toBe(`Here lies ${row.displayName}.`);
        expect(e.text).toBe(e.lines.join(' '));
        const release = row.facts.daysSinceLastRelease as unknown;
        const commit = row.facts.daysSinceLastCommit as unknown;
        const expectedFacts: string[] = [];
        if (known(release)) expectedFacts.push(`Last release ${humanizeDays(release)} ago.`);
        if (known(commit)) expectedFacts.push(`Last commit ${humanizeDays(commit)} ago.`);
        if (expectedFacts.length === 0) {
          expectedFacts.push('The records do not say when it was last released or changed.');
        }
        const rest = e.lines.slice(1 + expectedFacts.length);
        expect(e.lines.slice(1, 1 + expectedFacts.length)).toEqual(expectedFacts);
        const allowed = allowedVerdicts(row, s.archived, s.deprecated);
        expect(rest.length).toBeGreaterThan(0);
        for (const sentence of rest) expect(allowed).toContain(sentence);
        // Every verdict sentence that the facts call for is present, not just permitted.
        expect(rest).toEqual(allowed);
      }),
      cfg(),
    );
  });

  it('GA-P9 archived, deprecated and abandoned appear only with their rule or kind', () => {
    fc.assert(
      fc.property(arbRow, ({ row, s }) => {
        // Words are checked outside the name sentence, which may contain any text, and outside the
        // unassessed label, which is core wording.
        const body = buildEpitaph(row).lines.slice(1);
        const checked = row.kind === 'unmarked' ? [] : body;
        const text = checked.join(' ');
        if (!s.archived) expect(text).not.toContain('archived');
        if (!s.deprecated) expect(text).not.toContain('deprecated');
        if (row.kind !== 'overgrown') expect(text).not.toContain('abandoned');
      }),
      cfg(),
    );
  });

  it('GA-P9 every number is a humanised count of a day fact or the vulnerability count', () => {
    fc.assert(
      fc.property(arbRow, ({ row }) => {
        const e = buildEpitaph(row);
        const allowed = new Set<string>();
        const release = row.facts.daysSinceLastRelease as unknown;
        const commit = row.facts.daysSinceLastCommit as unknown;
        const count = row.facts.openVulnerabilityCount as unknown;
        if (known(release)) for (const d of digitRuns(humanizeDays(release))) allowed.add(d);
        if (known(commit)) for (const d of digitRuns(humanizeDays(commit))) allowed.add(d);
        if (known(count)) for (const d of digitRuns(String(count))) allowed.add(d);
        for (const d of digitRuns(e.lines.slice(1).join(' '))) {
          // The unassessed label is core wording; digits of it are not facts.
          if (row.kind === 'unmarked') continue;
          expect(allowed.has(d)).toBe(true);
        }
      }),
      cfg(),
    );
  });
});
