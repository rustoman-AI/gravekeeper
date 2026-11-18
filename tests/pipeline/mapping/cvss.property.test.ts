import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CVSS_RANGES } from '../../../pipeline/constants';
import { cvssSeverity, cvssV3BaseScore } from '../../../pipeline/mapping/cvss';
import { cfg } from '../../support/fc-config';
import {
  arbCvssMetrics,
  arbCvssVersion,
  arbMetricOrder,
  buildVector,
  type CvssMetrics,
} from '../../support/arbitraries/cvss';

const RANK: Readonly<Record<string, number>> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
const rank = (s: string | null): number => (s === null ? 0 : (RANK[s] as number));

describe('cvss properties', () => {
  // Feature: scan-pipeline, Property 27: CVSS score range and severity mapping
  // Validates: Requirements 10.9
  it('P27 score is in range with one decimal and severity follows CVSS_RANGES', () => {
    fc.assert(
      fc.property(arbCvssVersion, arbCvssMetrics, (version, metrics) => {
        const vector = buildVector(version, metrics);
        const score = cvssV3BaseScore(vector);
        expect(score).not.toBeNull();
        const s = score as number;
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(10);
        expect(Math.round(s * 10) / 10).toBe(s);
        const expected = s === 0 ? null : (CVSS_RANGES.find((r) => s >= r.min && s <= r.max)?.severity ?? 'NO-RANGE');
        expect(cvssSeverity(vector)).toBe(expected);
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 28: CVSS severity is monotonic in impact
  // Validates: Requirements 10.10
  it('P28 raising C, I or A never lowers the severity', () => {
    const levels = ['N', 'L', 'H'] as const;
    fc.assert(
      fc.property(arbCvssVersion, arbCvssMetrics, fc.constantFrom('C', 'I', 'A'), (version, metrics, key) => {
        let previous = -1;
        let previousScore = -1;
        for (const level of levels) {
          const m: CvssMetrics = { ...metrics, [key]: level };
          const vector = buildVector(version, m);
          const r = rank(cvssSeverity(vector));
          const score = cvssV3BaseScore(vector) as number;
          expect(r).toBeGreaterThanOrEqual(previous);
          expect(score).toBeGreaterThanOrEqual(previousScore);
          previous = r;
          previousScore = score;
        }
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 29: CVSS result does not depend on metric order
  // Validates: Requirements 10.12
  it('P29 permuting metric segments keeps score and severity', () => {
    fc.assert(
      fc.property(arbCvssVersion, arbCvssMetrics, arbMetricOrder, (version, metrics, order) => {
        const base = buildVector(version, metrics);
        const permuted = buildVector(version, metrics, order);
        expect(cvssV3BaseScore(permuted)).toBe(cvssV3BaseScore(base));
        expect(cvssSeverity(permuted)).toBe(cvssSeverity(base));
      }),
      cfg(),
    );
  });
});
