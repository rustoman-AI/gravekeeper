// Feature: pyproject, Property PY-P10: Translated ranges resolve to the highest accepted version
// **Validates: Requirements 6.11, 10.4**
//
// Oracle alignment with resolveRange('pypi', ...) (pipeline/mapping/range-resolve.ts):
// - It returns { kind: 'resolved', version } or { kind: 'unresolved' }; it never throws.
// - Candidates are valid PEP 440 versions that are not prereleases (scan-accuracy 3.3, property 14: only
//   `a`, `b`, `rc` and `.dev` count as prereleases). Junk is ignored without a note.
// - Ties (`1.0` and `1.0.0`) keep the first listed version, as poetryReferenceHighest does.
// Two differences are removed from the input so the oracle stays defined: post-releases (`1.2.post1`) are stable
// candidates for the resolver but the Poetry_Reference defines release semantics only, and `v1.2` is a valid PEP 440
// spelling that the reference reads as junk. Both are filtered out of the version list before comparing.
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { poetryToPep440 } from '../../../core/formats/poetry-constraint';
import { pepRange } from '../../../pipeline/mapping/range-pep440';
import { resolveRange } from '../../../pipeline/mapping/range-resolve';
import { cfg } from '../../support/fc-config';
import { arbPoetryConstraint, arbVersionList, renderPoetryConstraint } from '../../support/arbitraries/poetry';
import { poetryReferenceHighest } from '../../support/oracles/poetry-reference';

const comparable = (versions: readonly string[]): string[] => versions.filter((v) => !/post|^v/i.test(v));

describe('PY-P10 translated ranges resolve to the highest accepted version', () => {
  it('PY-P10 resolveRange on the translation equals the Poetry_Reference highest stable version', () => {
    fc.assert(
      fc.property(arbPoetryConstraint, arbVersionList, (model, rawVersions) => {
        const versions = comparable(rawVersions);
        const translation = poetryToPep440(renderPoetryConstraint(model));
        expect(translation.kind).toBe('ok');
        if (translation.kind !== 'ok') return;
        const outcome = resolveRange('pypi', [translation.spec], versions);
        const expected = poetryReferenceHighest(model.terms, versions);
        if (expected === undefined) {
          expect(outcome).toEqual({ kind: 'unresolved' });
        } else {
          expect(outcome).toEqual({ kind: 'resolved', version: expected });
        }
      }),
      cfg(),
    );
  });

  it('PY-P10 every non-* translation is accepted by pepRange', () => {
    fc.assert(
      fc.property(arbPoetryConstraint, (model) => {
        const translation = poetryToPep440(renderPoetryConstraint(model));
        expect(translation.kind).toBe('ok');
        if (translation.kind !== 'ok' || translation.spec === '*') return;
        expect(pepRange(translation.spec)).not.toBeNull();
      }),
      cfg(),
    );
  });
});
