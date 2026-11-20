// Feature: graveyard-ui, Property 13: Graves partition the dead packages and restless ghosts are haunted
// Validates: Requirements 7.15, 7.16, 7.18, 7.20, 7.21
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Classification, Reason, RuleId } from '../../../core';
import { uniquePackages } from '../../../core';
import { buildPackageRows } from '../../../view-model/package-rows';
import { parseScanResponse } from '../../../view-model/parse-response';
import type { ScanResult } from '../../../pipeline/scan/types';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';
import { cfg } from '../../support/fc-config';

const headers = { get: (): string | null => null };

const BURIAL_IDS: readonly string[] = ['8.1', '8.2'];
const GHOST_IDS: readonly RuleId[] = ['8.1', '8.2', '8.3'] as unknown as readonly RuleId[];

const isGhostId = (id: string): boolean => id === '8.1' || id === '8.2' || id === '8.3';

/** Replaces the 8.x reasons of a classification with the subset selected by the low three bits of `mask`. */
function withGhostReasons(c: Classification | null, mask: number): Classification | null {
  if (c === null) return c;
  const kept = c.reasons.filter((r) => !isGhostId(r.ruleId));
  const added: Reason[] = GHOST_IDS.filter((_, bit) => (mask & (1 << bit)) !== 0).map((ruleId) => ({
    ruleId,
    message: `Synthetic reason ${ruleId}.`,
    facts: [],
  }));
  const reasons = [...kept, ...added].sort((a, b) => {
    const [ar = 0, ac = 0] = a.ruleId.split('.').map(Number);
    const [br = 0, bc = 0] = b.ruleId.split('.').map(Number);
    return ar - br || ac - bc;
  });
  return { ...c, reasons };
}

/** Gives every assessed dependency an arbitrary combination of 8.1, 8.2 and 8.3. Statuses and counts are unchanged. */
function withEveryCombination(result: ScanResult, masks: readonly number[]): ScanResult {
  if (masks.length === 0) return result;
  return {
    ...result,
    assessed: result.assessed.map((a, i) => ({
      ...a,
      classification: withGhostReasons(a.classification, masks[i % masks.length]),
    })),
  };
}

describe('P13: Graves partition the dead packages and restless ghosts are haunted', () => {
  it('P13 buried plus forgotten equal DEAD, only dead plots have a grave, and restless ghosts are exactly the haunted with 8.1 or 8.2', () => {
    fc.assert(
      fc.property(
        arbScanResult(),
        fc.array(fc.nat({ max: 7 }), { minLength: 1, maxLength: 64 }),
        (generated: ScanResult, masks: number[]) => {
          const out = parseScanResponse(200, headers, JSON.parse(JSON.stringify(withEveryCombination(generated, masks))));
          expect(out.kind).toBe('result');
          if (out.kind !== 'result') return;
          const parsed = out.result;
          const rows = buildPackageRows(parsed);
          const statusByKey = new Map(
            uniquePackages(parsed.assessed).map(
              (g) => [JSON.stringify([g.ecosystem, g.name, g.sourceKind]), g.classification?.status ?? null] as const,
            ),
          );

          const count = (pred: (r: (typeof rows)[number]) => boolean): number => rows.filter(pred).length;
          expect(count((r) => r.graveType === 'buried') + count((r) => r.graveType === 'forgotten')).toBe(
            parsed.summary.counts.DEAD,
          );
          expect(count((r) => r.kind === 'ghost') + count((r) => r.kind === 'restless')).toBe(
            parsed.summary.counts.HAUNTED,
          );

          for (const row of rows) {
            const ids = (row.classification?.reasons ?? []).map((r) => r.ruleId as string);
            const burial = ids.some((id) => BURIAL_IDS.includes(id));
            const status = statusByKey.get(row.key);

            if (row.kind === 'tombstone' || row.kind === 'overgrown') {
              expect(status).toBe('DEAD');
              expect(row.graveType).toBe(burial ? 'buried' : 'forgotten');
              expect(row.kind).toBe(burial ? 'tombstone' : 'overgrown');
            } else {
              // ghost, restless, lantern and unmarked never have a grave, even with 8.1, 8.2 or 8.3.
              expect(row.graveType).toBeNull();
            }

            if (status === 'HAUNTED') {
              expect(row.kind).toBe(burial ? 'restless' : 'ghost');
            }
            if (row.kind === 'restless') {
              expect(status).toBe('HAUNTED');
              expect(burial).toBe(true);
              expect(row.glow).not.toBeNull();
              expect(row.statusWord).toBe('haunted, buried');
            }
            if (row.kind === 'ghost') {
              expect(burial).toBe(false);
              expect(row.statusWord).not.toBe('haunted, buried');
            }
          }
        },
      ),
      cfg(),
    );
  });
});
