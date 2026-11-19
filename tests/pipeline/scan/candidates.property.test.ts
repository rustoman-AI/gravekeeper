import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DISCOVERY_MANIFEST_NAMES,
  DISCOVERY_MAX_DEPTH,
  DISCOVERY_MAX_MANIFESTS,
  DISCOVERY_SKIP_DIRS,
  SCAN_MAX_MANIFESTS,
} from '../../../pipeline/constants';
import { discoverManifests } from '../../../pipeline/mapping';
import type { DiscoveryLimits, SelectionLimits } from '../../../pipeline/mapping';
import type { DiscoveryStageOutput } from '../../../pipeline/scan/stage-discovery';
import { selectManifestStage } from '../../../pipeline/scan/stage-manifests';
import { arbTreeBody } from '../../support/arbitraries/trees';
import { cfg } from '../../support/fc-config';

const DISCOVERY_LIMITS: DiscoveryLimits = {
  maxDepth: DISCOVERY_MAX_DEPTH,
  maxManifests: DISCOVERY_MAX_MANIFESTS,
  manifestNames: DISCOVERY_MANIFEST_NAMES,
  skipDirs: DISCOVERY_SKIP_DIRS,
};
const LIMITS: SelectionLimits = {
  maxManifests: SCAN_MAX_MANIFESTS,
  manifestNames: DISCOVERY_MANIFEST_NAMES,
};

function discover(treeBody: unknown): DiscoveryStageOutput {
  const result = discoverManifests(treeBody, DISCOVERY_LIMITS);
  if (!result.ok) throw new Error('arbTreeBody always has a tree array');
  return {
    owner: 'o',
    repo: 'r',
    branch: 'main',
    defaultBranch: 'main',
    commitSha: 'c'.repeat(40),
    discovery: result.value,
    treeBody,
  };
}

/** Distinct requested paths that never occur in a generated tree (its names are not `zz-absent`). */
const absent = (n: number): string => `zz-absent/${n}/package.json`;

const arbTooMany = fc
  .integer({ min: SCAN_MAX_MANIFESTS + 1, max: SCAN_MAX_MANIFESTS + 6 })
  .map((count) => Array.from({ length: count }, (_, i) => absent(i)));

/** 1 to `limit` distinct requested paths, the last (or another) one missing from the tree. */
const arbNotFound = fc
  .integer({ min: 1, max: SCAN_MAX_MANIFESTS })
  .map((count) => {
    const missing = Array.from({ length: count }, (_, i) => absent(i));
    return { requested: missing, expectedPath: missing[0] as string };
  });

describe('candidates in selection errors', () => {
  // Feature: scan-accuracy, Property 9: Candidates equal the discovered manifest paths
  // Validates: Requirements 8.1, 8.2, 8.3, 8.6
  it('P9 too-many-manifests carries exactly the discovered paths, capped, with only limit and candidates', () => {
    fc.assert(
      fc.property(arbTreeBody, arbTooMany, (treeBody, requested) => {
        const discovered = discover(treeBody);
        const out = selectManifestStage({ discovered, requested, limits: LIMITS, webHost: 'github.com' });
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.error.code).toBe('too-many-manifests');
        const details = (out.error as unknown as { details: Record<string, unknown> }).details;
        expect(Object.keys(details).sort()).toEqual(['candidates', 'limit']);
        expect(details.limit).toBe(SCAN_MAX_MANIFESTS);
        expect(details.candidates).toEqual(discovered.discovery.candidates.map((c) => c.path));
        expect((details.candidates as string[]).length).toBeLessThanOrEqual(DISCOVERY_MAX_MANIFESTS);
      }),
      cfg(),
    );
  });

  // Feature: scan-accuracy, Property 9: Candidates equal the discovered manifest paths
  // Validates: Requirements 8.1, 8.2, 8.3, 8.6
  it('P9 manifest-not-found carries exactly the discovered paths, capped, with only path and candidates', () => {
    fc.assert(
      fc.property(arbTreeBody, arbNotFound, (treeBody, { requested, expectedPath }) => {
        const discovered = discover(treeBody);
        const out = selectManifestStage({ discovered, requested, limits: LIMITS, webHost: 'github.com' });
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.error.code).toBe('manifest-not-found');
        const details = (out.error as unknown as { details: Record<string, unknown> }).details;
        expect(Object.keys(details).sort()).toEqual(['candidates', 'path']);
        expect(details.path).toBe(expectedPath);
        expect(details.candidates).toEqual(discovered.discovery.candidates.map((c) => c.path));
        expect((details.candidates as string[]).length).toBeLessThanOrEqual(DISCOVERY_MAX_MANIFESTS);
      }),
      cfg(),
    );
  });
});
