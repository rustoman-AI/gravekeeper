import { describe, expect, it } from 'vitest';
import { buildHeaderModel, formatAge, headlineText } from '../../../view-model/header';
import { buildPackageRows } from '../../../view-model/package-rows';
import type { ParsedScanResult } from '../../../view-model/types';
import { buildScanResult } from '../../support/ui/scan-result-builder';
import type { PlotCase, ResultOptions, RowSpec } from '../../support/ui/scan-result-builder';

const specsOf = (counts: Partial<Record<PlotCase, number>>): RowSpec[] =>
  Object.entries(counts).flatMap(([kind, n]) =>
    Array.from({ length: n }, (_, i) => ({ name: `${kind}-${i}`, kind: kind as PlotCase })),
  );

const headerOf = (specs: readonly RowSpec[], options?: ResultOptions) => {
  const result = buildScanResult(specs, options) as unknown as ParsedScanResult;
  return buildHeaderModel(result, buildPackageRows(result));
};

describe('headlineText (R5.2)', () => {
  it('matches the four examples of the requirement', () => {
    expect(headlineText(31, 40, 26, 0, 5)).toBe('31 of 40 dependencies are in the graveyard: 26 buried, 5 haunted.');
    expect(headlineText(1, 6, 0, 0, 1)).toBe('1 of 6 dependencies are in the graveyard: 1 haunted.');
    expect(headlineText(9, 20, 2, 3, 4)).toBe('9 of 20 dependencies are in the graveyard: 2 buried, 3 forgotten, 4 haunted.');
    expect(headlineText(0, 6, 0, 0, 0)).toBe('0 of 6 dependencies are in the graveyard.');
  });

  it('writes each single part alone', () => {
    expect(headlineText(2, 5, 2, 0, 0)).toBe('2 of 5 dependencies are in the graveyard: 2 buried.');
    expect(headlineText(3, 5, 0, 3, 0)).toBe('3 of 5 dependencies are in the graveyard: 3 forgotten.');
    expect(headlineText(4, 5, 0, 0, 4)).toBe('4 of 5 dependencies are in the graveyard: 4 haunted.');
  });

  it('writes each two-part combination in order', () => {
    expect(headlineText(3, 9, 1, 2, 0)).toBe('3 of 9 dependencies are in the graveyard: 1 buried, 2 forgotten.');
    expect(headlineText(3, 9, 1, 0, 2)).toBe('3 of 9 dependencies are in the graveyard: 1 buried, 2 haunted.');
    expect(headlineText(3, 9, 0, 1, 2)).toBe('3 of 9 dependencies are in the graveyard: 1 forgotten, 2 haunted.');
  });
});

describe('buildHeaderModel headline (R5.2, R5.4)', () => {
  it('builds N, B, F, H from the rows and summary', () => {
    const h = headerOf(specsOf({ alive: 2, buried: 2, forgotten: 3, haunted: 4 }));
    expect(h.headline).toMatchObject({ n: 9, m: 11, buried: 2, forgotten: 3, haunted: 4 });
    expect(h.headline?.text).toBe('9 of 11 dependencies are in the graveyard: 2 buried, 3 forgotten, 4 haunted.');
    expect(h.emptyText).toBeNull();
  });

  it('writes no colon when nothing is in the graveyard', () => {
    const h = headerOf(specsOf({ alive: 6 }));
    expect(h.headline?.text).toBe('0 of 6 dependencies are in the graveyard.');
  });

  it('counts a restless ghost in H and not in B', () => {
    const h = headerOf(specsOf({ 'restless-archived': 1, 'restless-deprecated': 1, 'restless-both': 1, buried: 1 }));
    expect(h.headline).toMatchObject({ n: 4, m: 4, buried: 1, forgotten: 0, haunted: 3 });
    expect(h.counts).toMatchObject({ haunted: 3, buried: 1, dead: 1 });
    expect(h.headline?.text).toBe('4 of 4 dependencies are in the graveyard: 1 buried, 3 haunted.');
  });

  it('shows the empty sentence and no grade when M is 0', () => {
    const h = headerOf(specsOf({ 'unassessed-git': 2 }));
    expect(h.headline).toBeNull();
    expect(h.emptyText).toBe('No dependencies could be assessed');
    expect(h.grade.letter).toBeNull();
    expect(h.grade.explanation).toBe('no grade');
    expect(h.counts.unassessed).toBe(2);
  });
});

describe('buildHeaderModel grade (R5.5)', () => {
  it('labels the grade "worst single risk" and explains it from the summary', () => {
    const result = buildScanResult(specsOf({ alive: 1, forgotten: 1 })) as unknown as ParsedScanResult;
    const h = buildHeaderModel(result, buildPackageRows(result));
    const s = result.summary;
    expect(h.grade.label).toBe('worst single risk');
    expect(h.grade.letter).toBe(s.grade);
    expect(h.grade.explanation).toBe(
      `Graded on the riskiest package, ${s.maxScorePackage!.name} (score ${s.maxScore}), not on the average (${s.averageScore})`,
    );
  });
});

describe('buildHeaderModel entries sentence (R5.7)', () => {
  it('is null when entries do not exceed the unique total', () => {
    expect(headerOf(specsOf({ alive: 3 })).entriesSentence).toBeNull();
  });

  it('states entries, manifests and unique packages when entries exceed the total', () => {
    const specs: RowSpec[] = [
      { name: 'dup', kind: 'alive', manifestPath: 'package.json' },
      { name: 'dup', kind: 'alive', manifestPath: 'packages/a/package.json' },
      { name: 'solo', kind: 'alive', manifestPath: 'package.json' },
    ];
    const result = buildScanResult(specs, { manifestPaths: ['package.json', 'packages/a/package.json'] });
    const h = buildHeaderModel(result as unknown as ParsedScanResult, buildPackageRows(result as unknown as ParsedScanResult));
    expect(h.entriesSentence).toBe(
      `${result.dependencies.length} dependency entries across 2 manifests, ${result.summary.total} unique packages`,
    );
    expect(h.entriesSentence).toBe('3 dependency entries across 2 manifests, 2 unique packages');
  });
});

describe('buildHeaderModel branch (R5.8)', () => {
  it('flags a branch that is not the default', () => {
    const result = buildScanResult(specsOf({ alive: 1 })) as unknown as ParsedScanResult;
    const other = { ...result, repo: { ...result.repo, branch: 'dev' } } as ParsedScanResult;
    const h = buildHeaderModel(other, buildPackageRows(other));
    expect(h.branch).toBe('dev');
    expect(h.notDefaultBranch).toBe(true);
  });

  it('does not flag the default branch', () => {
    expect(headerOf(specsOf({ alive: 1 })).notDefaultBranch).toBe(false);
  });
});

describe('formatAge (R3.10)', () => {
  const asOf = '2026-01-01T00:00:00Z';
  const at = (ms: number): number => Date.parse(asOf) + ms;
  const SEC = 1000;
  const MIN = 60 * SEC;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  it('says "just now" for seconds', () => {
    expect(formatAge(asOf, at(0))).toBe('scanned just now');
    expect(formatAge(asOf, at(59 * SEC))).toBe('scanned just now');
  });

  it('counts minutes', () => {
    expect(formatAge(asOf, at(MIN))).toBe('scanned 1 minute ago');
    expect(formatAge(asOf, at(5 * MIN))).toBe('scanned 5 minutes ago');
  });

  it('counts hours', () => {
    expect(formatAge(asOf, at(HOUR))).toBe('scanned 1 hour ago');
    expect(formatAge(asOf, at(3 * HOUR))).toBe('scanned 3 hours ago');
  });

  it('counts days', () => {
    expect(formatAge(asOf, at(DAY))).toBe('scanned 1 day ago');
    expect(formatAge(asOf, at(4 * DAY))).toBe('scanned 4 days ago');
  });
});
