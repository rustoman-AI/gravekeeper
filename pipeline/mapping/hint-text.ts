import { HINT_TEXT_MAX_LENGTH } from '../constants';

/**
 * Hint text normalizer (resurrect spec, Requirements 1.1 to 1.6 and 1.8).
 *
 * Single linear pass over code points, no regular expressions, never throws.
 *  - Req 1.1: a non-string gives null.
 *  - Req 1.2: C0/C1 controls, bidirectional controls, U+2028/U+2029 and lone
 *    surrogates become spaces.
 *  - Req 1.3: whitespace runs collapse to one space; the result is trimmed.
 *  - Req 1.4: an empty result gives null.
 *  - Req 1.5: text over HINT_TEXT_MAX_LENGTH code points is cut to the bound
 *    minus one code point, trailing spaces trimmed, then `…` appended.
 *  - Req 1.6: Markdown, HTML and URLs stay as literal characters.
 *  - Req 1.8: counting and cutting are by code points, never UTF-16 units.
 */

const ELLIPSIS = '\u2026';

/** Unicode White_Space code points (not already covered by the controls rule). */
const isWhitespace = (cp: number): boolean =>
  cp === 0x20 ||
  cp === 0xa0 ||
  cp === 0x1680 ||
  (cp >= 0x2000 && cp <= 0x200a) ||
  cp === 0x202f ||
  cp === 0x205f ||
  cp === 0x3000;

/** Characters replaced by a space (Requirement 1.2). */
const isRemoved = (cp: number): boolean =>
  cp <= 0x1f ||
  (cp >= 0x7f && cp <= 0x9f) ||
  cp === 0x2028 ||
  cp === 0x2029 ||
  (cp >= 0x202a && cp <= 0x202e) ||
  (cp >= 0x2066 && cp <= 0x2069) ||
  cp === 0x200e ||
  cp === 0x200f ||
  (cp >= 0xd800 && cp <= 0xdfff);

export function normalizeHintText(value: unknown): string | null {
  try {
    if (typeof value !== 'string') return null;
    // Iterating a string yields code points; a lone surrogate comes out alone.
    const kept: string[] = [];
    let pendingSpace = false;
    for (const ch of value) {
      const cp = ch.codePointAt(0) ?? 0;
      if (isRemoved(cp) || isWhitespace(cp)) {
        pendingSpace = kept.length > 0;
        continue;
      }
      if (pendingSpace) {
        kept.push(' ');
        pendingSpace = false;
      }
      kept.push(ch);
    }
    if (kept.length === 0) return null;
    if (kept.length <= HINT_TEXT_MAX_LENGTH) return kept.join('');
    const cut = kept.slice(0, HINT_TEXT_MAX_LENGTH - 1);
    while (cut.length > 0 && cut[cut.length - 1] === ' ') cut.pop();
    return cut.join('') + ELLIPSIS;
  } catch {
    return null;
  }
}
