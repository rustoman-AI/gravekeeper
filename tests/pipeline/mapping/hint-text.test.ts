import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HINT_TEXT_MAX_LENGTH } from '../../../pipeline/constants';
import { normalizeHintText } from '../../../pipeline/mapping/hint-text';

const len = (s: string): number => Array.from(s).length;

const bincodeDetails = (): string => {
  const file = join(
    process.cwd(),
    'tests/fixtures/ajeetdsouza__zoxide/responses/osv/20337835edeedab6.json',
  );
  const recorded = JSON.parse(readFileSync(file, 'utf8')) as { response: { bodyText: string } };
  const body = JSON.parse(recorded.response.bodyText) as { id: string; details: string };
  expect(body.id).toBe('RUSTSEC-2025-0141');
  return body.details;
};

describe('normalizeHintText', () => {
  it('turns the recorded bincode details into one line and keeps Markdown characters', () => {
    const details = bincodeDetails();
    expect(details).toContain('\n');
    const out = normalizeHintText(details);
    expect(out).not.toBeNull();
    expect(out).not.toMatch(/[\n\r\t]/);
    expect(out).toContain('## Alternatives to consider');
    expect(out).toContain('* [wincode](https://crates.io/crates/wincode)');
    expect(len(out as string)).toBeLessThanOrEqual(HINT_TEXT_MAX_LENGTH);
  });

  it('gives exactly the bound when the cut falls on a non-space', () => {
    const out = normalizeHintText('a'.repeat(HINT_TEXT_MAX_LENGTH + 50)) as string;
    expect(len(out)).toBe(HINT_TEXT_MAX_LENGTH);
    expect(out.endsWith('\u2026')).toBe(true);
  });

  it('gives at most the bound when a space falls at the cut', () => {
    const input = `${'a'.repeat(HINT_TEXT_MAX_LENGTH - 2)} ${'b'.repeat(50)}`;
    const out = normalizeHintText(input) as string;
    expect(len(out)).toBeLessThanOrEqual(HINT_TEXT_MAX_LENGTH);
    expect(out.endsWith(' \u2026')).toBe(false);
    expect(out.endsWith('\u2026')).toBe(true);
  });

  it('adds no ellipsis to a 599 and a 600 code point input', () => {
    expect(normalizeHintText('a'.repeat(599))).toBe('a'.repeat(599));
    expect(normalizeHintText('a'.repeat(600))).toBe('a'.repeat(600));
  });

  it('counts an astral character as one code point', () => {
    const emoji = '\u{1F480}';
    expect(normalizeHintText(emoji.repeat(600))).toBe(emoji.repeat(600));
    const out = normalizeHintText(emoji.repeat(601)) as string;
    expect(len(out)).toBe(600);
    expect(Array.from(out).slice(0, 599).join('')).toBe(emoji.repeat(599));
    expect(out.endsWith('\u2026')).toBe(true);
  });

  it('removes bidirectional controls, NUL, line separators and tabs', () => {
    expect(normalizeHintText('a\u202eb\u0000c\u2028d\te')).toBe('a b c d e');
    expect(normalizeHintText('x\u202e')).toBe('x');
  });

  it('turns a lone surrogate into a space', () => {
    expect(normalizeHintText('a\ud800b')).toBe('a b');
  });

  it('keeps HTML and javascript: strings as characters', () => {
    expect(normalizeHintText('<a href="x">y</a>')).toBe('<a href="x">y</a>');
    expect(normalizeHintText('javascript:alert(1)')).toBe('javascript:alert(1)');
  });

  it('gives null for non-strings, the empty string and whitespace', () => {
    for (const v of [undefined, null, 1, true, {}, [], ['a'], Symbol('s')]) {
      expect(normalizeHintText(v)).toBeNull();
    }
    expect(normalizeHintText('')).toBeNull();
    expect(normalizeHintText(' \t\n\u2028\u00a0 ')).toBeNull();
  });

  it('has arity 1 (Requirement 1.9)', () => {
    expect(normalizeHintText.length).toBe(1);
  });
});
