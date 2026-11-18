import * as fc from 'fast-check';

export const CVSS_BASE_KEYS = ['AV', 'AC', 'PR', 'UI', 'S', 'C', 'I', 'A'] as const;
export type CvssKey = (typeof CVSS_BASE_KEYS)[number];

export const CVSS_VALUES: Readonly<Record<CvssKey, readonly string[]>> = {
  AV: ['N', 'A', 'L', 'P'],
  AC: ['L', 'H'],
  PR: ['N', 'L', 'H'],
  UI: ['N', 'R'],
  S: ['U', 'C'],
  C: ['N', 'L', 'H'],
  I: ['N', 'L', 'H'],
  A: ['N', 'L', 'H'],
};

export type CvssMetrics = Record<CvssKey, string>;

export const arbCvssVersion = fc.constantFrom('3.0', '3.1');

export const arbCvssMetrics: fc.Arbitrary<CvssMetrics> = fc.record({
  AV: fc.constantFrom(...CVSS_VALUES.AV),
  AC: fc.constantFrom(...CVSS_VALUES.AC),
  PR: fc.constantFrom(...CVSS_VALUES.PR),
  UI: fc.constantFrom(...CVSS_VALUES.UI),
  S: fc.constantFrom(...CVSS_VALUES.S),
  C: fc.constantFrom(...CVSS_VALUES.C),
  I: fc.constantFrom(...CVSS_VALUES.I),
  A: fc.constantFrom(...CVSS_VALUES.A),
});

export function buildVector(version: string, metrics: CvssMetrics, order: readonly CvssKey[] = CVSS_BASE_KEYS): string {
  return `CVSS:${version}/` + order.map((k) => `${k}:${metrics[k]}`).join('/');
}

export const arbCvssVector: fc.Arbitrary<string> = fc
  .tuple(arbCvssVersion, arbCvssMetrics)
  .map(([v, m]) => buildVector(v, m));

/** A permutation of the eight metric keys. */
export const arbMetricOrder: fc.Arbitrary<readonly CvssKey[]> = fc.shuffledSubarray([...CVSS_BASE_KEYS], {
  minLength: CVSS_BASE_KEYS.length,
  maxLength: CVSS_BASE_KEYS.length,
});
