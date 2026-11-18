import * as fc from 'fast-check';
import { DISCOVERY_MANIFEST_NAMES, DISCOVERY_SKIP_DIRS } from '../../../pipeline/constants';
import { arbJson } from './json';

// Requirement 4.9, 4.10, 4.12, 4.13: recursive tree responses for discovery.

const arbPlainDir: fc.Arbitrary<string> = fc.constantFrom('a', 'b', 'src', 'pkg', 'é', '😀', 'z', 'A');
const arbSkipDir: fc.Arbitrary<string> = fc.constantFrom(...DISCOVERY_SKIP_DIRS);
const arbDirSegment: fc.Arbitrary<string> = fc.oneof(
  { arbitrary: arbPlainDir, weight: 6 },
  { arbitrary: arbSkipDir, weight: 1 },
);
const arbLastSegment: fc.Arbitrary<string> = fc.oneof(
  { arbitrary: fc.constantFrom(...DISCOVERY_MANIFEST_NAMES), weight: 8 },
  { arbitrary: fc.constantFrom('README.md', 'package.json.bak', 'PACKAGE.JSON', 'a', ''), weight: 1 },
);

/** Deep paths: 0 to 7 directory segments (the depth limit is 4), skip directories included. */
export const arbTreePath: fc.Arbitrary<string> = fc
  .tuple(fc.array(arbDirSegment, { maxLength: 7 }), arbLastSegment)
  .map(([dirs, last]) => [...dirs, last].join('/'));

const arbSize: fc.Arbitrary<unknown> = fc.oneof(
  fc.nat(100000),
  fc.constantFrom(-1, 1.5, NaN, Infinity, null, '12', undefined),
);

export const arbBlobEntry: fc.Arbitrary<unknown> = fc
  .tuple(arbTreePath, arbSize)
  .map(([path, size]) => (size === undefined ? { path, type: 'blob' } : { path, type: 'blob', size }));

/** Entries that discovery has to ignore or survive. */
export const arbHostileEntry: fc.Arbitrary<unknown> = fc.oneof(
  arbTreePath.map((path) => ({ path, type: 'tree' })),
  arbTreePath.map((path) => ({ path, type: 'commit' })),
  arbTreePath.map((path) => ({ path })),
  arbTreePath.map((path) => ({ path, type: 7 })),
  arbJson.map((path) => ({ path, type: 'blob' })),
  arbJson.map((type) => ({ path: 'package.json', type })),
  arbJson,
  fc.constantFrom(null, undefined, 0, 'package.json', [], [['package.json', 'blob']]),
);

/** A tree entry: mostly blobs, with duplicates (narrow alphabet) and hostile entries. */
export const arbTreeEntry: fc.Arbitrary<unknown> = fc.oneof(
  { arbitrary: arbBlobEntry, weight: 8 },
  { arbitrary: arbHostileEntry, weight: 2 },
);

/** Entries whose count often exceeds DISCOVERY_MAX_MANIFESTS after the filters. */
export const arbTreeEntries: fc.Arbitrary<unknown[]> = fc.oneof(
  { arbitrary: fc.array(arbTreeEntry, { maxLength: 40 }), weight: 3 },
  { arbitrary: fc.array(arbTreeEntry, { minLength: 100, maxLength: 400 }), weight: 2 },
);

export const arbTreeBody: fc.Arbitrary<{ tree: unknown[]; truncated: unknown }> = fc.record({
  tree: arbTreeEntries,
  truncated: fc.oneof(fc.boolean(), arbJson),
});
