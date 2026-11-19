import * as fc from 'fast-check';
import { describe, it } from 'vitest';

import { scanCacheKey, type ScanCacheKeyParts } from '../../../pipeline/scan/cache-keys';
import { cfg } from '../../support/fc-config';

// Requirements 19.13

const SPECIAL = [
  '', 'a', 'A', 'Octo', 'octo', 'OCTO', 'main', 'Main', '"', '\\', '\\"', '[', ']', ',', '","', '"],["', '{}', 'null',
  '\n', '\u0000', 'é', 'É', 'e\u0301', 'ß', '日本', '😀', '\u{10000}', '\uffff', 'a/b', 'a/B', 'package.json', 'Package.json',
] as const;

const arbStr = fc.oneof(fc.constantFrom(...SPECIAL), fc.string({ unit: 'binary', maxLength: 8 }));

/** Selected Manifest_Paths are a set: no duplicates. */
const arbPaths = fc.uniqueArray(arbStr, { maxLength: 5 });

const arbParts: fc.Arbitrary<ScanCacheKeyParts> = fc.record({
  webHost: arbStr,
  owner: arbStr,
  repo: arbStr,
  branch: arbStr,
  defaultBranch: arbStr,
  commitSha: arbStr,
  manifestPaths: arbPaths,
});

const SCALAR_FIELDS = ['webHost', 'owner', 'repo', 'branch', 'defaultBranch', 'commitSha'] as const;

describe('Property 61: Scan_Cache key identity', () => {
  // Feature: scan-pipeline, Property 61: Scan_Cache key identity
  it('Property 61: keys ignore a token and path order', () => {
    fc.assert(
      fc.property(arbParts, fc.string(), (parts, token) => {
        const shuffled = [...parts.manifestPaths].reverse();
        const withToken = { ...parts, manifestPaths: shuffled, token } as ScanCacheKeyParts;
        return scanCacheKey(withToken) === scanCacheKey(parts);
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 61: Scan_Cache key identity
  it('Property 61: keys differ when any scalar field differs', () => {
    fc.assert(
      fc.property(arbParts, fc.constantFrom(...SCALAR_FIELDS), arbStr, (parts, field, value) => {
        fc.pre(parts[field] !== value);
        return scanCacheKey({ ...parts, [field]: value }) !== scanCacheKey(parts);
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 61: Scan_Cache key identity
  it('Property 61: keys differ when the path set differs', () => {
    fc.assert(
      fc.property(arbParts, arbPaths, (parts, other) => {
        const a = new Set(parts.manifestPaths);
        const b = new Set(other);
        const same = a.size === b.size && [...a].every((p) => b.has(p));
        fc.pre(!same);
        return scanCacheKey({ ...parts, manifestPaths: other }) !== scanCacheKey(parts);
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 61: Scan_Cache key identity
  it('Property 61: owner and repo differing only in letter case give different keys', () => {
    fc.assert(
      fc.property(arbParts, fc.constantFrom('owner', 'repo') as fc.Arbitrary<'owner' | 'repo'>, (parts, field) => {
        const v = parts[field];
        const flipped = v === v.toUpperCase() ? v.toLowerCase() : v.toUpperCase();
        fc.pre(flipped !== v);
        return scanCacheKey({ ...parts, [field]: flipped }) !== scanCacheKey(parts);
      }),
      cfg(),
    );
  });
});
