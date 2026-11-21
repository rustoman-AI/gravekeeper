// Feature: resurrect, Property RS-P9: Client narrowing of hints is total, valid and idempotent
// Validates: Requirements 4.7, 4.8
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { HINT_TEXT_MAX_LENGTH, HINTS_MAX_PER_PACKAGE } from '../../../pipeline/constants';
import { narrowHints } from '../../../view-model/narrow';
import { advisoryLink } from '../../../view-model/urls';
import { cfg } from '../../support/fc-config';

// Independent oracle for the characters normalizeHintText removes.
function forbidden(cp: number): boolean {
  return (
    cp < 0x20 ||
    (cp >= 0x7f && cp <= 0x9f) ||
    cp === 0x2028 ||
    cp === 0x2029 ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2066 && cp <= 0x2069) ||
    cp === 0x200e ||
    cp === 0x200f ||
    (cp >= 0xd800 && cp <= 0xdfff)
  );
}

function textIsValid(text: unknown): boolean {
  if (typeof text !== 'string') return false;
  const points = Array.from(text);
  return points.length >= 1 && points.length <= HINT_TEXT_MAX_LENGTH && points.every((c) => !forbidden(c.codePointAt(0)!));
}

const BAD_CHARS = ['\n', '\t', '\u0000', '\u007f', '\u0085', '\u2028', '\u202e', '\u2066', '\u200e', '\u200f', '\ud800'];

const arbGoodText = fc.string({ minLength: 1, maxLength: 40, unit: 'grapheme-ascii' }).filter(textIsValid);
const arbText: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 5, arbitrary: arbGoodText },
  fc.constant(''),
  fc.constant('a'.repeat(HINT_TEXT_MAX_LENGTH)),
  fc.constant('a'.repeat(HINT_TEXT_MAX_LENGTH + 1)),
  fc.constant('😀'.repeat(HINT_TEXT_MAX_LENGTH)),
  fc.tuple(arbGoodText, fc.constantFrom(...BAD_CHARS)).map(([t, c]) => t + c + t),
  fc.anything(),
);
const arbKind: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom('deprecation-notice', 'advisory-notice') },
  fc.string({ maxLength: 12 }),
  fc.anything(),
);
const arbUrl: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom(
    'https://osv.dev/vulnerability/GHSA-abcd-efgh-ijkl',
    'https://github.com/advisories/GHSA-abcd-efgh-ijkl',
    'javascript:alert(1)',
    'http://osv.dev/x',
    '',
  ),
  fc.string({ maxLength: 20 }),
  fc.constant(null),
  fc.constant(undefined),
  fc.anything(),
);

const arbHint: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 4, arbitrary: fc.record({ kind: arbKind, text: arbText, sourceUrl: arbUrl }) },
  fc.record({ kind: arbKind, text: arbText, sourceUrl: arbUrl, link: fc.anything(), extra: fc.anything() }),
  fc.record({ kind: arbKind }, { requiredKeys: [] }),
  fc.anything(),
);
const arbHintArray = fc.array(arbHint, { maxLength: 8 });

function expectedOf(input: readonly unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const e of input) {
    if (typeof e !== 'object' || e === null || Array.isArray(e)) continue;
    const r = e as Record<string, unknown>;
    if (r['kind'] !== 'deprecation-notice' && r['kind'] !== 'advisory-notice') continue;
    if (!textIsValid(r['text'])) continue;
    out.push(e);
  }
  return out.slice(0, HINTS_MAX_PER_PACKAGE);
}

function checkValid(out: ReturnType<typeof narrowHints>): void {
  expect(out.length).toBeLessThanOrEqual(HINTS_MAX_PER_PACKAGE);
  for (const h of out) {
    expect(['deprecation-notice', 'advisory-notice']).toContain(h.kind);
    expect(textIsValid(h.text)).toBe(true);
    expect(h.sourceUrl).toBe(advisoryLink(h.sourceUrl));
    if (h.link !== null) {
      expect(h.kind).toBe('advisory-notice');
      expect(h.sourceUrl).not.toBeNull();
      expect(h.link.href).toBe(h.sourceUrl);
      expect(advisoryLink(h.link.href)).toBe(h.link.href);
    }
  }
}

describe('RS-P9 narrowHints', () => {
  it('RS-P9 is total and gives [] for any non-array', () => {
    fc.assert(
      fc.property(fc.anything(), (v) => {
        const out = narrowHints(v);
        if (!Array.isArray(v)) expect(out).toEqual([]);
        checkValid(out);
      }),
      cfg(),
    );
  });

  it('RS-P9 returns only valid hints, at most the cap, in the order of the valid inputs', () => {
    fc.assert(
      fc.property(arbHintArray, (input) => {
        const out = narrowHints(input);
        checkValid(out);
        const expected = expectedOf(input) as Record<string, unknown>[];
        expect(out.map((h) => [h.kind, h.text])).toEqual(expected.map((e) => [e['kind'], e['text']]));
      }),
      cfg(),
    );
  });

  it('RS-P9 is idempotent on its own output', () => {
    fc.assert(
      fc.property(fc.oneof(arbHintArray, fc.anything()), (input) => {
        const once = narrowHints(input);
        expect(narrowHints(once)).toEqual(once);
      }),
      cfg(),
    );
  });
});
