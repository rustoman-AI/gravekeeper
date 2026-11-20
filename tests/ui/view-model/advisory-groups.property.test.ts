// Feature: graveyard-ui, Property 21: Detail lists every advisory once, in its labelled group
// Validates: Requirements 10.16, 10.18, 10.19
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildAdvisoryGroups } from '../../../view-model/advisory-groups';
import type { AdvisoryExclusion, ParsedAdvisory } from '../../../view-model/types';
import { cfg } from '../../support/fc-config';

const EXCLUSIONS: readonly AdvisoryExclusion[] = ['counted', 'informational', 'withdrawn', 'unknown'];
const HEADINGS: Readonly<Record<AdvisoryExclusion, string>> = {
  counted: 'Counted as open',
  informational: 'Informational, not counted',
  withdrawn: 'Withdrawn, not counted',
  unknown: 'Not classified',
};

// Small id pool so that duplicates and note-named ids are common; hostile ids included.
const ID_POOL = ['GHSA-aaaa', 'CVE-2024-1', 'PYSEC-1', '<script>alert(1)</script>', 'a b/c?d#e', '../../x', '', '\u0000\u202e'];
const advisoryId = fc.oneof(fc.constantFrom(...ID_POOL), fc.string({ maxLength: 12 }));

const OSV = 'https://osv.dev/vulnerability/';
const advisoryUrl = fc.oneof(
  advisoryId.map((id) => OSV + encodeURIComponent(id)), // valid pattern
  fc.constantFrom(
    `${OSV}GHSA-1`,
    `${OSV}CVE-2024-1%2F`,
    'javascript:alert(1)',
    'http://osv.dev/vulnerability/GHSA-1',
    `${OSV}`,
    `${OSV}a/b`,
    `${OSV}x y`,
    'https://evil.example/https://osv.dev/vulnerability/x',
    '',
  ),
  fc.string({ maxLength: 40 }),
);

const advisory: fc.Arbitrary<ParsedAdvisory> = fc.record({
  id: advisoryId,
  aliases: fc.array(advisoryId, { maxLength: 3 }),
  severity: fc.constantFrom('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', null),
  url: advisoryUrl,
  exclusion: fc.constantFrom(...EXCLUSIONS),
});

// R21.3 pattern, written independently of the implementation.
function oracleHref(url: string): string | null {
  return /^https:\/\/osv\.dev\/vulnerability\/[A-Za-z0-9._:%-]+$/.test(url) ? url : null;
}

// Independent oracle: withdrawn wins, a known exclusion stands, an absent one falls back to the note ids.
function oracleGroup(a: ParsedAdvisory, noteIds: ReadonlySet<string>): AdvisoryExclusion {
  if (a.exclusion !== 'unknown') return a.exclusion;
  return noteIds.has(a.id) ? 'informational' : 'unknown';
}

const input = fc.tuple(
  fc.array(advisory, { maxLength: 15 }),
  fc.option(fc.nat({ max: 20 }), { nil: null }),
  fc.array(advisoryId, { maxLength: 6 }).map((ids) => new Set(ids)),
);

describe('P21: Detail lists every advisory once, in its labelled group', () => {
  it('puts every entry in exactly one group, in API order, with unchanged id and checked href', () => {
    fc.assert(
      fc.property(input, ([advisories, count, noteIds]) => {
        const groups = buildAdvisoryGroups(advisories, count, noteIds);

        // Group order and uniqueness, headings by exclusion.
        const kinds = groups.map((g) => g.exclusion);
        expect(new Set(kinds).size).toBe(kinds.length);
        expect(kinds).toEqual(EXCLUSIONS.filter((k) => kinds.includes(k)));
        for (const g of groups) expect(g.heading).toBe(HEADINGS[g.exclusion]);

        // Sizes add up.
        expect(groups.reduce((n, g) => n + g.entries.length, 0)).toBe(advisories.length);

        for (const kind of EXCLUSIONS) {
          const expected = advisories.filter((a) => oracleGroup(a, noteIds) === kind);
          const group = groups.find((g) => g.exclusion === kind);
          const entries = group?.entries ?? [];
          expect(entries.map((e) => e.id)).toEqual(expected.map((a) => a.id));
          expect(entries.map((e) => e.aliases)).toEqual(expected.map((a) => a.aliases));
          expect(entries.map((e) => e.href)).toEqual(expected.map((a) => oracleHref(a.url)));
          // Empty groups are omitted, except counted when the count is positive.
          const forced = kind === 'counted' && count !== null && count > 0;
          expect(group !== undefined).toBe(expected.length > 0 || forced);
        }
      }),
      cfg(),
    );
  });

  it('with every exclusion known, each entry is in the group its value names and nothing is unclassified', () => {
    const known = fc.array(
      advisory.map((a) => ({ ...a, exclusion: a.exclusion === 'unknown' ? ('counted' as const) : a.exclusion })),
      { maxLength: 15 },
    );
    fc.assert(
      fc.property(known, fc.option(fc.nat({ max: 20 }), { nil: null }), fc.array(advisoryId, { maxLength: 6 }), (advisories, count, ids) => {
        const groups = buildAdvisoryGroups(advisories, count, new Set(ids));
        expect(groups.some((g) => g.exclusion === 'unknown')).toBe(false);
        for (const g of groups) {
          const expected = advisories.filter((a) => a.exclusion === g.exclusion);
          expect(g.entries.map((e) => e.id)).toEqual(expected.map((a) => a.id));
        }
      }),
      cfg(),
    );
  });

  it('with an absent exclusion, note-named ids are informational and the rest are not classified', () => {
    const absent = fc.array(
      advisory.map((a) => ({ ...a, exclusion: 'unknown' as const })),
      { maxLength: 15 },
    );
    fc.assert(
      fc.property(absent, fc.array(advisoryId, { maxLength: 6 }), (advisories, ids) => {
        const noteIds = new Set(ids);
        const groups = buildAdvisoryGroups(advisories, null, noteIds);
        const info = groups.find((g) => g.exclusion === 'informational')?.entries ?? [];
        const unk = groups.find((g) => g.exclusion === 'unknown')?.entries ?? [];
        expect(info.map((e) => e.id)).toEqual(advisories.filter((a) => noteIds.has(a.id)).map((a) => a.id));
        expect(unk.map((e) => e.id)).toEqual(advisories.filter((a) => !noteIds.has(a.id)).map((a) => a.id));
        expect(groups.some((g) => g.exclusion === 'counted' || g.exclusion === 'withdrawn')).toBe(false);
      }),
      cfg(),
    );
  });

  it('a withdrawn entry stays withdrawn even when a note names its id', () => {
    fc.assert(
      fc.property(advisory, (a) => {
        const groups = buildAdvisoryGroups([{ ...a, exclusion: 'withdrawn' }], 0, new Set([a.id]));
        expect(groups.map((g) => g.exclusion)).toEqual(['withdrawn']);
      }),
      cfg(),
    );
  });
});
