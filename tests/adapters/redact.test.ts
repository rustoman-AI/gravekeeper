import { describe, expect, it } from 'vitest';
import { scrubSecrets } from '../../adapters/http/redact';

describe('scrubSecrets', () => {
  it('redacts every occurrence of a secret', () => {
    expect(scrubSecrets('a tok1 b tok1 c tok1', ['tok1'])).toBe(
      'a [redacted] b [redacted] c [redacted]',
    );
  });

  it('redacts several different secrets', () => {
    expect(scrubSecrets('x=one y=two', ['one', 'two'])).toBe('x=[redacted] y=[redacted]');
  });

  it('prefers the longest secret when secrets overlap by prefix', () => {
    expect(scrubSecrets('key abcdef end', ['abc', 'abcdef'])).toBe('key [redacted] end');
  });

  it('leaves no full secret in the output when secrets partially overlap', () => {
    const out = scrubSecrets('xxabcdefxx', ['abcd', 'cdef']);
    expect(out).not.toContain('abcd');
    expect(out).not.toContain('cdef');
    expect(out.startsWith('xx[redacted]')).toBe(true);
  });

  it('redacts the Bearer prefix together with the secret', () => {
    expect(scrubSecrets('Authorization: Bearer tok1', ['tok1'])).toBe('Authorization: [redacted]');
  });

  it.each(['bearer', 'BEARER', 'BeArEr'])('matches the %s prefix case-insensitively', (p) => {
    expect(scrubSecrets(`h: ${p} tok1!`, ['tok1'])).toBe('h: [redacted]!');
  });

  it('treats regular-expression metacharacters in a secret literally', () => {
    const secret = 'a.b*c+(d)[e]^$|\\';
    expect(scrubSecrets(`before ${secret} after`, [secret])).toBe('before [redacted] after');
    expect(scrubSecrets('axb', ['a.b'])).toBe('axb');
    expect(scrubSecrets('aaa', ['.*'])).toBe('aaa');
  });

  it('matches secrets exactly, case-sensitively', () => {
    expect(scrubSecrets('TOK1', ['tok1'])).toBe('TOK1');
  });

  it('returns the text unchanged when no secret is set', () => {
    expect(scrubSecrets('Bearer abc', [])).toBe('Bearer abc');
  });

  it('ignores empty secrets', () => {
    expect(scrubSecrets('Bearer abc', [''])).toBe('Bearer abc');
    expect(scrubSecrets('a tok1', ['', 'tok1'])).toBe('a [redacted]');
  });

  it('returns the text unchanged when no secret occurs', () => {
    expect(scrubSecrets('nothing here', ['tok1'])).toBe('nothing here');
  });
});
