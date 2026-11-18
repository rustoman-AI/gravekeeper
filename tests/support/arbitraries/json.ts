import * as fc from 'fast-check';

// Requirement 13.10, 13.15: hostile response bodies for the mappers.

const HOSTILE_KEYS = ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty'] as const;

/** Object with an own property of the given name (JSON.parse keeps `__proto__` as an own key). */
const ownKeyObject = (key: string, value: unknown): unknown => {
  const holder: Record<string, unknown> = {};
  Object.defineProperty(holder, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
  return holder;
};

const arbHugeNumber: fc.Arbitrary<number> = fc.constantFrom(
  -0,
  0,
  1e308,
  -1e308,
  Number.MAX_VALUE,
  Number.MIN_VALUE,
  Number.MAX_SAFE_INTEGER,
  Number.MAX_SAFE_INTEGER + 2,
  Number.MIN_SAFE_INTEGER - 2,
  2 ** 53,
  2 ** 63,
  Infinity,
  -Infinity,
  NaN,
);

const arbNumericString: fc.Arbitrary<string> = fc.oneof(
  fc.integer().map(String),
  fc.double({ noNaN: false }).map(String),
  fc.constantFrom('0', '-0', '1e999', '0x10', ' 7 ', '', 'NaN', 'Infinity', '9007199254740993'),
);

const arbHostileKeyObject: fc.Arbitrary<unknown> = fc
  .tuple(fc.constantFrom(...HOSTILE_KEYS), fc.jsonValue())
  .map(([key, value]) => ownKeyObject(key, value));

/** Nested chain of arrays or objects, `depth` levels deep, ending in a leaf. */
const arbDeepNesting: fc.Arbitrary<unknown> = fc
  .tuple(fc.integer({ min: 20, max: 400 }), fc.boolean(), fc.jsonValue())
  .map(([depth, useArray, leaf]) => {
    let current: unknown = leaf;
    for (let i = 0; i < depth; i += 1) {
      current = useArray ? [current] : { a: current };
    }
    return current;
  });

/** Arrays where objects are expected, and objects where arrays are expected. */
const arbWrongContainer: fc.Arbitrary<unknown> = fc.oneof(
  fc.array(fc.jsonValue(), { maxLength: 4 }),
  fc.array(fc.array(fc.jsonValue(), { maxLength: 2 }), { maxLength: 3 }),
  fc.dictionary(fc.string({ maxLength: 4 }), fc.jsonValue(), { maxKeys: 3 }).map((o) => ({
    length: 1,
    ...o,
  })),
);

/** Object whose property read throws. */
const arbThrowingGetter: fc.Arbitrary<unknown> = fc
  .tuple(fc.string({ minLength: 1, maxLength: 6 }), fc.jsonValue(), fc.boolean())
  .map(([key, other, nested]) => {
    const target: Record<string, unknown> = { ok: other };
    Object.defineProperty(target, key, {
      enumerable: true,
      configurable: true,
      get() {
        throw new Error('hostile getter');
      },
    });
    return nested ? { data: target, items: [target] } : target;
  });

/**
 * Hostile JSON-like value. Includes values that JSON.stringify cannot carry
 * (throwing getters, NaN, Infinity), so use it only where totality is the property.
 */
export const arbJson: fc.Arbitrary<unknown> = fc.oneof(
  { arbitrary: fc.jsonValue(), weight: 4 },
  { arbitrary: fc.anything(), weight: 3 },
  { arbitrary: fc.anything({ withNullPrototype: true, withObjectString: true }), weight: 1 },
  { arbitrary: arbHostileKeyObject, weight: 2 },
  { arbitrary: arbDeepNesting, weight: 1 },
  { arbitrary: arbHugeNumber, weight: 2 },
  { arbitrary: arbNumericString, weight: 2 },
  { arbitrary: arbWrongContainer, weight: 2 },
  { arbitrary: arbThrowingGetter, weight: 1 },
);
