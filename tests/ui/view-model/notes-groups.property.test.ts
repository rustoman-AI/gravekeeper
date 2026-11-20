// Feature: graveyard-ui, Property 22: Every note lands in exactly one group
// Validates: Requirements 11.4, 11.7, 11.8, 11.14
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { NOTE_SECTIONS, OTHER_NOTES_TITLE, buildNotesModel } from '../../../view-model/notes';
import { parseScanResponse } from '../../../view-model/parse-response';
import type { ParsedScanResult } from '../../../view-model/types';
import { cfg } from '../../support/fc-config';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';

// Requirement 11.7, written out independently of the implementation table.
const SECTIONS: readonly { readonly title: string; readonly codes: readonly string[] }[] = [
  {
    title: "The caretaker's own limits",
    codes: [
      'github-token-missing',
      'github-budget-low',
      'dependency-cap-exceeded',
      'scan-deadline-reached',
      'source-partial',
      'source-failed',
      'batch-fallback',
    ],
  },
  {
    title: 'Missing records',
    codes: [
      'package-not-found',
      'no-default-version',
      'pin-not-found',
      'conflicting-pins',
      'range-unresolved',
      'advisory-details-incomplete',
      'osv-pagination-ignored',
      'maintainers-lower-bound',
    ],
  },
  {
    title: 'Unverified links and special cases',
    codes: ['source-repo-unverified', 'informational-advisory-excluded', 'unmaintained-advisory'],
  },
  {
    title: 'The plot map',
    codes: ['tree-truncated', 'no-manifests', 'no-root-manifest', 'manifest-too-large', 'manifest-fetch-failed'],
  },
];
const OTHER_TITLE = 'Other notes';
const KNOWN: ReadonlySet<string> = new Set(SECTIONS.flatMap((s) => s.codes));
const sectionOf = (code: string): string =>
  SECTIONS.find((s) => s.codes.includes(code))?.title ?? OTHER_TITLE;

const arbUnknownCode = fc
  .oneof(
    fc.string({ maxLength: 20 }),
    fc.stringMatching(/^[a-z]+(-[a-z]+){0,3}$/),
    fc.constantFrom('other', 'Other notes', '', '__proto__', 'constructor', 'toString', 'GITHUB-TOKEN-MISSING', 'source-failed '),
  )
  .filter((c) => !KNOWN.has(c));
const arbCode = fc.oneof(fc.constantFrom(...KNOWN), arbUnknownCode);
const arbMessage = fc.oneof(
  fc.string({ maxLength: 40 }),
  fc.constantFrom('<script>alert(1)</script>', '"quoted" & \'single\'', '', '  padded  ', 'line\nbreak\ttab', '__proto__', '\u202e\u0000rtl', '😀 ünï'),
  fc.string({ unit: 'binary', maxLength: 20 }),
);
const arbNotes = fc.array(fc.record({ code: arbCode, message: arbMessage }), { maxLength: 40 });

function parsedWith(generated: unknown, notes: readonly { code: string; message: string }[]): ParsedScanResult {
  const wire = JSON.parse(JSON.stringify(generated)) as Record<string, unknown>;
  wire['notes'] = notes.map((n) => ({ code: n.code, message: n.message }));
  const outcome = parseScanResponse(200, { get: () => null }, wire);
  if (outcome.kind !== 'result') throw new Error(`generated result did not parse: ${outcome.kind}`);
  return outcome.result;
}

describe('P22: Every note lands in exactly one group', () => {
  it('puts every note in exactly one group, with counts summing to notes.length and messages verbatim', () => {
    fc.assert(
      fc.property(arbScanResult(), arbNotes, (generated, notes) => {
        const model = buildNotesModel(parsedWith(generated, notes));
        const groups = model.sections.flatMap((s) => s.groups.map((g) => ({ section: s.title, group: g })));

        // Sum of counts, and each count is the length of its message list.
        expect(groups.reduce((n, g) => n + g.group.count, 0)).toBe(notes.length);
        for (const { group } of groups) {
          expect(group.count).toBe(group.messages.length);
          expect(group.count).toBeGreaterThan(0);
        }

        // Expected multiset of (section, message): each note counted once, under the section of its code.
        const expected = notes.map((n) => JSON.stringify([sectionOf(n.code), n.message])).sort();
        const actual = groups
          .flatMap((g) => g.group.messages.map((m) => JSON.stringify([g.section, m])))
          .sort();
        expect(actual).toEqual(expected);

        // One group per distinct known code, and a single group for all unknown codes.
        const knownCodes = new Set(notes.filter((n) => KNOWN.has(n.code)).map((n) => n.code));
        const hasUnknown = notes.some((n) => !KNOWN.has(n.code));
        expect(groups).toHaveLength(knownCodes.size + (hasUnknown ? 1 : 0));
        for (const code of knownCodes) {
          const mine = groups.filter((g) => g.group.code === code);
          expect(mine).toHaveLength(1);
          expect(mine[0]?.section).toBe(sectionOf(code));
          expect(mine[0]?.group.count).toBe(notes.filter((n) => n.code === code).length);
        }

        // Unknown codes: the "Other notes" section, each message verbatim.
        const other = model.sections.filter((s) => s.title === OTHER_TITLE);
        expect(other).toHaveLength(hasUnknown ? 1 : 0);
        if (hasUnknown) {
          const unknown = notes.filter((n) => !KNOWN.has(n.code)).map((n) => n.message);
          expect(other[0]?.groups.flatMap((g) => g.messages).sort()).toEqual([...unknown].sort());
        }

        // Sections are themed titles from the requirement, in its order, Other notes last, each at most once.
        const order = [...SECTIONS.map((s) => s.title), OTHER_TITLE];
        const titles = model.sections.map((s) => s.title);
        expect(new Set(titles).size).toBe(titles.length);
        expect(titles.map((t) => order.indexOf(t))).toEqual([...titles.map((t) => order.indexOf(t))].sort((a, b) => a - b));
        expect(titles.every((t) => order.includes(t))).toBe(true);
      }),
      cfg(),
    );
  });

  it('agrees with the exported section table', () => {
    expect(OTHER_NOTES_TITLE).toBe(OTHER_TITLE);
    expect(NOTE_SECTIONS.map((s) => ({ title: s.title, codes: s.codes.map(([c]) => c) }))).toEqual(SECTIONS);
  });
});
