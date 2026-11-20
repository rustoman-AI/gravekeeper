import { describe, expect, it } from 'vitest';
import { buildEpitaph } from '../../../view-model/epitaph';
import { buildPackageRows } from '../../../view-model/package-rows';
import type { PackageRow, ParsedScanResult } from '../../../view-model/types';
import { buildScanResult } from '../../support/ui/scan-result-builder';
import type { PlotCase } from '../../support/ui/scan-result-builder';

type Facts = PackageRow['facts'];

function rowOf(name: string, kind: PlotCase, facts: Partial<Facts> = {}): PackageRow {
  const rows = buildPackageRows(buildScanResult([{ name, kind }]) as unknown as ParsedScanResult);
  const row = rows[0]!;
  return { ...row, facts: { ...row.facts, ...facts } };
}

describe('buildEpitaph (R7.2 to R7.6)', () => {
  it('writes the aws-sign2 epitaph for a forgotten grave', () => {
    const row = rowOf('aws-sign2', 'forgotten', { daysSinceLastRelease: 3285, daysSinceLastCommit: 3285 });
    expect(row.kind).toBe('overgrown');
    const e = buildEpitaph(row);
    expect(e.text).toBe(
      'Here lies aws-sign2. Last release 9 years ago. Last commit 9 years ago. It may be finished, or abandoned.',
    );
    expect(e.text).toBe(e.lines.join(' '));
  });

  it('says archived for rule 8.1 and deprecated for rule 8.2', () => {
    const archived = buildEpitaph(rowOf('old', 'buried', { daysSinceLastRelease: 40, daysSinceLastCommit: 210 }));
    expect(archived.text).toBe('Here lies old. Last release 40 days ago. Last commit 7 months ago. It was archived.');
    const deprecated = buildEpitaph(rowOf('old', 'buried-deprecated'));
    expect(deprecated.lines.at(-1)).toBe('It was deprecated.');
    expect(deprecated.text).not.toContain('archived');
  });

  it('says an advisory flags it when a tombstone has neither 8.1 nor 8.2', () => {
    const row = rowOf('adv', 'buried');
    const bare: PackageRow = { ...row, classification: { ...row.classification!, reasons: [] } };
    expect(buildEpitaph(bare).lines.at(-1)).toBe('An advisory flags it as unmaintained.');
  });

  it('names the count and the severity of a ghost', () => {
    const e = buildEpitaph(
      rowOf('uuid-ish', 'haunted', { openVulnerabilityCount: 2, maxSeverity: 'HIGH' }),
    );
    expect(e.lines.at(-1)).toBe('It is haunted by 2 open vulnerabilities of severity HIGH.');
  });

  it('omits the severity when unknown and uses the singular for one', () => {
    const e = buildEpitaph(rowOf('g', 'ghost', { openVulnerabilityCount: 1, maxSeverity: null }));
    expect(e.lines.at(-1)).toBe('It is haunted by 1 open vulnerability.');
  });

  it('does not invent a count when it is unknown', () => {
    const e = buildEpitaph(rowOf('g', 'ghost', { openVulnerabilityCount: null, maxSeverity: null }));
    expect(e.lines.at(-1)).toBe('It is haunted by open vulnerabilities.');
  });

  it('adds the buried sentence for a restless ghost', () => {
    const row = rowOf('uuid', 'restless-both', {
      daysSinceLastRelease: 40,
      daysSinceLastCommit: 17,
      openVulnerabilityCount: 1,
      maxSeverity: 'HIGH',
    });
    expect(row.kind).toBe('restless');
    expect(buildEpitaph(row).text).toBe(
      'Here lies uuid. Last release 40 days ago. Last commit 17 days ago. It is haunted by 1 open vulnerability of severity HIGH. It is also archived and deprecated.',
    );
    expect(buildEpitaph(rowOf('r', 'restless-deprecated')).lines.at(-1)).toBe('It is also deprecated.');
    expect(buildEpitaph(rowOf('r', 'restless-archived')).lines.at(-1)).toBe('It is also archived.');
  });

  it('says a lantern shows no risk signals', () => {
    expect(buildEpitaph(rowOf('lamp', 'alive')).lines.at(-1)).toBe('The records show no risk signals.');
  });

  it('uses the unassessed label for an unmarked grave', () => {
    const e = buildEpitaph(rowOf('mystery', 'unassessed-git'));
    expect(e.text).toBe(
      'Here lies mystery. The records do not say when it was last released or changed. The caretaker could not assess it: git dependency, not checked.',
    );
  });

  it('says the dates are unknown when both facts are unknown and omits one unknown fact', () => {
    const both = buildEpitaph(rowOf('x', 'unknown-facts'));
    expect(both.text).toContain('The records do not say when it was last released or changed.');
    expect(both.text).not.toContain('Last release');
    const one = buildEpitaph(rowOf('x', 'alive', { daysSinceLastRelease: null, daysSinceLastCommit: 5 }));
    expect(one.text).not.toContain('Last release');
    expect(one.text).toContain('Last commit 5 days ago.');
    expect(one.text).not.toContain('do not say');
  });

  it('treats negative and non-finite facts as unknown', () => {
    const e = buildEpitaph(rowOf('x', 'alive', { daysSinceLastRelease: -1, daysSinceLastCommit: Number.NaN }));
    expect(e.text).toContain('The records do not say');
  });
});
