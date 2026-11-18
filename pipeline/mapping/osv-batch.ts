import { compareCodePoints } from './compare-code-points';
import { readOwn } from './read-own';
import type { OsvBatchMapping, OsvQueryResult } from './types';

// Requirement 9.2, 9.3, 9.11, 9.17, 9.19

function isObject(value: unknown): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mapOsvResult(entry: unknown): OsvQueryResult {
  if (!isObject(entry)) return { kind: 'invalid' };
  const vulns = readOwn(entry, 'vulns');
  if (vulns !== undefined && !Array.isArray(vulns)) return { kind: 'invalid' };
  const ids = new Set<string>();
  if (vulns !== undefined) {
    for (let i = 0; i < vulns.length; i += 1) {
      const id = readOwn(vulns[i], 'id');
      if (typeof id === 'string' && id.length > 0) ids.add(id);
    }
  }
  const token = readOwn(entry, 'next_page_token');
  return {
    kind: 'ids',
    ids: [...ids].sort(compareCodePoints),
    truncated: typeof token === 'string' && token.length > 0,
  };
}

/**
 * Maps an OSV querybatch body (EF-5, EF-11) positionally. Never throws.
 * A missing or non-array `results`, or a length different from `queryCount`,
 * gives `length-mismatch`.
 */
export function mapOsvQueryBatch(body: unknown, queryCount: number): OsvBatchMapping {
  try {
    const results = readOwn(body, 'results');
    if (!Array.isArray(results) || results.length !== queryCount) {
      return { kind: 'length-mismatch' };
    }
    const mapped: OsvQueryResult[] = [];
    for (let i = 0; i < results.length; i += 1) {
      mapped.push(mapOsvResult(results[i]));
    }
    return { kind: 'ok', results: mapped };
  } catch {
    return { kind: 'length-mismatch' };
  }
}

// Requirement 9.4, 9.20
/**
 * Plans advisory detail requests: distinct ids in ascending code point order,
 * the first `cap` requested and the rest unfetched.
 */
export function planAdvisoryRequests(
  ids: readonly string[],
  cap: number,
): { readonly requested: readonly string[]; readonly unfetched: readonly string[] } {
  const sorted = [...new Set(ids)].sort(compareCodePoints);
  const limit = Math.max(0, Math.floor(cap));
  return { requested: sorted.slice(0, limit), unfetched: sorted.slice(limit) };
}
