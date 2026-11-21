// Feature: resurrect-upgrade, Property RU-P2: Hint combination prefers the version notice and stays bounded
// Validates: Requirements 2.1, 2.2, 2.4, 2.5
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { HINTS_MAX_PER_PACKAGE } from '../../../pipeline/constants';
import { normalizeHintText } from '../../../pipeline/mapping/hint-text';
import { combineNpmHints, npmDeprecationHint } from '../../../pipeline/mapping/hints';
import { cfg } from '../../support/fc-config';

/** A value whose every access throws. */
const hostileProxy = (): unknown =>
  new Proxy(
    {},
    {
      get() {
        throw new Error('get');
      },
      has() {
        throw new Error('has');
      },
      ownKeys() {
        throw new Error('ownKeys');
      },
      getOwnPropertyDescriptor() {
        throw new Error('gopd');
      },
      getPrototypeOf() {
        throw new Error('gpo');
      },
    },
  );

const throwingDeprecated = (): unknown => {
  const o: Record<string, unknown> = {};
  Object.defineProperty(o, 'deprecated', {
    enumerable: true,
    get() {
      throw new Error('getter deprecated');
    },
  });
  return o;
};

const anyText = fc.oneof(
  fc.string({ unit: 'binary', maxLength: 20 }),
  fc.constantFrom('', ' ', '\t\n', '\u202e', '\u0000', 'Please upgrade to version 7 or higher.', '<a href="x">y</a>'),
  fc.integer({ min: 590, max: 700 }).map((n) => 'ab '.repeat(n)),
  fc.integer({ min: 590, max: 700 }).map((n) => '\u{1F480}'.repeat(n)),
);

const nonStringValue = fc.oneof(
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.constant(undefined),
  fc.array(fc.string(), { maxLength: 3 }),
  fc.constant({ toString: () => 'x' }),
);

/** Thunks: hostile values are built only inside the property, never during generation. */
const body: fc.Arbitrary<() => unknown> = fc.oneof(
  { weight: 5, arbitrary: anyText.map((t) => () => ({ deprecated: t })) },
  { weight: 2, arbitrary: nonStringValue.map((v) => () => ({ deprecated: v })) },
  { weight: 1, arbitrary: anyText.map((t) => () => ({ version: '1.0.0', name: t })) },
  { weight: 1, arbitrary: fc.array(anyText, { maxLength: 3 }).map((a) => () => a) },
  { weight: 1, arbitrary: anyText.map((t) => () => t) },
  { weight: 1, arbitrary: nonStringValue.map((v) => () => v) },
  { weight: 1, arbitrary: fc.constant(() => undefined) },
  {
    weight: 2,
    arbitrary: fc.constantFrom<() => unknown>(
      () => throwingDeprecated(),
      () => hostileProxy(),
      () => Object.create({ deprecated: 'inherited' }) as unknown,
    ),
  },
);

/** The normalized `deprecated` text of a body, read independently of the code under test. */
const ownDeprecated = (b: unknown): string | null => {
  try {
    if (b === null || typeof b !== 'object' || Array.isArray(b)) return null;
    const d = Object.getOwnPropertyDescriptor(b, 'deprecated');
    return d !== undefined && 'value' in d ? normalizeHintText(d.value) : null;
  } catch {
    return null;
  }
};

describe('RU-P2 hint combination prefers the version notice and stays bounded', () => {
  it('RU-P2 never throws and returns at most one deprecation-notice with no source URL', () => {
    fc.assert(
      fc.property(body, body, (mv, ml) => {
        const out = combineNpmHints(mv(), ml());
        return (
          Array.isArray(out) &&
          out.length <= 1 &&
          out.length <= HINTS_MAX_PER_PACKAGE &&
          out.every((h) => h.kind === 'deprecation-notice' && h.sourceUrl === null)
        );
      }),
      cfg(),
    );
  });

  it('RU-P2 returns the version body notice when its normalized text is non-null', () => {
    fc.assert(
      fc.property(body, body, (mv, ml) => {
        const v = mv();
        const text = ownDeprecated(v);
        fc.pre(text !== null);
        const out = combineNpmHints(v, ml());
        return out.length === 1 && out[0]?.text === text && out[0]?.sourceUrl === null;
      }),
      cfg(),
    );
  });

  it('RU-P2 otherwise returns exactly what npmDeprecationHint gives for the /latest body', () => {
    fc.assert(
      fc.property(body, body, (mv, ml) => {
        const v = mv();
        fc.pre(ownDeprecated(v) === null);
        const l = ml();
        expect(combineNpmHints(v, l)).toEqual(npmDeprecationHint(l));
        return true;
      }),
      cfg(),
    );
  });
});
