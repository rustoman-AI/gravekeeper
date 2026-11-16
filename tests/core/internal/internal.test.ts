import { describe, expect, it } from 'vitest';
import { compareCodePoints } from '../../../core/internal/compare';
import { canonicalKey } from '../../../core/internal/deep-equal-key';
import { guard } from '../../../core/internal/safe';

describe('compareCodePoints', () => {
  it('orders an astral code point after a BMP code point above surrogates (U+1F600 after U+FF5E)', () => {
    expect(compareCodePoints('\u{1F600}', '\uFF5E')).toBeGreaterThan(0);
    expect(compareCodePoints('\uFF5E', '\u{1F600}')).toBeLessThan(0);
    expect(['\u{1F600}', '\uFF5E'].sort(compareCodePoints)).toEqual(['\uFF5E', '\u{1F600}']);
  });

  it('compares "10" before "2" (not numeric)', () => {
    expect(compareCodePoints('10', '2')).toBeLessThan(0);
  });

  it('handles equality and prefixes', () => {
    expect(compareCodePoints('a', 'a')).toBe(0);
    expect(compareCodePoints('a', 'ab')).toBeLessThan(0);
    expect(compareCodePoints('ab', 'a')).toBeGreaterThan(0);
  });
});

describe('guard', () => {
  it('returns run result when nothing throws', () => {
    expect(guard(() => 1, () => 2)).toBe(1);
  });

  it.each([
    ['Error', new Error('boom')],
    ['string', 'boom'],
    ['undefined', undefined],
  ])('returns the fallback when a %s is thrown', (_name, thrown) => {
    let seen: unknown = 'unset';
    const result = guard(
      () => {
        throw thrown;
      },
      (e) => {
        seen = e;
        return 'fallback';
      },
    );
    expect(result).toBe('fallback');
    expect(seen).toBe(thrown);
  });
});

describe('canonicalKey', () => {
  it('is stable for equal values and independent of key insertion order', () => {
    const a = { kind: 'x', reason: { text: 't', n: 1 }, list: [1, 2] };
    const b = { list: [1, 2], reason: { n: 1, text: 't' }, kind: 'x' };
    expect(canonicalKey(a)).toBe(canonicalKey(b));
    expect(canonicalKey(a)).toBe(canonicalKey(a));
  });

  it('differs for different Reason text', () => {
    expect(canonicalKey({ reason: { text: 'one' } })).not.toBe(canonicalKey({ reason: { text: 'two' } }));
  });

  it('keeps array order significant', () => {
    expect(canonicalKey([1, 2])).not.toBe(canonicalKey([2, 1]));
  });
});
