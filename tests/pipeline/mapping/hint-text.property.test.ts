// Feature: resurrect, Property RS-P6: Hint text is bounded, plain and stable
// Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { HINT_TEXT_MAX_LENGTH } from '../../../pipeline/constants';
import { normalizeHintText } from '../../../pipeline/mapping/hint-text';
import { cfg } from '../../support/fc-config';

const MAX = 600;
const ELLIPSIS = '\u2026';

/** Oracle: code points that must turn into a space (controls, bidi, separators, lone surrogates, White_Space). */
const isSeparator = (ch: string): boolean => {
  const cp = ch.codePointAt(0) as number;
  return (
    cp <= 0x20 ||
    (cp >= 0x7f && cp <= 0xa0) ||
    cp === 0x1680 ||
    (cp >= 0x2000 && cp <= 0x200a) ||
    cp === 0x200e ||
    cp === 0x200f ||
    (cp >= 0x2028 && cp <= 0x202f) ||
    cp === 0x205f ||
    (cp >= 0x2066 && cp <= 0x2069) ||
    cp === 0x3000 ||
    (cp >= 0xd800 && cp <= 0xdfff)
  );
};

/** Oracle: independent normalization using split/join over Array.from code points. */
const oracleFull = (input: string): string =>
  Array.from(input)
    .map((ch) => (isSeparator(ch) ? ' ' : ch))
    .join('')
    .split(' ')
    .filter((w) => w.length > 0)
    .join(' ');

const oracle = (input: string): string | null => {
  const full = oracleFull(input);
  if (full === '') return null;
  const cps = Array.from(full);
  if (cps.length <= MAX) return full;
  return cps.slice(0, MAX - 1).join('').replace(/ +$/, '') + ELLIPSIS;
};

const piece: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: fc.string({ unit: 'binary', maxLength: 12 }) },
  { weight: 3, arbitrary: fc.string({ unit: 'grapheme', maxLength: 8 }) },
  { weight: 3, arbitrary: fc.constantFrom(' ', '  ', '\t', '\n', '\r\n', '\u00a0', '\u2003', '\u3000', '\u2028', '\u2029', '\u0085') },
  { weight: 3, arbitrary: fc.constantFrom('\u0000', '\u0007', '\u001b', '\u007f', '\u009f', '\u202a', '\u202e', '\u2066', '\u2069', '\u200e', '\u200f') },
  { weight: 2, arbitrary: fc.constantFrom('\ud800', '\udbff', '\udc00', '\udfff', '\ud83d', '\ude00') },
  { weight: 2, arbitrary: fc.constantFrom('\u{1F480}', '\u{1F600}', '\ufeff', '\u200b', '\u2026', '\u180e') },
  {
    weight: 2,
    arbitrary: fc.constantFrom(
      'https://example.com/a?b=c#d',
      '[link](https://x.y)',
      '**bold** `code` # head',
      '<a href="x">y</a>',
      'javascript:alert(1)',
    ),
  },
);

const shortText = fc.array(piece, { maxLength: 12 }).map((a) => a.join(''));
/** Long inputs straddle the bound: 590..620 non-space code points plus spaces at assorted places. */
const longText = fc
  .tuple(
    fc.integer({ min: 560, max: 640 }),
    fc.array(fc.integer({ min: 0, max: 640 }), { maxLength: 6 }),
    fc.constantFrom('a', '\u{1F480}', 'é'),
    fc.constantFrom(' ', '\n', '\u00a0', '\u202e'),
  )
  .map(([n, at, ch, sep]) => {
    const cps: string[] = Array.from({ length: n }, () => ch as string);
    for (const i of at) if (i < n) cps[i] = sep;
    return cps.join('');
  });
const stringArb = fc.oneof({ weight: 5, arbitrary: shortText }, { weight: 2, arbitrary: longText });

const nonString = fc.oneof(
  fc.integer(),
  fc.double(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.bigInt(),
  fc.array(fc.string()),
  fc.object(),
  fc.constant(Symbol('s')),
  fc.constant(() => 'x'),
);

const BAD = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069\u200e\u200f]/u;

describe('RS-P6 hint text is bounded, plain and stable', () => {
  it('RS-P6 constant matches the bound used by the oracle', () => {
    expect(HINT_TEXT_MAX_LENGTH).toBe(MAX);
  });

  it('RS-P6 non-string values give null', () => {
    fc.assert(
      fc.property(nonString, (v) => normalizeHintText(v) === null),
      cfg(),
    );
  });

  it('RS-P6 strings match the independent oracle', () => {
    fc.assert(
      fc.property(stringArb, (s) => normalizeHintText(s) === oracle(s)),
      cfg(),
    );
  });

  it('RS-P6 result is trimmed, bounded, plain and single-spaced', () => {
    fc.assert(
      fc.property(stringArb, (s) => {
        const r = normalizeHintText(s);
        if (r === null) return oracleFull(s) === '';
        const cps = Array.from(r);
        const lone = cps.some((c) => {
          const cp = c.codePointAt(0) as number;
          return cp >= 0xd800 && cp <= 0xdfff;
        });
        return (
          r.length > 0 &&
          !r.startsWith(' ') &&
          !r.endsWith(' ') &&
          cps.length <= MAX &&
          !BAD.test(r) &&
          !lone &&
          !r.includes('  ') &&
          // ellipsis only when the normalized input was longer than the bound
          (Array.from(oracleFull(s)).length > MAX ? r.endsWith(ELLIPSIS) : r === oracleFull(s))
        );
      }),
      cfg(),
    );
  });

  it('RS-P6 normalizing twice equals normalizing once', () => {
    fc.assert(
      fc.property(stringArb, (s) => {
        const once = normalizeHintText(s);
        return once === null || normalizeHintText(once) === once;
      }),
      cfg(),
    );
  });

  it('RS-P6 Markdown, HTML and URL characters stay literal', () => {
    const literal = fc.constantFrom(
      'https://example.com/a?b=c#d',
      '[link](https://x.y)',
      '**bold** `code`',
      '<a href="x">y</a>',
      'javascript:alert(1)',
    );
    fc.assert(
      fc.property(literal, (s) => normalizeHintText(s) === s),
      cfg(),
    );
  });
});
