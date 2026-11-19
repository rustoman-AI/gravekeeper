import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ADVISORY_URL_PREFIX } from '../../../pipeline/constants';
import { advisoryUrl, buildAdvisoryEntries } from '../../../pipeline/mapping/advisories';
import type { AdvisoryRecord } from '../../../pipeline/mapping/types';
import { cfg } from '../../support/fc-config';

const SEVERITIES = [null, 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

const idArb = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom('GHSA-1', 'GHSA-2', 'CVE-1', 'RUSTSEC-1', 'A', 'b') },
  { weight: 3, arbitrary: fc.string({ unit: 'binary', maxLength: 8 }) },
  { weight: 1, arbitrary: fc.constantFrom('a%20b', 'x y', '%', 'a/b?c#d', 'é', '\u{1F480}') },
);
const rawIdArb: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 6, arbitrary: idArb },
  { weight: 1, arbitrary: fc.constant('') },
  { weight: 1, arbitrary: fc.oneof(fc.integer(), fc.constant(null), fc.constant(undefined), fc.boolean(), fc.object()) },
);
const aliasArb = fc.oneof(fc.constantFrom('GHSA-1', 'CVE-1', 'CVE-2', 'LOW', 'HIGH'), fc.string({ maxLength: 4 }));

const recordFor = (id: string): fc.Arbitrary<AdvisoryRecord> =>
  fc.record({
    id: fc.constant(id),
    aliases: fc.array(fc.oneof(aliasArb, fc.constant(id)), { maxLength: 5 }),
    withdrawn: fc.boolean(),
    informational: fc.boolean(),
    unmaintained: fc.boolean(),
    severity: fc.constantFrom(...SEVERITIES),
  });

const scenario = fc
  .tuple(fc.array(rawIdArb, { maxLength: 8 }), fc.array(idArb, { maxLength: 4 }))
  .chain(([ids, extra]) => {
    const strings = [...new Set([...ids, ...extra].filter((x): x is string => typeof x === 'string' && x !== ''))];
    return fc
      .tuple(...strings.map((id) => fc.option(recordFor(id), { nil: undefined })))
      .map((recs) => {
        const records = new Map<string, AdvisoryRecord>();
        recs.forEach((r, i) => {
          if (r !== undefined) records.set(strings[i] as string, r);
        });
        return { ids, records };
      });
  });

function codePointCompare(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = (x[i] as string).codePointAt(0)! - (y[i] as string).codePointAt(0)!;
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

describe('advisory entries properties', () => {
  it('P10: Advisory entries mirror the OSV ids', () => {
    // Feature: scan-accuracy, Property 10: Advisory entries mirror the OSV ids
    // Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.13, 6.14, 6.15
    fc.assert(
      fc.property(scenario, ({ ids, records }) => {
        const entries = buildAdvisoryEntries(ids, records);
        const expected = [
          ...new Set(ids.filter((x): x is string => typeof x === 'string' && x !== '')),
        ].sort(codePointCompare);
        expect(entries.map((e) => e.id)).toEqual(expected);
        for (const e of entries) {
          const suffix = e.url.slice(ADVISORY_URL_PREFIX.length);
          expect(e.url.startsWith(ADVISORY_URL_PREFIX)).toBe(true);
          expect(suffix).not.toMatch(/[/?#]/);
          expect(decodeURIComponent(suffix)).toBe(e.id);
          expect(e.url).toBe(advisoryUrl(e.id));
          expect(e.aliases).not.toContain(e.id);
          expect([...e.aliases].sort(codePointCompare)).toEqual(e.aliases);
          expect(new Set(e.aliases).size).toBe(e.aliases.length);
          const rec = records.get(e.id);
          if (rec === undefined) {
            expect(e.severity).toBeNull();
            expect(e.aliases).toEqual([]);
          } else {
            expect(e.severity).toBe(rec.severity);
            expect(e.aliases).toEqual(
              [...new Set(rec.aliases.filter((a) => a !== '' && a !== e.id))].sort(codePointCompare),
            );
          }
        }
        expect(buildAdvisoryEntries(ids, records)).toEqual(entries);
      }),
      cfg(),
    );
  });

  it('P10: no ids gives an empty list', () => {
    // Feature: scan-accuracy, Property 10: Advisory entries mirror the OSV ids
    // Validates: Requirements 6.9
    fc.assert(
      fc.property(fc.array(fc.oneof(fc.constant(''), fc.integer(), fc.constant(null))), (ids) => {
        expect(buildAdvisoryEntries(ids, new Map())).toEqual([]);
      }),
      cfg(),
    );
  });
});
