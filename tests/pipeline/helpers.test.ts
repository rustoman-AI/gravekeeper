import { describe, expect, it } from 'vitest';
import { compareCodePoints as coreCompare } from '../../core/internal/compare';
import { guard as coreGuard } from '../../core/internal/safe';
import { compareCodePoints } from '../../pipeline/mapping/compare-code-points';
import { readOwn } from '../../pipeline/mapping/read-own';
import { err, ok } from '../../pipeline/mapping/result';
import * as internalResult from '../../pipeline/internal/result';
import { guard } from '../../pipeline/internal/safe';

const sign = (n: number): number => Math.sign(n);

describe('compareCodePoints', () => {
  // Requirement 5.1, 16.2
  const pairs: Array<[string, string]> = [
    ['\u{1F600}', '\uFF5E'],
    ['\uFF5E', '\u{1F600}'],
    ['10', '2'],
    ['2', '10'],
    ['', ''],
    ['', 'a'],
    ['a', ''],
    ['abc', 'abd'],
    ['ab', 'abc'],
    ['\u{10000}', '\u{10000}'],
    ['\u{10000}a', '\u{10000}b'],
    ['\uD800', '\u{10000}'],
  ];

  it('matches core/internal/compare on shared examples', () => {
    for (const [a, b] of pairs) {
      expect(sign(compareCodePoints(a, b))).toBe(sign(coreCompare(a, b)));
    }
  });

  it('orders an astral code point after a high BMP code point', () => {
    expect(compareCodePoints('\u{1F600}', '\uFF5E')).toBeGreaterThan(0);
    expect(compareCodePoints('\uFF5E', '\u{1F600}')).toBeLessThan(0);
  });

  it('orders "10" before "2"', () => {
    expect(compareCodePoints('10', '2')).toBeLessThan(0);
  });

  it('returns 0 for equal strings', () => {
    expect(compareCodePoints('same', 'same')).toBe(0);
  });
});

describe('readOwn', () => {
  // Requirement 13.2, 13.10
  it('reads own properties', () => {
    expect(readOwn({ a: 1 }, 'a')).toBe(1);
    expect(readOwn(['x', 'y'], '1')).toBe('y');
  });

  it('returns undefined for a throwing getter', () => {
    const o = {
      get boom(): number {
        throw new Error('x');
      },
    };
    expect(readOwn(o, 'boom')).toBeUndefined();
  });

  it('returns undefined for throwing proxies', () => {
    const p = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new Error('trap');
        },
        get() {
          throw new Error('trap');
        },
        has() {
          throw new Error('trap');
        },
      },
    );
    expect(readOwn(p, 'a')).toBeUndefined();
    const q = new Proxy({ a: 1 }, {
      get() {
        throw new Error('trap');
      },
    });
    expect(readOwn(q, 'a')).toBeUndefined();
  });

  it('returns undefined when only the descriptor trap throws', () => {
    const p = new Proxy({ a: 1 }, {
      getOwnPropertyDescriptor() {
        throw new Error('trap');
      },
    });
    expect(readOwn(p, 'a')).toBeUndefined();
  });

  it('reads own properties of functions', () => {
    const f = Object.assign(() => 0, { tag: 'x' });
    expect(readOwn(f, 'tag')).toBe('x');
  });

  it('reads an own __proto__ key but not the inherited accessor', () => {
    expect(readOwn({}, '__proto__')).toBeUndefined();
    const own = JSON.parse('{"__proto__": 5}') as unknown;
    expect(readOwn(own, '__proto__')).toBe(5);
  });

  it('ignores inherited keys', () => {
    expect(readOwn({}, 'toString')).toBeUndefined();
    expect(readOwn(Object.create({ a: 1 }), 'a')).toBeUndefined();
  });

  it('returns undefined for arrays with non-index keys, primitives, null, undefined', () => {
    expect(readOwn([1], 'length')).toBe(1);
    expect(readOwn([1], 'map')).toBeUndefined();
    expect(readOwn('abc', 'length')).toBeUndefined();
    expect(readOwn(5, 'a')).toBeUndefined();
    expect(readOwn(true, 'a')).toBeUndefined();
    expect(readOwn(null, 'a')).toBeUndefined();
    expect(readOwn(undefined, 'a')).toBeUndefined();
  });
});

describe('guard', () => {
  // Requirement 16.2
  it('returns the run value when nothing throws', () => {
    expect(guard(() => 1, () => 2)).toBe(1);
  });

  it('returns the fallback for a thrown Error, string and undefined', () => {
    const seen: unknown[] = [];
    const fb = (e: unknown): string => {
      seen.push(e);
      return 'fallback';
    };
    const error = new Error('x');
    expect(guard(() => { throw error; }, fb)).toBe('fallback');
    expect(guard(() => { throw 'str'; }, fb)).toBe('fallback');
    expect(guard(() => { throw undefined; }, fb)).toBe('fallback');
    expect(seen).toEqual([error, 'str', undefined]);
  });

  it('matches core/internal/safe', () => {
    const run = (): number => { throw new Error('x'); };
    expect(guard(run, () => 7)).toBe(coreGuard(run, () => 7));
  });
});

describe('Result', () => {
  // Requirement 13.1
  it('builds ok and err values', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    expect(err('e')).toEqual({ ok: false, error: 'e' });
  });

  it('is re-exported unchanged by pipeline/internal/result', () => {
    expect(internalResult.ok).toBe(ok);
    expect(internalResult.err).toBe(err);
  });
});
