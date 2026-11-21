import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DISCOVERY_MANIFEST_NAMES,
  DISCOVERY_MAX_DEPTH,
  DISCOVERY_MAX_MANIFESTS,
  DISCOVERY_SKIP_DIRS,
  SCAN_MAX_MANIFESTS,
} from '../../../pipeline/constants';
import { discoverManifests } from '../../../pipeline/mapping/discovery';
import { selectManifests } from '../../../pipeline/mapping/selection';
import type { DiscoveryLimits, SelectionLimits } from '../../../pipeline/mapping/types';
import { cfg } from '../../support/fc-config';

// Feature: pyproject, Property PY-P9: Discovery and root selection treat pyproject.toml like every manifest
// Validates: Requirements 9.1, 9.2, 9.3, 9.8

// Written from R9.1 and R9.8: the four names are literal here, not read from the constants.
const MANIFEST_NAMES = ['package.json', 'requirements.txt', 'pyproject.toml', 'Cargo.toml'] as const;
const MAX_DEPTH = 4; // pipeline R4 depth limit
const MAX_CANDIDATES = 50; // pipeline R4 count cap

const discoveryLimits: DiscoveryLimits = {
  maxDepth: DISCOVERY_MAX_DEPTH,
  maxManifests: DISCOVERY_MAX_MANIFESTS,
  manifestNames: DISCOVERY_MANIFEST_NAMES,
  skipDirs: DISCOVERY_SKIP_DIRS,
};
const selectionLimits: SelectionLimits = {
  maxManifests: SCAN_MAX_MANIFESTS,
  manifestNames: DISCOVERY_MANIFEST_NAMES,
};

const arbDir: fc.Arbitrary<string> = fc.oneof(
  { arbitrary: fc.constantFrom('a', 'b', 'src', 'pkg', 'é', 'z', 'A'), weight: 6 },
  { arbitrary: fc.constantFrom(...DISCOVERY_SKIP_DIRS), weight: 1 },
);
const arbName: fc.Arbitrary<string> = fc.oneof(
  { arbitrary: fc.constantFrom(...MANIFEST_NAMES), weight: 6 },
  { arbitrary: fc.constantFrom('pyproject.toml', 'pyproject.toml', 'requirements.txt'), weight: 3 },
  {
    arbitrary: fc.constantFrom(
      'Pyproject.toml',
      'PYPROJECT.TOML',
      'pyproject.toml.bak',
      'pyproject.tom',
      'cargo.toml',
      'README.md',
      'setup.py',
    ),
    weight: 2,
  },
);
const arbPath: fc.Arbitrary<string> = fc
  .tuple(fc.array(arbDir, { maxLength: 7 }), arbName)
  .map(([dirs, last]) => [...dirs, last].join('/'));

// Roots get extra weight so that both a root pyproject.toml and a root requirements.txt occur often.
const arbRootPath: fc.Arbitrary<string> = arbName;
const arbPaths: fc.Arbitrary<string[]> = fc
  .tuple(
    fc.uniqueArray(arbPath, { maxLength: 70 }),
    fc.uniqueArray(arbRootPath, { maxLength: 6 }),
  )
  .map(([deep, roots]) => Array.from(new Set([...roots, ...deep])));

const arbBlobOrOther: fc.Arbitrary<'blob' | 'tree' | 'commit'> = fc.oneof(
  { arbitrary: fc.constant<'blob'>('blob'), weight: 8 },
  { arbitrary: fc.constantFrom<'tree' | 'commit'>('tree', 'commit'), weight: 1 },
);
const arbEntries = arbPaths.chain((paths) =>
  fc
    .array(arbBlobOrOther, { minLength: paths.length, maxLength: paths.length })
    .map((types) => paths.map((path, i) => ({ path, type: types[i] as string }))),
);

function cmpCodePoints(a: string, b: string): number {
  const x = Array.from(a, (c) => c.codePointAt(0) as number);
  const y = Array.from(b, (c) => c.codePointAt(0) as number);
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
    if (x[i] !== y[i]) return (x[i] as number) - (y[i] as number);
  }
  return x.length - y.length;
}

interface Expected {
  readonly path: string;
  readonly depth: number;
  readonly format: string;
}

function oracleDiscovery(entries: readonly { path: string; type: string }[]): Expected[] {
  const out: Expected[] = [];
  for (const e of entries) {
    if (e.type !== 'blob') continue;
    const segs = e.path.split('/');
    const last = segs[segs.length - 1] as string;
    if (!(MANIFEST_NAMES as readonly string[]).includes(last)) continue;
    const dirs = segs.slice(0, -1);
    if (dirs.some((d) => DISCOVERY_SKIP_DIRS.includes(d))) continue;
    if (dirs.length > MAX_DEPTH) continue;
    out.push({ path: e.path, depth: dirs.length, format: last });
  }
  out.sort((a, b) => a.depth - b.depth || cmpCodePoints(a.path, b.path));
  return out.slice(0, MAX_CANDIDATES);
}

describe('pyproject discovery and root selection properties', () => {
  it('PY-P9 discovery lists exactly the manifest-named blobs outside skip dirs within the depth limit, format equals file name', () => {
    fc.assert(
      fc.property(arbEntries, (tree) => {
        const r = discoverManifests({ tree, truncated: false }, discoveryLimits);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.candidates.map((c) => ({ path: c.path, depth: c.depth, format: c.format }))).toEqual(
          oracleDiscovery(tree),
        );
      }),
      cfg(),
    );
  });

  it('PY-P9 default selection is exactly the root manifests in ascending code point order, pyproject.toml and requirements.txt together', () => {
    fc.assert(
      fc.property(arbEntries, (tree) => {
        const d = discoverManifests({ tree, truncated: false }, discoveryLimits);
        expect(d.ok).toBe(true);
        if (!d.ok) return;
        const treePaths = new Set(tree.map((e) => e.path));
        const s = selectManifests(d.value.candidates, [], treePaths, selectionLimits);
        expect(s.ok).toBe(true);
        if (!s.ok) return;
        const expected = oracleDiscovery(tree);
        const roots = expected
          .filter((c) => !c.path.includes('/'))
          .map((c) => c.path)
          .sort(cmpCodePoints);
        expect(s.value.selected).toEqual(roots);
        expect(s.value.noRootManifest).toBe(roots.length === 0 && expected.length > 0);
        // Both root files are selected together when both exist.
        const rootSet = new Set(roots);
        for (const n of ['pyproject.toml', 'requirements.txt']) {
          const present = tree.some((e) => e.path === n && e.type === 'blob');
          expect(s.value.selected.includes(n)).toBe(present && rootSet.has(n));
        }
      }),
      cfg(),
    );
  });
});
