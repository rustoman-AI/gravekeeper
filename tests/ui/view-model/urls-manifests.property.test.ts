// Feature: graveyard-ui, Property 2: Manifest query round trip
// Validates: Requirements 3.12
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildUrl, decodeManifests, encodeManifests, parseUrlState } from '../../../view-model/urls';
import { cfg } from '../../support/fc-config';

const SPECIAL = ['&', '=', '%', '+', '#', ' ', '?', '/', '', 'é', '日本語', '😀', '%41', '%zz', 'a&manifest=b', '+ +'];

// Well-formed Unicode only: lone surrogates cannot be percent-encoded.
const piece = fc.oneof(
  fc.constantFrom(...SPECIAL),
  fc.string({ unit: 'binary', maxLength: 12 }),
  fc.string({ unit: 'grapheme', maxLength: 12 }),
);
const path = fc.array(piece, { maxLength: 6 }).map((parts) => parts.join(''));
const pathList = fc.array(fc.oneof(path, fc.constant('')), { maxLength: 8 });

describe('P2: Manifest query round trip', () => {
  it('decodeManifests(encodeManifests(list)) equals list in the same order', () => {
    fc.assert(
      fc.property(pathList, (list) => {
        expect(decodeManifests(encodeManifests(list))).toEqual(list);
      }),
      cfg(),
    );
  });

  it('also holds with a leading "?" and through buildUrl and parseUrlState', () => {
    fc.assert(
      fc.property(pathList, fc.constantFrom<'scene' | 'list'>('scene', 'list'), (list, view) => {
        const url = buildUrl({ repo: 'github.com/a/b', manifests: list, view });
        const parsed = parseUrlState(url.slice(url.indexOf('?')));
        expect(parsed.manifests).toEqual(list);
        expect(parsed.repo).toBe('github.com/a/b');
        expect(parsed.view).toBe(view);
      }),
      cfg(),
    );
  });
});
