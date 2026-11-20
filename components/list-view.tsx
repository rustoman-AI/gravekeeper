'use client';

import { useMemo, useState } from 'react';
import { buildTableModel } from '../view-model/index';
import type { PackageKeyString, PackageRow, TableColumnKey, TableSort } from '../view-model/index';

export interface ListViewProps {
  rows: readonly PackageRow[];
  /** Called with the row's package key when its name button is activated. */
  onOpen: (key: PackageKeyString) => void;
}

/** Requirement 18.4: a first click sorts ascending, a click on the sorted column flips the direction. */
function nextSort(current: TableSort | null, column: TableColumnKey): TableSort {
  if (current !== null && current.column === column) {
    return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { column, direction: 'asc' };
}

/** Requirements 16.7, 17.7, 18.2, 18.4, 18.6, 18.8: a native, sortable table of every row, no pagination. */
export function ListView({ rows, onOpen }: ListViewProps) {
  const [sort, setSort] = useState<TableSort | null>(null);
  const model = useMemo(() => buildTableModel(rows, sort), [rows, sort]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-bone">
        <caption className="pb-2 text-left text-bone-muted">{model.caption}</caption>
        <thead>
          <tr className="border-b border-bone-muted">
            {model.columns.map((column) => (
              <th key={column.key} scope="col" aria-sort={column.ariaSort} className="p-0 font-semibold">
                <button
                  type="button"
                  onClick={() => setSort((current) => nextSort(current, column.key))}
                  className="min-h-11 w-full px-3 py-2 text-left font-semibold text-bone hover:bg-night-raised"
                >
                  {column.label}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row) => (
            <tr key={row.key} className="border-b border-bone-muted/40">
              <td className="p-0">
                <button
                  type="button"
                  onClick={() => onOpen(row.key)}
                  className="min-h-11 px-3 py-2 text-left font-semibold text-amber underline hover:bg-night-raised"
                >
                  {row.name}
                </button>
              </td>
              <td className="px-3 py-2">{row.ecosystem}</td>
              <td className="px-3 py-2">{row.statusWord}</td>
              <td className="px-3 py-2">{row.scoreText}</td>
              <td className="px-3 py-2">{row.reasonText}</td>
              <td className="px-3 py-2">{row.scopesText}</td>
              <td className="px-3 py-2">{row.versionText}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
