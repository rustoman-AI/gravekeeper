// Feature: graveyard-ui, Property 1: Canonical URL round trip
// Validates: Requirements 3.11
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { REPO_QUERY_PARAM } from '../../../view-model/constants';
import type { ParsedScanResult } from '../../../view-model/types';
import { buildRequestBody, buildUrl, canonicalRepoUrl, parseUrlState } from '../../../view-model/urls';
import { cfg } from '../../support/fc-config';

type Repo = ParsedScanResult['repo'];

const SPECIALS = ['&', '=', '%', '+', '#', ' ', '/', '?', 'é', '日本', '😀'];
// Names include URL-significant characters and non-ASCII text; never empty.
const text = fc
  .array(fc.oneof(fc.string({ unit: 'grapheme', maxLength: 6 }), fc.constantFrom(...SPECIALS)), {
    minLength: 1,
    maxLength: 4,
  })
  .map((parts) => parts.join(''))
  .filter((s) => s.length > 0);
const branch = fc.array(text, { minLength: 1, maxLength: 3 }).map((segs) => segs.join('/'));

const repoArb: fc.Arbitrary<Repo> = fc.record({
  host: fc.constantFrom('github.com'),
  owner: text,
  repo: text,
  branch,
  defaultBranch: fc.oneof(branch, fc.constant('main')),
}) as unknown as fc.Arbitrary<Repo>;

describe('P1: Canonical URL round trip', () => {
  it('repoUrl of the request body equals the Canonical_Repo_URL after writing it as the repo query value', () => {
    fc.assert(
      fc.property(repoArb, fc.boolean(), (repo, sameBranch) => {
        const r: Repo = sameBranch ? { ...repo, branch: repo.defaultBranch } : repo;
        const canonical = canonicalRepoUrl(r);
        const search = `?${REPO_QUERY_PARAM}=${encodeURIComponent(canonical)}`;
        expect(buildRequestBody(parseUrlState(search)).repoUrl).toBe(canonical);
        // Same result through buildUrl, which is what the app writes.
        const built = buildUrl({ repo: canonical, manifests: [], view: 'scene' });
        expect(buildRequestBody(parseUrlState(built.slice(1))).repoUrl).toBe(canonical);
      }),
      cfg(),
    );
  });

  it('round-trips a plain example', () => {
    const repo = { host: 'github.com', owner: 'o', repo: 'r', branch: 'dev/x', defaultBranch: 'main' } as Repo;
    const canonical = canonicalRepoUrl(repo);
    expect(canonical).toBe('https://github.com/o/r/tree/dev/x');
    expect(buildRequestBody(parseUrlState(buildUrl({ repo: canonical, manifests: [], view: 'scene' }).slice(1))).repoUrl).toBe(canonical);
  });
});
