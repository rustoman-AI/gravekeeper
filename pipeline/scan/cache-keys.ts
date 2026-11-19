import { CACHE_KEY_VERSION } from '../constants';
import { compareCodePoints } from '../mapping/compare-code-points';
import { canonicalJson } from '../ports/request-key';

/** Canonical (GitHub) spelling only. There is deliberately no token field. */
export interface ScanCacheKeyParts {
  readonly webHost: string;
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  readonly defaultBranch: string;
  readonly commitSha: string;
  readonly manifestPaths: readonly string[];
}

// Requirement 19.5, 19.8, 19.13, 19.15
/** Scan_Cache key. Strings are never case-folded; paths are sorted by code point. Pure. */
export function scanCacheKey(parts: ScanCacheKeyParts): string {
  const sortedPaths = [...parts.manifestPaths].sort(compareCodePoints);
  return canonicalJson([
    'scan',
    CACHE_KEY_VERSION,
    parts.webHost,
    parts.owner,
    parts.repo,
    parts.branch,
    parts.defaultBranch,
    parts.commitSha,
    sortedPaths,
  ]);
}
