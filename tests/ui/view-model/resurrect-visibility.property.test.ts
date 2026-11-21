// Feature: resurrect, Property RS-P2: The slot exists exactly for DEAD packages and restless ghosts
// Validates: Requirements 9.1, 9.2
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildResurrectModel } from '../../../view-model/resurrect';
import type { PackageRow, ParsedScanResult, PlotKind } from '../../../view-model/types';
import { arbEcosystem, arbHint, makeRow } from '../../support/arbitraries/resurrect';
import { cfg } from '../../support/fc-config';
import { buildScanResult, PLOT_CASES } from '../../support/ui/scan-result-builder';

const emptyResult = buildScanResult([]) as unknown as ParsedScanResult;
const PLOT_KINDS: readonly PlotKind[] = ['tombstone', 'overgrown', 'ghost', 'restless', 'lantern', 'unmarked'];

// Oracle, written here: a slot exists iff the status is DEAD or the plot kind is restless.
const expectsSlot = (row: PackageRow): boolean => row.classification?.status === 'DEAD' || row.kind === 'restless';

const arbCaseRow = fc
  .record({
    ecosystem: arbEcosystem,
    plotCase: fc.constantFrom(...PLOT_CASES),
    name: fc.constantFrom('request', 'got', 'bincode', 'a-b', 'x'),
    hints: fc.array(arbHint, { maxLength: 3 }),
    openVulnerabilityCount: fc.option(fc.integer({ min: -2, max: 50 }), { nil: null }),
  })
  .map((o) => makeRow(o));

// Plot kind drawn independently of the classification, so every (status, kind) pair occurs,
// including unassessed rows (null classification) with every kind.
const arbCrossRow = fc
  .tuple(arbCaseRow, fc.constantFrom(...PLOT_KINDS))
  .map(([row, kind]) => ({ ...row, kind }) as PackageRow);

describe('RS-P2 resurrect visibility property', () => {
  it('RS-P2: for every plot case the model is non-null iff status is DEAD or kind is restless', () => {
    fc.assert(
      fc.property(arbCaseRow, (row) => {
        const model = buildResurrectModel(row, emptyResult);
        expect(model !== null).toBe(expectsSlot(row));
      }),
      cfg(),
    );
  });

  it('RS-P2: the rule holds for every combination of classification and plot kind', () => {
    fc.assert(
      fc.property(arbCrossRow, (row) => {
        const model = buildResurrectModel(row, emptyResult);
        expect(model !== null).toBe(expectsSlot(row));
      }),
      cfg(),
    );
  });

  it('RS-P2: every plot case and plot kind is exercised, with and without a slot', () => {
    const kinds = new Set<PlotKind>();
    const statuses = new Set<string>();
    let unassessed = 0;
    for (const plotCase of PLOT_CASES) {
      const row = makeRow({ plotCase });
      kinds.add(row.kind);
      statuses.add(row.classification?.status ?? 'none');
      if (row.classification === null) unassessed += 1;
      expect(buildResurrectModel(row, emptyResult) !== null).toBe(expectsSlot(row));
    }
    expect([...kinds].sort()).toEqual([...PLOT_KINDS].sort());
    expect([...statuses].sort()).toEqual(['ALIVE', 'DEAD', 'HAUNTED', 'none']);
    expect(unassessed).toBeGreaterThan(0);
  });
});
