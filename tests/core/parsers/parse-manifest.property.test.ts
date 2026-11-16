import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseManifest } from '../../../core';
import type { ManifestFormat } from '../../../core';
import { arbAnyCargoText, arbCargoText } from '../../support/arbitraries/cargo';
import { arbAnyPackageJsonText, arbValidText } from '../../support/arbitraries/package-json';
import { arbAnyRequirementsText } from '../../support/arbitraries/requirements';
import { arbNoise, arbPureNoise, TOKENS_BY_FORMAT } from '../../support/arbitraries/tokens';
import { cfg } from '../../support/fc-config';

const FORMATS: readonly ManifestFormat[] = ['package.json', 'requirements.txt', 'Cargo.toml'];
const arbFormat = fc.constantFrom(...FORMATS);

// Must match the prefix produced by internalErrorWarning in core/parsers/index.ts.
const INTERNAL_ERROR_PREFIX = 'Internal error while parsing';

const MAX_TEST_LENGTH = 20_000;

/** A token from any format repeated many times, to reach large sizes with hostile structure. */
const arbRepeatedTokens: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom(...FORMATS), fc.nat({ max: 5 }), fc.integer({ min: 1, max: 4000 }))
  .map(([format, index, times]) => {
    const tokens = TOKENS_BY_FORMAT[format];
    return tokens[index % tokens.length].repeat(times).slice(0, MAX_TEST_LENGTH);
  });

/** Text of any format; every format's text is also fed to the other two parsers. */
const arbAnyText: fc.Arbitrary<string> = fc.oneof(
  arbAnyPackageJsonText,
  arbAnyRequirementsText,
  arbAnyCargoText,
  arbValidText,
  arbCargoText,
  arbNoise('package.json'),
  arbNoise('requirements.txt'),
  arbNoise('Cargo.toml'),
  arbPureNoise,
  arbRepeatedTokens,
  fc.string({ maxLength: MAX_TEST_LENGTH }),
  fc.string({ unit: 'binary', maxLength: MAX_TEST_LENGTH }),
  fc.string({ unit: 'grapheme', maxLength: 2000 }),
);

const arbBoundedText = arbAnyText.map((t) => t.slice(0, MAX_TEST_LENGTH));

const arbNonString: fc.Arbitrary<unknown> = fc.oneof(
  fc.anything().filter((v) => typeof v !== 'string'),
  fc.constantFrom<unknown>(
    null,
    undefined,
    Number.NaN,
    [],
    {},
    () => 0,
    Symbol('x'),
    BigInt(10),
  ),
  fc.bigInt(),
  fc.double(),
  fc.boolean(),
);

describe('parseManifest cross-format properties', () => {
  // Feature: dependency-graveyard-core, Property 1: Parsers never throw on strings
  // Validates: Requirements 4.2
  it('Property 1: never throws on any string for any format and no warning starts with the internal-error prefix', () => {
    fc.assert(
      fc.property(arbBoundedText, arbFormat, (text, format) => {
        const result = parseManifest(text, format);
        expect(Array.isArray(result.dependencies)).toBe(true);
        expect(Array.isArray(result.warnings)).toBe(true);
        for (const w of result.warnings) {
          expect(typeof w).toBe('string');
          expect(w.startsWith(INTERNAL_ERROR_PREFIX)).toBe(false);
        }
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 2: Non-string input is rejected with one warning
  // Validates: Requirements 4.3
  it('Property 2: non-string input gives no dependencies and exactly one warning saying the input must be a string', () => {
    fc.assert(
      fc.property(arbNonString, arbFormat, (value, format) => {
        const result = parseManifest(value, format);
        expect(result.dependencies).toEqual([]);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toMatch(/must be a string/);
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 5: Parser determinism
  // Validates: Requirements 4.7
  it('Property 5: repeated calls on the same string and format return deeply equal results', () => {
    fc.assert(
      fc.property(arbBoundedText, arbFormat, (text, format) => {
        expect(parseManifest(text, format)).toEqual(parseManifest(text, format));
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 5: Parser determinism (non-string input)
  // Validates: Requirements 4.7, 4.3
  it('Property 5: repeated calls on the same non-string value return deeply equal results', () => {
    fc.assert(
      fc.property(arbNonString, arbFormat, (value, format) => {
        expect(parseManifest(value, format)).toEqual(parseManifest(value, format));
      }),
      cfg(),
    );
  });
});
