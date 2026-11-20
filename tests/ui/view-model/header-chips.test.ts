import { describe, expect, it } from 'vitest';
import { buildHeaderModel } from '../../../view-model/header';
import { buildPackageRows } from '../../../view-model/package-rows';
import type { ParsedScanResult } from '../../../view-model/types';
import { buildScanResult } from '../../support/ui/scan-result-builder';
import type { PlotCase, RowSpec } from '../../support/ui/scan-result-builder';

// Graveyard-art Requirements 5.4, 5.5, 5.9.
const specsOf = (counts: Partial<Record<PlotCase, number>>): RowSpec[] =>
  Object.entries(counts).flatMap(([kind, n]) =>
    Array.from({ length: n }, (_, i) => ({ name: `${kind}-${i}`, kind: kind as PlotCase })),
  );
const headerOf = (counts: Partial<Record<PlotCase, number>>) => {
  const result = buildScanResult(specsOf(counts)) as unknown as ParsedScanResult;
  return { result, header: buildHeaderModel(result, buildPackageRows(result)) };
};

describe('header chips', () => {
  it('has four chips in the order dead, haunted, alive, unassessed with the texts of the requirement', () => {
    const { header } = headerOf({ buried: 2, forgotten: 3, haunted: 4, alive: 5, 'unassessed-git': 1 });
    expect(header.chips.map((c) => c.status)).toEqual(['dead', 'haunted', 'alive', 'unassessed']);
    expect(header.chips.map((c) => c.text)).toEqual([
      '5 dead (2 buried, 3 forgotten)',
      '4 haunted',
      '5 alive',
      '1 unassessed',
    ]);
  });

  it('takes its counts from the summary', () => {
    const { result, header } = headerOf({ buried: 1, forgotten: 2, haunted: 3, alive: 4 });
    const { counts, unassessed } = result.summary;
    expect(header.chips.map((c) => c.text)).toEqual([
      `${counts.DEAD} dead (1 buried, 2 forgotten)`,
      `${counts.HAUNTED} haunted`,
      `${counts.ALIVE} alive`,
      `${unassessed} unassessed`,
    ]);
  });

  it('has no chips when nothing was assessed', () => {
    expect(headerOf({}).header.chips).toEqual([]);
  });
});
