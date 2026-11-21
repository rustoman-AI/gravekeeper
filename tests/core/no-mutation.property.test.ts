import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { classify, parseManifest, serializeManifest, summarize } from '../../core';
import type { ManifestFormat } from '../../core';
import { arbAssessedList } from '../support/arbitraries/assessed';
import { arbAnyCargoText } from '../support/arbitraries/cargo';
import { arbDependencyList } from '../support/arbitraries/dependencies';
import { arbRawFacts, arbValidFacts } from '../support/arbitraries/facts';
import { arbAnyPackageJsonText } from '../support/arbitraries/package-json';
import { arbAnyRequirementsText } from '../support/arbitraries/requirements';
import { cfg } from '../support/fc-config';

/** Structural deep copy of plain data (arrays, plain objects, primitives). Functions and symbols are kept by reference. */
function deepCopy<T>(v: T): T {
  if (Array.isArray(v)) return v.map(deepCopy) as unknown as T;
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v)) {
      Object.defineProperty(out, k, {
        value: deepCopy((v as Record<string, unknown>)[k]),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return out as T;
  }
  return v;
}

function deepFreeze<T>(v: T): T {
  if (v !== null && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}

/** Runs `call` on the input, on a frozen copy, and checks the input is unchanged and both results agree. */
function checkNoMutation<I, R>(input: I, call: (i: I) => R): void {
  const before = deepCopy(input);
  const plain = call(input);
  expect(input).toEqual(before);
  const frozen = deepFreeze(deepCopy(input));
  const second = call(frozen);
  expect(frozen).toEqual(before);
  expect(second).toEqual(plain);
}

// pyproject.toml has no writer and its parser is covered by the pyproject spec; the three original formats keep their coverage here.
type CoreFormat = Exclude<ManifestFormat, 'pyproject.toml'>;
const FORMATS: readonly CoreFormat[] = ['package.json', 'requirements.txt', 'Cargo.toml'];
const TEXT_ARB: Readonly<Record<CoreFormat, fc.Arbitrary<string>>> = {
  'package.json': arbAnyPackageJsonText,
  'requirements.txt': arbAnyRequirementsText,
  'Cargo.toml': arbAnyCargoText,
};

describe('no-mutation properties', () => {
  // Feature: dependency-graveyard-core, Property 43: Core functions do not mutate their inputs
  // **Validates: Requirements 13.7, 13.3**
  it('Property 43: parseManifest does not mutate its inputs', () => {
    fc.assert(
      fc.property(fc.constantFrom(...FORMATS).chain((f) => fc.tuple(fc.constant(f), TEXT_ARB[f])), ([format, text]) => {
        checkNoMutation({ text, format }, (i) => parseManifest(i.text, i.format));
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 43: Core functions do not mutate their inputs
  // **Validates: Requirements 13.7, 13.3**
  it('Property 43: serializeManifest does not mutate its inputs', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...FORMATS).chain((f) => fc.tuple(arbDependencyList(f), fc.constant(f))),
        ([list, format]) => {
          checkNoMutation(list, (l) => serializeManifest(l, format));
        },
      ),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 43: Core functions do not mutate their inputs
  // **Validates: Requirements 13.7, 13.3**
  it('Property 43: classify does not mutate its input', () => {
    fc.assert(
      fc.property(fc.oneof(arbRawFacts, arbValidFacts, fc.anything()), (facts) => {
        checkNoMutation(facts as unknown, (f) => classify(f));
      }),
      cfg(),
    );
  });

  // Feature: dependency-graveyard-core, Property 43: Core functions do not mutate their inputs
  // **Validates: Requirements 13.7, 13.3**
  it('Property 43: summarize does not mutate its input', () => {
    fc.assert(
      fc.property(arbAssessedList, (list) => {
        checkNoMutation(list, (l) => summarize(l));
      }),
      cfg(),
    );
  });
});
