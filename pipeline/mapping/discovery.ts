import type { ManifestFormat } from '@/core';
import { compareCodePoints } from './compare-code-points';
import { readOwn } from './read-own';
import { err, ok, type Result } from './result';
import type { DiscoveryLimits, DiscoveryResult, ManifestCandidate } from './types';

// Requirement 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.11

function readTreeArray(treeBody: unknown): readonly unknown[] | null {
  try {
    if (treeBody === null || typeof treeBody !== 'object' || Array.isArray(treeBody)) {
      return null;
    }
    const tree = readOwn(treeBody, 'tree');
    return Array.isArray(tree) ? (tree as readonly unknown[]) : null;
  } catch {
    return null;
  }
}

function compareCandidates(a: ManifestCandidate, b: ManifestCandidate): number {
  if (a.depth !== b.depth) return a.depth - b.depth;
  const byPath = compareCodePoints(a.path, b.path);
  if (byPath !== 0) return byPath;
  // Equal paths (hostile input): order by size so the result does not depend on entry order.
  if (a.sizeBytes === b.sizeBytes) return 0;
  if (a.sizeBytes === null) return -1;
  if (b.sizeBytes === null) return 1;
  return a.sizeBytes - b.sizeBytes;
}

/**
 * Extracts the Manifest_Candidates of a recursive tree response (EF-14).
 * Total: never throws; returns `invalid-tree` when the body has no `tree` array.
 */
export function discoverManifests(
  treeBody: unknown,
  limits: DiscoveryLimits,
): Result<DiscoveryResult, 'invalid-tree'> {
  const tree = readTreeArray(treeBody);
  if (tree === null) return err('invalid-tree');

  const names = new Set(limits.manifestNames);
  const skipDirs = new Set(limits.skipDirs);
  const remaining: ManifestCandidate[] = [];
  let depthLimited = false;

  for (let index = 0; index < tree.length; index += 1) {
    let entry: unknown;
    try {
      entry = tree[index];
    } catch {
      continue;
    }
    const path = readOwn(entry, 'path');
    const type = readOwn(entry, 'type');
    if (typeof path !== 'string' || path === '' || type !== 'blob') continue;

    const segments = path.split('/');
    const last = segments[segments.length - 1] as string;
    if (!names.has(last)) continue;
    if (segments.slice(0, -1).some((segment) => skipDirs.has(segment))) continue;

    const depth = segments.length - 1;
    if (depth > limits.maxDepth) {
      depthLimited = true;
      continue;
    }

    const size = readOwn(entry, 'size');
    remaining.push({
      path,
      format: last as ManifestFormat,
      depth,
      sizeBytes: typeof size === 'number' && Number.isInteger(size) && size >= 0 ? size : null,
    });
  }

  remaining.sort(compareCandidates);
  const countLimited = remaining.length > limits.maxManifests;

  return ok({
    candidates: countLimited ? remaining.slice(0, limits.maxManifests) : remaining,
    truncatedTree: readOwn(treeBody, 'truncated') === true,
    depthLimited,
    countLimited,
  });
}
