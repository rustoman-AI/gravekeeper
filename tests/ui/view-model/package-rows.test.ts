import { describe, expect, it } from 'vitest';
import { compareCodePoints as coreCompare } from '../../../core/internal/compare';
import { compareCodePoints } from '../../../view-model/internal/compare-code-points';
import { buildPackageRows, unassessedLabelOf } from '../../../view-model/package-rows';
import type { PackageRow, ParsedScanResult, UnassessedCause } from '../../../view-model/types';
import { buildScanResult } from '../../support/ui/scan-result-builder';
import type { ResultOptions, RowSpec } from '../../support/ui/scan-result-builder';

const rowsOf = (specs: readonly RowSpec[], options?: ResultOptions): readonly PackageRow[] =>
  buildPackageRows(buildScanResult(specs, options) as unknown as ParsedScanResult);

const only = (spec: RowSpec, options?: ResultOptions): PackageRow => {
  const rows = rowsOf([spec], options);
  expect(rows).toHaveLength(1);
  return rows[0]!;
};

describe('buildPackageRows merging (R7.1)', () => {
  it('merges a repeated key across scopes and manifests into one row', () => {
    const rows = rowsOf([
      { name: 'left-pad', kind: 'alive', scope: 'runtime', manifestPath: 'package.json' },
      { name: 'left-pad', kind: 'alive', scope: 'dev', manifestPath: 'packages/a/package.json' },
      { name: 'other', kind: 'alive' },
    ]);
    expect(rows).toHaveLength(2);
    const merged = rows.find((r) => r.name === 'left-pad')!;
    expect([...merged.scopes].sort()).toEqual(['dev', 'runtime']);
    expect([...merged.manifestPaths]).toEqual(['package.json', 'packages/a/package.json']);
  });

  it('keeps the same name in different ecosystems as separate rows', () => {
    const rows = rowsOf([
      { name: 'same', kind: 'alive', ecosystem: 'npm' },
      { name: 'same', kind: 'alive', ecosystem: 'cargo' },
    ]);
    expect(rows).toHaveLength(2);
  });
});

describe('unassessed rows (R7.2, R7.3)', () => {
  it('has a label for each cause', () => {
    const expected: Record<UnassessedCause, string> = {
      git: 'git dependency, not checked',
      path: 'path dependency, not checked',
      'cap-skipped': 'skipped, scan limit reached',
      'no-health-data': 'no health data found',
    };
    for (const [cause, label] of Object.entries(expected)) {
      expect(unassessedLabelOf(cause as UnassessedCause)).toBe(label);
    }
  });

  it.each([
    ['unassessed-git', 'git'],
    ['unassessed-path', 'path'],
    ['unassessed-no-data', 'no-health-data'],
  ] as const)('%s gets cause %s and its label', (kind, cause) => {
    const row = only({ name: 'pkg', kind });
    expect(row.kind).toBe('unmarked');
    expect(row.statusWord).toBe('not assessed');
    expect(row.unassessedCause).toBe(cause);
    expect(row.score).toBeNull();
    expect(row.classification).toBeNull();
    expect(row.graveType).toBeNull();
    expect(row.epitaphShort).toBe(unassessedLabelOf(cause));
    expect(row.accessibleLabel).toBe(`pkg, npm, not assessed, ${unassessedLabelOf(cause)}`);
  });

  it('marks an unassessed registry package named in capped.skipped as cap-skipped', () => {
    const row = only(
      { name: 'skipped-a', kind: 'unassessed-no-data' },
      { skipped: [{ ecosystem: 'npm', name: 'skipped-a' }] },
    );
    expect(row.unassessedCause).toBe('cap-skipped');
    expect(row.epitaphShort).toBe('skipped, scan limit reached');
  });
});

describe('display name (R7.1)', () => {
  it('uses rawName for pypi and the name otherwise', () => {
    const py = only({ name: 'my-pkg', rawName: 'My_Pkg', ecosystem: 'pypi', kind: 'alive' });
    expect(py.name).toBe('my-pkg');
    expect(py.displayName).toBe('My_Pkg');
    const npm = only({ name: 'my-pkg', rawName: 'My_Pkg', kind: 'alive' });
    expect(npm.displayName).toBe('my-pkg');
  });
});

describe('row kinds and status words (R7.6, R7.8)', () => {
  it.each([
    ['buried', 'tombstone', 'dead, buried', 'buried', 'archived'],
    ['forgotten', 'overgrown', 'dead, forgotten', 'forgotten', 'no release or commit for a long time'],
    ['ghost', 'ghost', 'haunted', null, 'no release or commit for a long time'],
    ['restless-archived', 'restless', 'haunted, buried', null, 'archived'],
    ['alive', 'lantern', 'alive', null, ''],
  ] as const)('%s row is %s with word "%s"', (specKind, kind, word, graveType, labelPart) => {
    const row = only({ name: 'pkg', kind: specKind });
    expect(row.kind).toBe(kind);
    expect(row.statusWord).toBe(word);
    expect(row.graveType).toBe(graveType);
    expect(row.unassessedCause).toBeNull();
    expect(row.accessibleLabel.startsWith(`pkg, npm, ${word}, `)).toBe(true);
    if (labelPart !== '' && specKind !== 'ghost' && specKind !== 'restless-archived') {
      expect(row.accessibleLabel).toContain(labelPart);
    }
  });

  it('gives ghost and restless rows a glow and others none', () => {
    expect(only({ name: 'g', kind: 'ghost' }).glow).not.toBeNull();
    expect(only({ name: 'r', kind: 'restless-both' }).glow).not.toBeNull();
    expect(only({ name: 'b', kind: 'buried' }).glow).toBeNull();
    expect(only({ name: 'a', kind: 'alive' }).glow).toBeNull();
  });
});

describe('scene order (R7.9)', () => {
  it('puts ghost and restless before dead, dead before alive, unmarked last', () => {
    const rows = rowsOf([
      { name: 'unmarked', kind: 'unassessed-no-data' },
      { name: 'alive', kind: 'alive' },
      { name: 'buried', kind: 'buried' },
      { name: 'forgotten', kind: 'forgotten' },
      { name: 'ghost', kind: 'ghost' },
      { name: 'restless', kind: 'restless-both' },
    ]);
    const kinds = rows.map((r) => r.kind);
    const first = kinds.slice(0, 2).sort();
    expect(first).toEqual(['ghost', 'restless']);
    expect(kinds.slice(2, 4).sort()).toEqual(['overgrown', 'tombstone']);
    expect(kinds.slice(4)).toEqual(['lantern', 'unmarked']);
  });

  it('orders by score descending within a rank', () => {
    const rows = rowsOf([
      { name: 'a', kind: 'buried' },
      { name: 'b', kind: 'forgotten' },
      { name: 'c', kind: 'buried-deprecated' },
      { name: 'd', kind: 'dormant' },
      { name: 'e', kind: 'alive' },
    ]);
    const dead = rows.filter((r) => r.kind === 'tombstone' || r.kind === 'overgrown');
    expect(dead).toHaveLength(3);
    const scores = dead.map((r) => r.score as number);
    expect(scores).toEqual([...scores].sort((x, y) => y - x));
    expect(new Set(scores).size).toBeGreaterThan(1);
  });

  it('breaks score ties by ecosystem then name by code point', () => {
    const rows = rowsOf([
      { name: 'zeta', kind: 'buried', ecosystem: 'npm' },
      { name: 'alpha', kind: 'buried', ecosystem: 'pypi' },
      { name: 'beta', kind: 'buried', ecosystem: 'npm' },
      { name: 'gamma', kind: 'buried', ecosystem: 'cargo' },
    ]);
    expect(rows.map((r) => `${r.ecosystem}/${r.name}`)).toEqual([
      'cargo/gamma',
      'npm/beta',
      'npm/zeta',
      'pypi/alpha',
    ]);
  });
});

describe('compareCodePoints parity with core', () => {
  const samples = ['', 'a', 'B', 'ab', 'abc', 'é', 'z', '\uffff', '😀', '\u{10000}', 'a😀', 'a\uffff', '日本', 'Z'];
  it('returns the same sign as core for every pair', () => {
    for (const a of samples) {
      for (const b of samples) {
        expect(Math.sign(compareCodePoints(a, b))).toBe(Math.sign(coreCompare(a, b)));
      }
    }
  });
  it('orders astral code points after the BMP top, unlike UTF-16 order', () => {
    expect(compareCodePoints('😀', '\uffff')).toBeGreaterThan(0);
  });
});
