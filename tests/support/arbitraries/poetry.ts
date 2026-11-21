// Poetry constraint arbitraries (pyproject spec, design: The Poetry reference). Terms are generated as structured
// values (`PoetryTerm`), then rendered to text. Parts are in 0..5 so that boundaries are hit often.
import * as fc from 'fast-check';
import type { ComparisonOperator, Parts, PoetryTerm } from '../oracles/poetry-reference';

export type TermSeparator = ',' | ' ' | ', ';

export interface PoetryConstraintModel {
  readonly terms: readonly PoetryTerm[];
  readonly separator: TermSeparator;
}

const MAX_PART = 5;

function arbParts(minLength: number, maxLength: number): fc.Arbitrary<Parts> {
  return fc.array(fc.integer({ min: 0, max: MAX_PART }), { minLength, maxLength });
}

const COMPARISON_OPERATORS: readonly ComparisonOperator[] = ['>=', '>', '<=', '<', '==', '!='];

/** A term of every kind, with the lengths the translator allows (requirement 6). */
export const arbPoetryTerm: fc.Arbitrary<PoetryTerm> = fc.oneof(
  arbParts(1, 3).map((parts): PoetryTerm => ({ kind: 'caret', parts })),
  arbParts(1, 3).map((parts): PoetryTerm => ({ kind: 'tilde', parts })),
  fc
    .tuple(arbParts(1, 3), fc.boolean())
    .map(([parts, negated]): PoetryTerm => ({ kind: 'wildcard', parts, negated })),
  arbParts(1, 4).map((parts): PoetryTerm => ({ kind: 'bare', parts })),
  fc
    .tuple(fc.constantFrom(...COMPARISON_OPERATORS), arbParts(1, 4))
    .map(([op, parts]): PoetryTerm => ({ kind: 'comparison', op, parts })),
  arbParts(2, 4).map((parts): PoetryTerm => ({ kind: 'compatible', parts })),
);

export const arbTermSeparator: fc.Arbitrary<TermSeparator> = fc.constantFrom<TermSeparator>(',', ' ', ', ');

/** One to four terms joined by a comma, a space, or a comma and a space. */
export const arbPoetryConstraint: fc.Arbitrary<PoetryConstraintModel> = fc.record({
  terms: fc.array(arbPoetryTerm, { minLength: 1, maxLength: 4 }),
  separator: arbTermSeparator,
});

export function renderParts(parts: Parts): string {
  return parts.join('.');
}

export function renderPoetryTerm(term: PoetryTerm): string {
  const v = renderParts(term.parts);
  switch (term.kind) {
    case 'caret':
      return `^${v}`;
    case 'tilde':
      return `~${v}`;
    case 'wildcard':
      return `${term.negated ? '!=' : ''}${v}.*`;
    case 'bare':
      return v;
    case 'comparison':
      return `${term.op}${v}`;
    case 'compatible':
      return `~=${v}`;
  }
}

export function renderPoetryConstraint(model: PoetryConstraintModel): string {
  return model.terms.map(renderPoetryTerm).join(model.separator);
}

/** A release version of one to four parts, each in 0..5. */
export const arbReleaseVersion: fc.Arbitrary<Parts> = arbParts(1, 4);

const arbReleaseText = arbReleaseVersion.map(renderParts);

const arbPrereleaseText = fc
  .tuple(arbParts(1, 3), fc.constantFrom('a', 'b', 'rc', '.dev', '.post'), fc.integer({ min: 0, max: 3 }))
  .map(([parts, tag, n]) => `${renderParts(parts)}${tag}${n}`);

const arbJunkText = fc.constantFrom('', 'latest', 'not-a-version', '1.x', 'v1.2', '1..2', '.', 'abc', '1.2.3.4.5.6');

/** Version lists with stable releases, prereleases and junk. Duplicates are allowed. */
export const arbVersionList: fc.Arbitrary<readonly string[]> = fc.array(
  fc.oneof(
    { weight: 6, arbitrary: arbReleaseText },
    { weight: 2, arbitrary: arbPrereleaseText },
    { weight: 1, arbitrary: arbJunkText },
  ),
  { minLength: 0, maxLength: 12 },
);
