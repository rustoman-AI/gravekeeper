import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { summarize } from '../../../core';
import type { ScanResult } from '../../../pipeline/scan/types';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';
import {
  ALL_SOURCES,
  advisoryExclusionsResult,
  allNotesResult,
  buriedResult,
  cappedSkippedResult,
  everyPlotKindResult,
  failedSourceResult,
  forgottenResult,
  hauntedWithoutSeverityResult,
  noManifestsResult,
  noRootManifestResult,
  partialSourceResult,
  rangeUnresolvedResult,
  restlessGhostResult,
  result300,
  result301,
  unassessedOfEachCauseResult,
  versionBasisResult,
} from '../../support/ui/scan-result-builder';

const builders: ReadonlyArray<readonly [string, () => ScanResult]> = [
  ['everyPlotKind', everyPlotKindResult],
  ['unassessedOfEachCause', unassessedOfEachCauseResult],
  ['cappedSkipped', cappedSkippedResult],
  ['partialSource', partialSourceResult],
  ['failedSource', failedSourceResult],
  ['noManifests', noManifestsResult],
  ['noRootManifest', noRootManifestResult],
  ['rangeUnresolved', rangeUnresolvedResult],
  ['hauntedWithoutSeverity', hauntedWithoutSeverityResult],
  ['restlessGhost', restlessGhostResult],
  ['buried', buriedResult],
  ['forgotten', forgottenResult],
  ['advisoryExclusions', advisoryExclusionsResult],
  ['versionBasis', versionBasisResult],
  ['allNotes', allNotesResult],
  ['result300', result300],
  ['result301', result301],
];

const uniqueKeys = (r: ScanResult): number =>
  new Set(r.assessed.map((a) => JSON.stringify([a.dependency.ecosystem, a.dependency.name, a.dependency.sourceKind]))).size;

const structural = (r: ScanResult): void => {
  expect(r.dependencies.length).toBe(r.assessed.length);
  expect(Object.keys(r.sources).sort()).toEqual([...ALL_SOURCES].sort());
  expect(r.summary.total).toBe(uniqueKeys(r));
};

const ruleIds = (r: ScanResult): string[][] =>
  r.assessed.map((a) => (a.classification?.reasons ?? []).map((x) => x.ruleId));

describe('scan result builders', () => {
  it.each(builders)('%s passes the structural checks', (_name, build) => {
    structural(build());
  });

  it('result300 and result301 have 300 and 301 packages', () => {
    expect(result300().summary.total).toBe(300);
    expect(result301().summary.total).toBe(301);
  });

  it('restless ghosts carry a ghost ruleId alongside a dead reason', () => {
    const ids = ruleIds(restlessGhostResult());
    expect(ids).toHaveLength(3);
    for (const list of ids) expect(list.some((id) => id.startsWith('8.'))).toBe(true);
    expect(ids[0]).toContain('8.1');
    expect(ids[1]).toContain('8.2');
    expect(ids[2]).toEqual(expect.arrayContaining(['8.1', '8.2']));
  });

  it('buried and forgotten builders have their intended ruleIds', () => {
    const buried = buriedResult().assessed[0].classification;
    const forgotten = forgottenResult().assessed[0].classification;
    expect(buried?.reasons.length).toBeGreaterThan(0);
    expect(forgotten?.reasons.length).toBeGreaterThan(0);
    expect(ruleIds(buriedResult())[0]).toEqual(['8.1']);
    expect(ruleIds(forgottenResult())[0]).toContain('8.3');
    expect(ruleIds(buriedResult())[0]).not.toEqual(ruleIds(forgottenResult())[0]);
  });
});

describe('arbScanResult', () => {
  it('builds structurally valid results whose summary equals summarize(assessed)', () => {
    fc.assert(
      fc.property(arbScanResult(), (r) => {
        structural(r);
        expect(r.summary).toEqual(summarize(r.assessed));
      }),
      { numRuns: 25 },
    );
  });
});
