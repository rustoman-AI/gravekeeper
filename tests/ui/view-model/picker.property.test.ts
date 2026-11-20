// Feature: graveyard-ui, Property 26: Picker lists candidates and encodes the selection
// Validates: Requirements 11.11, 13.15, 13.17
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SCAN_MAX_MANIFESTS } from '../../../view-model/constants';
import { buildPickerModel } from '../../../view-model/picker';
import { parseUrlState } from '../../../view-model/urls';
import { cfg } from '../../support/fc-config';

const HOSTILE = ['&', '=', '%', '#', '+', ' ', '?', '/', '\\', '"', "'", '<', '>', '..', '%26', '%00', 'é', '日本', '\n', '\u{1F480}'];
const piece = fc.oneof(
  fc.constantFrom(...HOSTILE),
  fc.string({ unit: 'grapheme', maxLength: 6 }),
  fc.constantFrom('a', 'b', 'package.json', 'Cargo.toml'),
);
const path = fc.array(piece, { maxLength: 6 }).map((p) => p.join(''));

// Small pool so duplicates are frequent; sizes go past the limit.
const candidateList = fc.oneof(
  fc.array(path, { maxLength: SCAN_MAX_MANIFESTS + 8 }),
  fc
    .array(path, { minLength: 1, maxLength: 5 })
    .chain((pool) => fc.array(fc.constantFrom(...pool), { maxLength: SCAN_MAX_MANIFESTS + 8 })),
);
const repoValue = fc.oneof(fc.constant(''), fc.constant('github.com/a/b?x=1&manifest=z#f'), fc.string({ unit: 'grapheme', maxLength: 30 }));

/** Candidates, a selection of at most SCAN_MAX_MANIFESTS of them in arbitrary order, and a repo value. */
const scenario = fc
  .tuple(candidateList, repoValue)
  .chain(([candidates, repo]) =>
    fc
      .tuple(
        fc.array(fc.boolean(), { minLength: candidates.length, maxLength: candidates.length }),
        fc.boolean(),
      )
      .map(([mask, reverse]) => {
        const distinct = [...new Set(candidates)];
        const flagged = new Set(candidates.filter((_, i) => mask[i]));
        let selected = distinct.filter((p) => flagged.has(p)).slice(0, SCAN_MAX_MANIFESTS);
        if (reverse) selected = [...selected].reverse();
        return { candidates, selected, repo };
      }),
  );

describe('P26: Picker lists candidates and encodes the selection', () => {
  it('lists every candidate once in order and disables unchecked boxes at the limit', () => {
    fc.assert(
      fc.property(scenario, ({ candidates, selected, repo }) => {
        const model = buildPickerModel(candidates, selected, repo);
        const distinct = [...new Set(candidates)];
        expect(model.candidates.map((c) => c.path)).toEqual(distinct);
        const chosen = new Set(selected);
        expect(model.candidates.filter((c) => c.checked).map((c) => c.path)).toEqual(
          distinct.filter((p) => chosen.has(p)),
        );
        const full = chosen.size >= SCAN_MAX_MANIFESTS;
        for (const c of model.candidates) {
          expect(c.disabled).toBe(!c.checked && full);
        }
        expect(model.limit).toBe(SCAN_MAX_MANIFESTS);
      }),
      cfg(),
    );
  });

  it('builds a URL that decodes to the selected paths in candidate order and the repo value', () => {
    fc.assert(
      fc.property(scenario, ({ candidates, selected, repo }) => {
        const model = buildPickerModel(candidates, selected, repo);
        if (selected.length === 0) {
          expect(model.scanUrl).toBeNull();
          return;
        }
        expect(model.scanUrl).not.toBeNull();
        const url = model.scanUrl as string;
        const state = parseUrlState(url.slice(url.indexOf('?')));
        const chosen = new Set(selected);
        expect(state.manifests).toEqual([...new Set(candidates)].filter((p) => chosen.has(p)));
        expect(state.repo).toBe(repo === '' ? null : repo);
      }),
      cfg(),
    );
  });
});
