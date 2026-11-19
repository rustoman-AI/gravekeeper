// Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.13, scan-accuracy 8.1, 8.2, 8.3
import { DISCOVERY_MAX_MANIFESTS } from '../constants';
import { compareCodePoints } from './compare-code-points';
import { err, ok, type Result } from './result';
import type {
  ManifestCandidate,
  SelectionError,
  SelectionLimits,
  SelectionResult,
} from './types';

function lastSegment(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * Selects the manifests to scan. With no (or an empty) request, selects the
 * Root_Manifests (paths without `/`) in code point order, with no cap.
 * Otherwise selects the listed paths de-duplicated on exact strings (first
 * occurrence kept); more than `limits.maxManifests` distinct paths is
 * `too-many-manifests`, checked before `manifest-not-found`.
 */
export function selectManifests(
  candidates: readonly ManifestCandidate[],
  requested: readonly string[],
  treePaths: ReadonlySet<string>,
  limits: SelectionLimits,
): Result<SelectionResult, SelectionError> {
  if (requested.length === 0) {
    const selected = Array.from(
      new Set(candidates.filter((c) => !c.path.includes('/')).map((c) => c.path)),
    ).sort(compareCodePoints);
    return ok({
      selected,
      noRootManifest: selected.length === 0 && candidates.length > 0,
    });
  }

  // Candidate paths in discovery order, capped (scan-accuracy R8.3).
  const candidatePaths = candidates.slice(0, DISCOVERY_MAX_MANIFESTS).map((c) => c.path);
  const distinct = Array.from(new Set(requested));
  if (distinct.length > limits.maxManifests) {
    return err({ code: 'too-many-manifests', details: { limit: limits.maxManifests, candidates: candidatePaths } });
  }
  for (const path of distinct) {
    if (!treePaths.has(path) || !limits.manifestNames.includes(lastSegment(path))) {
      return err({ code: 'manifest-not-found', details: { path, candidates: candidatePaths } });
    }
  }
  return ok({ selected: distinct, noRootManifest: false });
}
