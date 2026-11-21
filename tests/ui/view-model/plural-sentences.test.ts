// graveyard-art Requirement 20: every count sentence renders the noun form that agrees with its count.
// Each sentence is rendered with n = 0, 1 and 2; only n = 1 takes the singular.
import { describe, expect, it } from 'vitest';
import type { ReasonFact } from '../../../core';
import { buildAdvisoryGroups } from '../../../view-model/advisory-groups';
import { humanizeDays } from '../../../view-model/duration';
import { buildEpitaph } from '../../../view-model/epitaph';
import { formatFact } from '../../../view-model/format-fact';
import { buildHeaderModel, formatAge, headlineText } from '../../../view-model/header';
import { buildPackageRows } from '../../../view-model/package-rows';
import { plainReasonLine } from '../../../view-model/plain-reasons';
import { plural } from '../../../view-model/plural';
import { epitaphOf, shortForm } from '../../../view-model/reasons';
import { buildTableModel } from '../../../view-model/table';
import type { PackageRow, ParsedAdvisory, ParsedScanResult } from '../../../view-model/types';
import { buildScanResult } from '../../support/ui/scan-result-builder';
import type { PlotCase } from '../../support/ui/scan-result-builder';
import { cls } from './grave-type.test';

const COUNTS = [0, 1, 2] as const;

/** The expected noun for a count, written out independently of the helper. */
const noun = (n: number, one: string, many: string): string => (n === 1 ? one : many);

describe('plural helper (R20.1, R20.2)', () => {
  it('uses the singular only for 1', () => {
    expect(COUNTS.map((n) => plural(n, 'day', 'days'))).toEqual(['days', 'day', 'days']);
    expect(plural(11, 'entry', 'entries')).toBe('entries');
  });
});

describe('header sentences (R20.3, R20.4)', () => {
  const base = (): ParsedScanResult => {
    const result = buildScanResult([{ name: 'a', kind: 'alive' }]) as unknown as ParsedScanResult;
    return result;
  };
  const headerOf = (result: ParsedScanResult) => buildHeaderModel(result, buildPackageRows(result));
  const withShape = (entries: number, manifests: number, total: number): ParsedScanResult => {
    const result = base();
    return {
      ...result,
      dependencies: Array.from({ length: entries }, () => result.dependencies[0]!),
      manifests: Array.from({ length: manifests }, (_, i) => result.manifests[0] ?? `m${String(i)}`) as never,
      summary: { ...result.summary, total },
    };
  };

  it.each(COUNTS)('entries sentence names manifests and packages in agreement for n = %i', (n) => {
    const sentence = headerOf(withShape(5, n, n)).entriesSentence;
    expect(sentence).toBe(
      `5 dependency entries across ${n} ${noun(n, 'manifest', 'manifests')}, ${n} unique ${noun(n, 'package', 'packages')}`,
    );
  });

  it('writes "1 manifest" for the known defect and "1 dependency entry" for one entry', () => {
    expect(headerOf(withShape(22, 1, 20)).entriesSentence).toBe(
      '22 dependency entries across 1 manifest, 20 unique packages',
    );
    expect(headerOf(withShape(1, 1, 0)).entriesSentence).toBe(
      '1 dependency entry across 1 manifest, 0 unique packages',
    );
  });

  it.each(COUNTS)('headline names the assessed dependencies in agreement for m = %i', (m) => {
    expect(headlineText(0, m, 0, 0, 0)).toBe(
      `0 of ${m} ${noun(m, 'dependency', 'dependencies')} are in the graveyard.`,
    );
  });

  it.each(COUNTS)('headline verb agrees with the graveyard count n = %i', (n) => {
    const verb = n === 1 ? 'is' : 'are';
    const tail = n > 0 ? `: ${n} haunted` : '';
    expect(headlineText(n, 40, 0, 0, n)).toBe(`${n} of 40 dependencies ${verb} in the graveyard${tail}.`);
  });

  it('headline pairs the verb with n and the noun with m', () => {
    expect(headlineText(1, 40, 0, 0, 1)).toBe('1 of 40 dependencies is in the graveyard: 1 haunted.');
    expect(headlineText(0, 1, 0, 0, 0)).toBe('0 of 1 dependency are in the graveyard.');
    expect(headlineText(1, 1, 0, 0, 1)).toBe('1 of 1 dependency is in the graveyard: 1 haunted.');
  });

  it.each(COUNTS)('empty sentence names the dependencies in agreement for n = %i', (n) => {
    const result = base();
    const none = {
      ...result,
      summary: { ...result.summary, total: n, assessed: 0, unassessed: n },
    } as ParsedScanResult;
    const sentence = headerOf(none).emptySentence;
    if (n === 0) {
      expect(sentence).toBe('This repository declares no dependencies, so there is nothing to grade.');
    } else {
      expect(sentence).toBe(
        `The caretaker could not assess any of the ${n} ${noun(n, 'dependency', 'dependencies')}, so there is no grade.`,
      );
    }
  });

  it.each([
    [0, 'scanned just now'],
    [1, 'scanned 1 minute ago'],
    [2, 'scanned 2 minutes ago'],
  ])('scan age in minutes for n = %i', (n, text) => {
    const asOf = '2025-01-01T00:00:00.000Z';
    expect(formatAge(asOf, Date.parse(asOf) + n * 60_000)).toBe(text);
  });

  it('scan age in hours and days uses the singular for 1', () => {
    const asOf = '2025-01-01T00:00:00.000Z';
    const at = (ms: number) => Date.parse(asOf) + ms;
    expect(formatAge(asOf, at(3_600_000))).toBe('scanned 1 hour ago');
    expect(formatAge(asOf, at(2 * 3_600_000))).toBe('scanned 2 hours ago');
    expect(formatAge(asOf, at(86_400_000))).toBe('scanned 1 day ago');
    expect(formatAge(asOf, at(2 * 86_400_000))).toBe('scanned 2 days ago');
  });
});

describe('duration and fact sentences (R20.4)', () => {
  it.each(COUNTS)('days: "%i day(s)"', (n) => {
    // 0 days is "less than a day" by Requirement 6; the fact text keeps the number.
    if (n > 0) expect(humanizeDays(n)).toBe(`${n} ${noun(n, 'day', 'days')}`);
    expect(formatFact('daysSinceLastRelease', n)).toBe(`${n} ${noun(n, 'day', 'days')}`);
    expect(formatFact('daysSinceLastCommit', n)).toBe(`${n} ${noun(n, 'day', 'days')}`);
  });

  it('months and years: the unit counts agree', () => {
    expect(humanizeDays(60)).toBe('2 months');
    expect(humanizeDays(730)).toBe('2 years');
    expect(humanizeDays(0)).toBe('less than a day');
  });
});

describe('vulnerability sentences (R20.4)', () => {
  const vuln = (n: number): ReasonFact[] => [
    { field: 'openVulnerabilityCount', value: n },
    { field: 'maxSeverity', value: 'HIGH' },
  ];
  const nounOf = (n: number) => noun(n, 'vulnerability', 'vulnerabilities');

  it.each(COUNTS)('short form for n = %i', (n) => {
    const reason = cls('HAUNTED', ['7.2'], vuln(n)).reasons[0]!;
    expect(shortForm(reason)).toBe(`${n} open ${nounOf(n)} (HIGH)`);
  });

  it.each(COUNTS)('plain reason line for n = %i', (n) => {
    const reason = cls('HAUNTED', ['7.2'], vuln(n)).reasons[0]!;
    expect(plainReasonLine(reason)).toBe(`It has ${n} open ${nounOf(n)}, the worst of severity HIGH.`);
  });

  it.each(COUNTS)('epitaph ghost sentence for n = %i', (n) => {
    const rows = buildPackageRows(buildScanResult([{ name: 'g', kind: 'haunted' as PlotCase }]) as unknown as ParsedScanResult);
    const row: PackageRow = { ...rows[0]!, facts: { ...rows[0]!.facts, openVulnerabilityCount: n, maxSeverity: null } };
    expect(buildEpitaph(row).lines.at(-1)).toBe(`It is haunted by ${n} open ${nounOf(n)}.`);
  });

  it.each(COUNTS)('advisory group explanation for n = %i', (n) => {
    const informational: ParsedAdvisory = {
      id: 'I-1',
      aliases: [],
      severity: null,
      url: 'https://osv.dev/vulnerability/I-1',
      exclusion: 'informational',
    };
    const groups = buildAdvisoryGroups([informational], n, new Set());
    expect(groups[groups.length - 1]!.explanation).toBe(`not part of the ${n} open ${nounOf(n)}`);
  });
});

describe('overgrown epitaph tail (R20.4)', () => {
  it.each(COUNTS)('last release %i day(s) ago', (n) => {
    const days: ReasonFact[] = [{ field: 'daysSinceLastRelease', value: n }];
    expect(epitaphOf('old', cls('DEAD', ['8.3'], days))).toBe(
      `old may be finished or abandoned, last release ${n} ${noun(n, 'day', 'days')} ago`,
    );
  });
});

describe('list view caption (R20.4)', () => {
  it.each(COUNTS)('caption for n = %i rows', (n) => {
    const specs = Array.from({ length: n }, (_, i) => ({ name: `p${String(i)}`, kind: 'alive' as PlotCase }));
    const rows = buildPackageRows(buildScanResult(specs) as unknown as ParsedScanResult);
    expect(buildTableModel(rows, null).caption).toBe(`Dependencies, ${n} unique ${noun(n, 'package', 'packages')}`);
  });
});
