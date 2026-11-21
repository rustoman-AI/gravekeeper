import * as fc from 'fast-check';
import { describe, it } from 'vitest';
import { poetryToPep440 } from '../../../core/formats/poetry-constraint';
import {
  arbPoetryConstraint,
  arbReleaseVersion,
  renderPoetryConstraint,
} from '../../support/arbitraries/poetry';
import type { PoetryConstraintModel } from '../../support/arbitraries/poetry';
import {
  evaluatePep440Text,
  poetryReferenceAccepts,
  type Parts,
} from '../../support/oracles/poetry-reference';
import { cfg } from '../../support/fc-config';

/** Versions around one bound: the bound, next and previous patch, minor, major, and zero-padded or trimmed forms. */
function boundaryVersions(bound: Parts): Parts[] {
  const out: Parts[] = [bound, [...bound, 0], [...bound, 0, 0]];
  if (bound.length > 1) out.push(bound.slice(0, -1));
  // Padded to at least major.minor.patch so that every index below exists.
  const padded = [...bound];
  while (padded.length < 3) padded.push(0);
  for (const index of [0, 1, 2]) {
    const up = padded.map((p, i) => (i < index ? p : i === index ? p + 1 : 0));
    out.push(up, [...up.slice(0, 3)]);
    if (padded[index] > 0) {
      const down = padded.map((p, i) => (i < index ? p : i === index ? p - 1 : 0));
      out.push(down);
      // Just below the next bump: previous value with the later parts at their high end.
      out.push(padded.map((p, i) => (i < index ? p : i === index ? p - 1 : 9)));
    }
    // Same up-bump with the later parts at the high end, which sits just under the next boundary.
    out.push(padded.map((p, i) => (i < index ? p : i === index ? p : 9)));
  }
  return out;
}

function constraintAndVersion(): fc.Arbitrary<readonly [PoetryConstraintModel, Parts]> {
  return arbPoetryConstraint.chain((model) => {
    const boundaries = model.terms.flatMap((t) => boundaryVersions(t.parts));
    return fc
      .tuple(
        fc.constant(model),
        fc.oneof(
          { weight: 3, arbitrary: fc.constantFrom(...boundaries) },
          { weight: 1, arbitrary: arbReleaseVersion },
        ),
      )
      .map(([m, v]) => [m, v] as const);
  });
}

describe('Poetry translation properties', () => {
  // Feature: pyproject, Property PY-P3: Poetry translation accepts exactly the versions Poetry accepts
  // Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.10
  it('PY-P3 the translated PEP 440 text accepts exactly what the Poetry reference accepts', () => {
    fc.assert(
      fc.property(constraintAndVersion(), ([model, version]) => {
        const text = renderPoetryConstraint(model);
        const translated = poetryToPep440(text);
        if (translated.kind !== 'ok') {
          throw new Error(`translation of ${JSON.stringify(text)} was ${translated.kind}`);
        }
        const expected = poetryReferenceAccepts(model.terms, version);
        const actual =
          translated.spec === '*' ? true : evaluatePep440Text(translated.spec, version);
        if (actual !== expected) {
          throw new Error(
            `constraint ${JSON.stringify(text)} -> ${JSON.stringify(translated.spec)}; ` +
              `version ${version.join('.')}: translated=${actual}, poetry=${expected}`,
          );
        }
      }),
      cfg(),
    );
  });
});
