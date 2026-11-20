import { describe, expect, it } from 'vitest';
import { buildPackageRows } from '../../../view-model/package-rows';
import { buildTableModel } from '../../../view-model/table';
import type { PackageRow, ParsedScanResult, TableColumnKey, TableRowModel } from '../../../view-model/types';
import { buildScanResult } from '../../support/ui/scan-result-builder';
import type { RowSpec } from '../../support/ui/scan-result-builder';

const rowsOf = (specs: readonly RowSpec[]): readonly PackageRow[] =>
  buildPackageRows(buildScanResult(specs) as unknown as ParsedScanResult);

const names = (rows: readonly TableRowModel[]): string[] => rows.map((r) => r.name);

const MIXED: readonly RowSpec[] = [
  { name: 'delta', kind: 'alive', ecosystem: 'npm', scope: 'dev' },
  { name: 'alpha', kind: 'buried', ecosystem: 'cargo', scope: 'runtime' },
  { name: 'charlie', kind: 'haunted', ecosystem: 'pypi', scope: 'build' },
  { name: 'bravo', kind: 'unassessed-git', ecosystem: 'npm', scope: 'optional' },
  { name: 'echo', kind: 'dormant', ecosystem: 'cargo', scope: 'peer' },
];

describe('column labels (R18.3)', () => {
  it('lists the seven columns in order with their labels', () => {
    const model = buildTableModel(rowsOf(MIXED), null);
    expect(model.columns.map((c) => c.label)).toEqual([
      'Package',
      'Ecosystem',
      'Status',
      'Score',
      'Main reason',
      'Scopes',
      'Checked version',
    ]);
    expect(model.columns.map((c) => c.key)).toEqual([
      'name',
      'ecosystem',
      'status',
      'score',
      'reason',
      'scopes',
      'version',
    ]);
  });
});

describe('sorting each column (R18.4, R18.5)', () => {
  const rows = rowsOf(MIXED);
  const sceneNames = names(buildTableModel(rows, null).rows);

  it('returns scene order when no sort is given', () => {
    expect(sceneNames).toEqual(rows.map((r) => r.displayName));
  });

  it('sorts name ascending and descending by code point', () => {
    expect(names(buildTableModel(rows, { column: 'name', direction: 'asc' }).rows)).toEqual([
      'alpha',
      'bravo',
      'charlie',
      'delta',
      'echo',
    ]);
    expect(names(buildTableModel(rows, { column: 'name', direction: 'desc' }).rows)).toEqual([
      'echo',
      'delta',
      'charlie',
      'bravo',
      'alpha',
    ]);
  });

  it('sorts ecosystem both ways with scene order as tiebreaker', () => {
    const asc = buildTableModel(rows, { column: 'ecosystem', direction: 'asc' }).rows;
    expect(asc.map((r) => r.ecosystem)).toEqual(['cargo', 'cargo', 'npm', 'npm', 'pypi']);
    const desc = buildTableModel(rows, { column: 'ecosystem', direction: 'desc' }).rows;
    expect(desc.map((r) => r.ecosystem)).toEqual(['pypi', 'npm', 'npm', 'cargo', 'cargo']);
    const inScene = (eco: string, list: readonly TableRowModel[]): string[] =>
      names(list.filter((r) => r.ecosystem === eco));
    expect(inScene('cargo', asc)).toEqual(sceneNames.filter((n) => ['alpha', 'echo'].includes(n)));
    expect(inScene('cargo', desc)).toEqual(sceneNames.filter((n) => ['alpha', 'echo'].includes(n)));
  });

  it('sorts score numerically with unassessed last in both directions', () => {
    const asc = buildTableModel(rows, { column: 'score', direction: 'asc' }).rows;
    const desc = buildTableModel(rows, { column: 'score', direction: 'desc' }).rows;
    const scores = (list: readonly TableRowModel[]): (number | null)[] => list.map((r) => r.score);
    const numeric = (list: readonly TableRowModel[]): number[] =>
      scores(list).filter((s): s is number => s !== null);
    const a = numeric(asc);
    const d = numeric(desc);
    expect(a).toEqual([...a].sort((x, y) => x - y));
    expect(d).toEqual([...d].sort((x, y) => y - x));
    expect(scores(asc)[4]).toBeNull();
    expect(scores(desc)[4]).toBeNull();
  });

  it('sorts status by the status rank of the scene order', () => {
    const asc = buildTableModel(rows, { column: 'status', direction: 'asc' }).rows;
    const desc = buildTableModel(rows, { column: 'status', direction: 'desc' }).rows;
    expect(asc[asc.length - 1]!.statusWord).toBe('not assessed');
    expect(desc[0]!.statusWord).toBe('not assessed');
    expect(names(desc).slice().reverse().sort()).toEqual(names(asc).slice().sort());
  });

  it('sorts main reason by code point', () => {
    const asc = buildTableModel(rows, { column: 'reason', direction: 'asc' }).rows.map((r) => r.reasonText);
    const sorted = rows.map((r) => r.epitaphShort).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    expect(asc).toEqual(sorted);
    const desc = buildTableModel(rows, { column: 'reason', direction: 'desc' }).rows.map((r) => r.reasonText);
    expect(desc).toEqual([...sorted].reverse());
  });

  it('sorts scopes by the joined scope text', () => {
    const asc = buildTableModel(rows, { column: 'scopes', direction: 'asc' }).rows.map((r) => r.scopesText);
    expect(asc).toEqual(['build', 'dev', 'optional', 'peer', 'runtime']);
    const desc = buildTableModel(rows, { column: 'scopes', direction: 'desc' }).rows.map((r) => r.scopesText);
    expect(desc).toEqual(['runtime', 'peer', 'optional', 'dev', 'build']);
  });

  it('joins merged scopes in SCOPE_ORDER', () => {
    const merged = rowsOf([
      { name: 'dup', kind: 'alive', scope: 'peer' },
      { name: 'dup', kind: 'alive', scope: 'dev' },
      { name: 'dup', kind: 'alive', scope: 'runtime' },
    ]);
    expect(buildTableModel(merged, null).rows[0]!.scopesText).toBe('runtime, dev, peer');
  });

  it('sorts version by text with unknown last in both directions', () => {
    const vrows = rowsOf([
      { name: 'v-b', kind: 'alive' },
      { name: 'v-git', kind: 'unassessed-git' },
      { name: 'v-a', kind: 'alive' },
    ]);
    for (const direction of ['asc', 'desc'] as const) {
      const out = buildTableModel(vrows, { column: 'version', direction }).rows;
      expect(out[out.length - 1]!.name).toBe('v-git');
      expect(out[out.length - 1]!.versionText).toBe('unknown');
    }
  });
});

describe('aria-sort (R18.4)', () => {
  const columns: TableColumnKey[] = ['name', 'ecosystem', 'status', 'score', 'reason', 'scopes', 'version'];
  it.each(columns.flatMap((c) => [[c, 'asc'] as const, [c, 'desc'] as const]))(
    'marks only the %s header when sorted %s',
    (column, direction) => {
      const model = buildTableModel(rowsOf(MIXED), { column, direction });
      for (const col of model.columns) {
        if (col.key === column) {
          expect(col.ariaSort).toBe(direction === 'asc' ? 'ascending' : 'descending');
        } else {
          expect(col.ariaSort).toBe('none');
        }
      }
    },
  );

  it('marks no header without a sort', () => {
    const model = buildTableModel(rowsOf(MIXED), null);
    expect(model.columns.every((c) => c.ariaSort === 'none')).toBe(true);
  });
});

describe('cell texts (R18.7)', () => {
  it('shows "not assessed" for an unmarked grave score, never 0', () => {
    const row = buildTableModel(rowsOf([{ name: 'gitty', kind: 'unassessed-git' }]), null).rows[0]!;
    expect(row.score).toBeNull();
    expect(row.scoreText).toBe('not assessed');
    expect(row.scoreText).not.toBe('0');
  });

  it('shows the number for an assessed package', () => {
    const row = buildTableModel(rowsOf([{ name: 'fine', kind: 'alive' }]), null).rows[0]!;
    expect(row.scoreText).toBe(String(row.score));
  });

  it('shows "unknown" for an unknown version', () => {
    const row = buildTableModel(rowsOf([{ name: 'gitty', kind: 'unassessed-git' }]), null).rows[0]!;
    expect(row.versionText).toBe('unknown');
  });

  it('shows the version with its basis', () => {
    const row = buildTableModel(rowsOf([{ name: 'p', kind: 'alive', versionBasis: 'pinned' }]), null).rows[0]!;
    expect(row.versionText).toContain('1.0.0');
    expect(row.versionText).toContain('pinned');
  });

  it('gives a restless row the status text "haunted, buried"', () => {
    const rows = buildTableModel(rowsOf([{ name: 'rest', kind: 'restless-archived' }]), null).rows;
    expect(rows[0]!.statusWord).toBe('haunted, buried');
  });
});

describe('tie order (R18.5)', () => {
  it('keeps scene order for equal keys in both directions', () => {
    const rows = rowsOf([
      { name: 'one', kind: 'alive' },
      { name: 'two', kind: 'alive' },
      { name: 'three', kind: 'alive' },
      { name: 'four', kind: 'alive' },
    ]);
    const scene = rows.map((r) => r.displayName);
    for (const direction of ['asc', 'desc'] as const) {
      expect(names(buildTableModel(rows, { column: 'ecosystem', direction }).rows)).toEqual(scene);
      expect(names(buildTableModel(rows, { column: 'status', direction }).rows)).toEqual(scene);
    }
  });
});
