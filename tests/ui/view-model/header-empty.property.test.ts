// Feature: graveyard-art, Property GA-P12: The header shows either a verdict or one empty sentence
// **Validates: Requirements 5.4, 5.9, 11.1, 11.2, 11.3, 11.4, 11.5**
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildHeaderModel, headlineText } from '../../../view-model/header';
import { buildPackageRows } from '../../../view-model/package-rows';
import { parseScanResponse } from '../../../view-model/parse-response';
import type { ParsedScanResult } from '../../../view-model/types';
import type { ScanResult } from '../../../pipeline/scan/types';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';
import { cfg } from '../../support/fc-config';

const headers = { get: (): string | null => null };

/** Forces `summary.assessed` to 0 (nothing graded), keeping `total`; `emptyTotal` also forces total 0. */
function forceNoneAssessed(result: ScanResult, emptyTotal: boolean, noManifests: boolean): ScanResult {
  const total = emptyTotal ? 0 : Math.max(result.summary.total, 1);
  const base = {
    ...result,
    summary: {
      ...result.summary,
      total,
      assessed: 0,
      unassessed: total,
      counts: { ALIVE: 0, HAUNTED: 0, DEAD: 0 },
      grade: null,
      averageScore: null,
      maxScore: null,
      maxScorePackage: null,
    },
  };
  return (noManifests ? { ...base, manifests: [] } : base) as unknown as ScanResult;
}

function parse(result: ScanResult): ParsedScanResult | null {
  const out = parseScanResponse(200, headers, JSON.parse(JSON.stringify(result)));
  return out.kind === 'result' ? out.result : null;
}

function headerStrings(h: ReturnType<typeof buildHeaderModel>): string[] {
  return [
    h.headline?.text ?? '',
    h.emptySentence ?? '',
    h.grade?.label ?? '',
    h.grade?.explanation ?? '',
    ...h.chips.map((c) => c.text),
  ];
}

describe('GA-P12 The header shows either a verdict or one empty sentence', () => {
  it('GA-P12 assessed 0: no headline, grade or chips; one sentence iff a manifest exists', () => {
    fc.assert(
      fc.property(arbScanResult(), fc.boolean(), fc.boolean(), (generated, emptyTotal, noManifests) => {
        const parsed = parse(forceNoneAssessed(generated, emptyTotal, noManifests));
        expect(parsed).not.toBeNull();
        if (parsed === null) return;
        expect(parsed.summary.assessed).toBe(0);
        const h = buildHeaderModel(parsed, buildPackageRows(parsed));
        expect(h.headline).toBeNull();
        expect(h.grade).toBeNull();
        expect(h.chips).toEqual([]);
        if (parsed.manifests.length === 0) {
          expect(h.emptySentence).toBeNull();
        } else if (parsed.summary.total === 0) {
          expect(h.emptySentence).toBe('This repository declares no dependencies, so there is nothing to grade.');
        } else {
          expect(h.emptySentence).toBe(
            `The caretaker could not assess any of the ${parsed.summary.total} dependencies, so there is no grade.`,
          );
        }
        for (const s of headerStrings(h)) {
          expect(s).not.toContain('NO GRADE');
          expect(s.split('no grade').length - 1).toBeLessThanOrEqual(1);
        }
      }),
      cfg(),
    );
  });

  it('GA-P12 assessed above 0: verdict, four chips from the summary, no empty sentence', () => {
    fc.assert(
      fc.property(arbScanResult(), (generated) => {
        const parsed = parse(generated);
        expect(parsed).not.toBeNull();
        if (parsed === null || parsed.summary.assessed === 0) return;
        const rows = buildPackageRows(parsed);
        const h = buildHeaderModel(parsed, rows);
        const { counts, unassessed } = parsed.summary;
        expect(h.emptySentence).toBeNull();
        expect(h.grade).not.toBeNull();
        expect(h.headline).not.toBeNull();
        if (h.headline === null) return;
        expect(h.headline.text).toBe(
          headlineText(h.headline.n, h.headline.m, h.headline.buried, h.headline.forgotten, h.headline.haunted),
        );
        expect(h.chips).toHaveLength(4);
        expect(h.chips.map((c) => c.status)).toEqual(['dead', 'haunted', 'alive', 'unassessed']);
        expect(h.chips[0].text).toBe(`${counts.DEAD} dead (${h.counts.buried} buried, ${h.counts.forgotten} forgotten)`);
        expect(h.counts.buried + h.counts.forgotten).toBe(counts.DEAD);
        expect(h.chips[1].text).toBe(`${counts.HAUNTED} haunted`);
        expect(h.chips[2].text).toBe(`${counts.ALIVE} alive`);
        expect(h.chips[3].text).toBe(`${unassessed} unassessed`);
        for (const s of headerStrings(h)) {
          expect(s).not.toContain('NO GRADE');
          expect(s).not.toContain('no grade');
          expect(s).not.toContain('No dependencies could be assessed');
        }
      }),
      cfg(),
    );
  });
});
