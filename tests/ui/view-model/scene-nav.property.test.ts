// Feature: graveyard-ui, Property 18: Keyboard navigation stays on the grid
// Validates: Requirements 9.6, 9.9
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildPackageRows } from '../../../view-model/package-rows';
import { parseScanResponse } from '../../../view-model/parse-response';
import { buildSceneModel } from '../../../view-model/scene';
import { nextFocus } from '../../../view-model/scene-nav';
import type { FocusMove } from '../../../view-model/types';
import type { ScanResult } from '../../../pipeline/scan/types';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';
import { cfg } from '../../support/fc-config';

const headers = { get: (): string | null => null };
const MOVES: readonly FocusMove[] = ['up', 'down', 'left', 'right', 'home', 'end'];

describe('P18 Keyboard navigation stays on the grid', () => {
  it('P18 every move lands on an existing plot, edges keep the index, right then left returns', () => {
    fc.assert(
      fc.property(
        arbScanResult({ large: true }),
        fc.integer({ min: 2, max: 20 }),
        fc.array(fc.constantFrom(...MOVES), { minLength: 1, maxLength: 30 }),
        fc.nat(),
        (result: ScanResult, columns: number, moves: FocusMove[], seed: number) => {
          const out = parseScanResponse(200, headers, JSON.parse(JSON.stringify(result)));
          expect(out.kind).toBe('result');
          if (out.kind !== 'result') return;

          const scene = buildSceneModel(buildPackageRows(out.result), columns);
          const n = scene.plots.length;
          if (n === 0) {
            expect(nextFocus(scene, 0, 'right')).toBe(-1);
            return;
          }

          let current = seed % n;
          for (const move of moves) {
            const next = nextFocus(scene, current, move);
            expect(Number.isInteger(next)).toBe(true);
            expect(next).toBeGreaterThanOrEqual(0);
            expect(next).toBeLessThan(n);

            const row = Math.floor(current / columns);
            const col = current % columns;
            const hasNeighbour: Record<FocusMove, boolean> = {
              left: col > 0,
              right: col < columns - 1 && current + 1 < n,
              up: current - columns >= 0,
              down: current + columns < n,
              home: true,
              end: true,
            };
            if (!hasNeighbour[move]) expect(next).toBe(current);

            if (move === 'right' && hasNeighbour.right) {
              expect(nextFocus(scene, next, 'left')).toBe(current);
            }
            if (move === 'left' && hasNeighbour.left) {
              expect(nextFocus(scene, next, 'right')).toBe(current);
            }
            if (move === 'home') expect(next).toBe(row * columns);
            if (move === 'end') expect(next).toBe(Math.min(row * columns + columns - 1, n - 1));
            current = next;
          }
        },
      ),
      cfg(),
    );
    // FC_NUM_RUNS=1000 takes 20-30 s in a full parallel deep run (CPU contention), near the 30 s default.
  }, 120_000);
});
