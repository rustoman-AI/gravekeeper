import { compareCodePoints } from './internal/compare-code-points';
import type {
  PackageRow,
  PlotKind,
  TableColumnKey,
  TableModel,
  TableRowModel,
  TableSort,
} from './types';

const UNKNOWN_TEXT = 'unknown';
const NOT_ASSESSED_TEXT = 'not assessed';

const COLUMNS: readonly { readonly key: TableColumnKey; readonly label: string }[] = [
  { key: 'name', label: 'Package' },
  { key: 'ecosystem', label: 'Ecosystem' },
  { key: 'status', label: 'Status' },
  { key: 'score', label: 'Score' },
  { key: 'reason', label: 'Main reason' },
  { key: 'scopes', label: 'Scopes' },
  { key: 'version', label: 'Checked version' },
];

// Same ranks as the scene order (Requirement 7.9).
const KIND_RANK: Readonly<Record<PlotKind, number>> = {
  ghost: 0,
  restless: 0,
  tombstone: 1,
  overgrown: 1,
  lantern: 2,
  unmarked: 3,
};

const BASIS_TEXT = {
  pinned: 'pinned',
  resolved: 'resolved from range',
  default: 'latest',
} as const;

function versionTextOf(row: PackageRow): string {
  if (row.lookupVersion === null) return UNKNOWN_TEXT;
  if (row.versionBasis === null) return row.lookupVersion;
  return `${row.lookupVersion} (${BASIS_TEXT[row.versionBasis]})`;
}

function toRowModel(row: PackageRow): TableRowModel {
  return {
    key: row.key,
    name: row.displayName,
    ecosystem: row.ecosystem,
    statusWord: row.statusWord,
    score: row.score,
    scoreText: row.score === null ? NOT_ASSESSED_TEXT : String(row.score),
    reasonText: row.epitaphShort === '' ? UNKNOWN_TEXT : row.epitaphShort,
    scopesText: row.scopes.length === 0 ? UNKNOWN_TEXT : row.scopes.join(', '),
    versionText: versionTextOf(row),
  };
}

/** Compares two present keys ascending; null handling is done by the caller. */
function compareColumn(column: TableColumnKey, a: PackageRow, b: PackageRow): number {
  switch (column) {
    case 'name':
      return compareCodePoints(a.displayName, b.displayName);
    case 'ecosystem':
      return compareCodePoints(a.ecosystem, b.ecosystem);
    case 'status':
      return (
        KIND_RANK[a.kind] - KIND_RANK[b.kind] || compareCodePoints(a.statusWord, b.statusWord)
      );
    case 'reason':
      return compareCodePoints(a.epitaphShort, b.epitaphShort);
    case 'scopes':
      return compareCodePoints(a.scopes.join(', '), b.scopes.join(', '));
    case 'score':
    case 'version':
      return 0;
  }
}

/** Sorts by a nullable key: `null` is last in both directions. Returns 0 on a tie. */
function compareNullable<T>(
  x: T | null,
  y: T | null,
  direction: 1 | -1,
  cmp: (p: T, q: T) => number,
): number {
  if (x === null) return y === null ? 0 : 1;
  if (y === null) return -1;
  return direction * cmp(x, y);
}

/**
 * Requirements 18.3 to 18.5 and 18.7. `rows` arrive in scene order; the index in `rows`
 * is the stable tiebreaker, always ascending whatever the direction.
 */
export function buildTableModel(rows: readonly PackageRow[], sort: TableSort | null): TableModel {
  const indexed = rows.map((row, index) => ({ row, index }));
  if (sort !== null) {
    const dir: 1 | -1 = sort.direction === 'asc' ? 1 : -1;
    indexed.sort((a, b) => {
      let c: number;
      if (sort.column === 'score') {
        c = compareNullable(a.row.score, b.row.score, dir, (p, q) => p - q);
      } else if (sort.column === 'version') {
        c = compareNullable(a.row.lookupVersion, b.row.lookupVersion, dir, compareCodePoints);
      } else {
        c = dir * compareColumn(sort.column, a.row, b.row);
      }
      return c !== 0 ? c : a.index - b.index;
    });
  }
  return {
    caption: `Dependencies, ${rows.length} unique packages`,
    columns: COLUMNS.map((c) => ({
      key: c.key,
      label: c.label,
      ariaSort:
        sort !== null && sort.column === c.key
          ? sort.direction === 'asc'
            ? 'ascending'
            : 'descending'
          : 'none',
    })),
    rows: indexed.map((x) => toRowModel(x.row)),
  };
}
