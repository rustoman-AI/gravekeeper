import { describe, expect, it } from 'vitest';
import { buildDetailModel } from '../../../view-model/detail';
import { buildPackageRows } from '../../../view-model/package-rows';
import { parseScanResponse } from '../../../view-model/parse-response';
import type { DetailModel, ParsedScanResult } from '../../../view-model/types';
import {
  buildScanResult,
  legacyAdvisory,
  makeAdvisory,
  noteOf,
  type ResultOptions,
  type RowSpec,
} from '../../support/ui/scan-result-builder';

// Expected texts come from requirements.md Requirement 10 (criteria 5, 6, 13, 16 to 19).

/** Runs the spec through the real response parser so advisories carry their parsed `exclusion`. */
function parse(specs: readonly RowSpec[], options?: ResultOptions): ParsedScanResult {
  const body = JSON.parse(JSON.stringify(buildScanResult(specs, options))) as unknown;
  const outcome = parseScanResponse(200, { get: () => null }, body);
  if (outcome.kind !== 'result') throw new Error('fixture did not parse');
  return outcome.result;
}

function detailOf(specs: readonly RowSpec[], options?: ResultOptions, index = 0): DetailModel {
  const result = parse(specs, options);
  const rows = buildPackageRows(result);
  const detail = buildDetailModel(result, rows, rows[index]!.key);
  if (detail === null) throw new Error('no detail');
  return detail;
}

const one = (spec: RowSpec, options?: ResultOptions): DetailModel => detailOf([spec], options);

describe('buildDetailModel', () => {
  it('returns null for a key that names no row', () => {
    const result = parse([{ name: 'a', kind: 'alive' }]);
    expect(buildDetailModel(result, buildPackageRows(result), 'npm:missing' as never)).toBeNull();
  });
});

describe('version line (R10.6)', () => {
  it.each([
    ['pinned', '1.0.0 (pinned)'],
    ['resolved', '1.0.0 (resolved from range)'],
    ['default', '1.0.0 (latest)'],
    [null, 'not looked up'],
  ] as const)('shows the %s basis as "%s"', (versionBasis, expected) => {
    expect(one({ name: 'a', kind: 'alive', versionBasis }).versionLine).toBe(expected);
  });

  it('shows the manifest version next to it', () => {
    expect(one({ name: 'a', kind: 'alive' }).versionSpecText).toBe('^1.0.0');
  });
});

describe('maxSeverity text (R10.5)', () => {
  it('is "none (no open vulnerabilities)" for null severity and 0 vulnerabilities', () => {
    const d = one({ name: 'a', kind: 'alive' });
    expect(d.facts.find((f) => f.field === 'maxSeverity')!.text).toBe('none (no open vulnerabilities)');
  });

  it('is "unknown, MEDIUM assumed" for null severity and more than 0 vulnerabilities', () => {
    const d = one({ name: 'a', kind: 'haunted-no-severity' });
    expect(d.facts.find((f) => f.field === 'openVulnerabilityCount')!.text).toBe('2');
    expect(d.facts.find((f) => f.field === 'maxSeverity')!.text).toBe('unknown, MEDIUM assumed');
  });

  it('is "unknown" when the vulnerability count is unknown', () => {
    const d = one({ name: 'a', kind: 'unknown-facts' });
    expect(d.facts.find((f) => f.field === 'openVulnerabilityCount')!.text).toBe('unknown');
    expect(d.facts.find((f) => f.field === 'maxSeverity')!.text).toBe('unknown');
  });

  it('is the severity word when there is one', () => {
    const d = one({ name: 'a', kind: 'haunted', severity: 'CRITICAL' });
    expect(d.facts.find((f) => f.field === 'maxSeverity')!.text).toBe('CRITICAL');
  });

  it('lists the seven facts once each', () => {
    const d = one({ name: 'a', kind: 'alive' });
    expect(d.facts.map((f) => f.field)).toEqual([
      'daysSinceLastRelease',
      'daysSinceLastCommit',
      'archived',
      'deprecated',
      'openVulnerabilityCount',
      'maxSeverity',
      'maintainerCount',
    ]);
    expect(d.facts.map((f) => f.label)).toEqual([
      'Days since last release',
      'Days since last commit',
      'Archived',
      'Deprecated',
      'Open vulnerabilities',
      'Highest severity',
      'Maintainers',
    ]);
    expect(d.facts[0]!.text).toBe('10 days');
  });
});

describe('Resurrect_Slot (R10.13)', () => {
  it.each(['restless-archived', 'restless-deprecated', 'restless-both'] as const)(
    'gives a model for the restless ghost %s',
    (kind) => {
      expect(one({ name: 'a', kind }).resurrect).not.toBeNull();
    },
  );

  it.each(['buried', 'forgotten', 'buried-deprecated'] as const)(
    'gives a model for the DEAD package %s',
    (kind) => {
      expect(one({ name: 'a', kind }).resurrect?.heading).toBe('Resurrect');
    },
  );

  it('gives the fallback kind that matches a buried and a forgotten row', () => {
    expect(one({ name: 'a', kind: 'buried' }).resurrect?.fallback?.kind).toBe('buried');
    expect(one({ name: 'a', kind: 'forgotten' }).resurrect?.fallback?.kind).toBe('forgotten');
  });

  it('gives null for an alive package and an unassessed package', () => {
    expect(one({ name: 'a', kind: 'alive' }).resurrect).toBeNull();
    expect(one({ name: 'a', kind: 'unassessed-git' }).resurrect).toBeNull();
  });

  it('gives null for a ghost that is not restless', () => {
    expect(one({ name: 'a', kind: 'ghost' as never }).resurrect).toBeNull();
  });
});

describe('advisory groups in the detail (R10.16 to R10.19)', () => {
  it('builds three labelled groups from one counted, one informational and one withdrawn entry', () => {
    const d = one({
      name: 'a',
      kind: 'haunted',
      advisories: [
        makeAdvisory('C-1', null),
        makeAdvisory('I-1', 'informational', { severity: null }),
        makeAdvisory('W-1', 'withdrawn'),
      ],
    });
    expect(d.advisoryGroups.map((g) => g.heading)).toEqual([
      'Counted as open',
      'Informational, not counted',
      'Withdrawn, not counted',
    ]);
    expect(d.advisoryGroups[0]!.countText).toBe('1 listed, 2 counted');
    expect(d.advisoryGroups[0]!.explanation).toBe('Advisories that are aliases of each other count once');
    expect(d.advisoryGroups[1]!.explanation).toBe('not part of the 2 open vulnerabilities');
    expect(d.advisoryEmptyText).toBeNull();
  });

  it('puts the note-named id under "Informational, not counted" when excluded is absent', () => {
    const note = noteOf('informational-advisory-excluded', { ecosystem: 'npm', name: 'a' });
    (note as { details: Record<string, unknown> }).details['ids'] = ['NOTE-1'];
    const d = one(
      { name: 'a', kind: 'haunted', advisories: [legacyAdvisory('NOTE-1'), legacyAdvisory('OTHER-1')] },
      { notes: [note] },
    );
    const byHeading = new Map(d.advisoryGroups.map((g) => [g.heading, g]));
    expect(byHeading.get('Informational, not counted')!.entries.map((e) => e.id)).toEqual(['NOTE-1']);
    const unclassified = byHeading.get('Not classified')!;
    expect(unclassified.entries.map((e) => e.id)).toEqual(['OTHER-1']);
    expect(unclassified.explanation).toBe(
      'This scan result does not say which of these advisories are withdrawn',
    );
  });

  it('shows the no-list sentence when the list is empty and vulnerabilities are counted', () => {
    const d = one({ name: 'a', kind: 'haunted', advisories: [] });
    expect(d.advisoryEmptyText).toBe('No advisory list is available for this version');
    expect(d.advisoryGroups.flatMap((g) => g.entries)).toEqual([]);
  });

  it('shows no no-list sentence when no vulnerability is counted', () => {
    const d = one({ name: 'a', kind: 'alive' });
    expect(d.advisoryEmptyText).toBeNull();
    expect(d.advisoryGroups).toEqual([]);
  });

  it('gives href null for hostile urls and keeps the id as text', () => {
    const d = one({
      name: 'a',
      kind: 'haunted',
      advisories: [
        makeAdvisory('<b>x</b>', null, { url: 'javascript:alert(1)' }),
        makeAdvisory('GHSA-ok', null),
        makeAdvisory('evil', null, { url: 'https://evil.example/vulnerability/evil' }),
      ],
    });
    const entries = d.advisoryGroups[0]!.entries;
    expect(entries.map((e) => e.id)).toEqual(['<b>x</b>', 'GHSA-ok', 'evil']);
    expect(entries.map((e) => e.href)).toEqual([null, 'https://osv.dev/vulnerability/GHSA-ok', null]);
  });
});
