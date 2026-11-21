// Feature: graveyard-ui, Property 5: Buried plus forgotten plus haunted equals the headline total, and the headline text matches
// Validates: Requirements 5.2, 5.10
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Classification, Reason, RuleId } from '../../../core';
import { buildHeaderModel } from '../../../view-model/header';
import { buildPackageRows } from '../../../view-model/package-rows';
import { parseScanResponse } from '../../../view-model/parse-response';
import type { ScanResult } from '../../../pipeline/scan/types';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';
import { cfg } from '../../support/fc-config';

const headers = { get: (): string | null => null };

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

/** Gives every assessed dependency an arbitrary combination of 8.1, 8.2 and 8.3 (restless ghosts included). */
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

/** Independent oracle: the eight part combinations, keyed by which of B, F, H are above 0. */
const TAILS: Readonly<Record<string, (b: number, f: number, h: number) => string>> = {
  '000': () => '.',
  '100': (b) => `: ${b} buried.`,
  '010': (_b, f) => `: ${f} forgotten.`,
  '001': (_b, _f, h) => `: ${h} haunted.`,
  '110': (b, f) => `: ${b} buried, ${f} forgotten.`,
  '101': (b, _f, h) => `: ${b} buried, ${h} haunted.`,
  '011': (_b, f, h) => `: ${f} forgotten, ${h} haunted.`,
  '111': (b, f, h) => `: ${b} buried, ${f} forgotten, ${h} haunted.`,
};

function oracle(n: number, m: number, b: number, f: number, h: number): string {
  const key = `${b > 0 ? 1 : 0}${f > 0 ? 1 : 0}${h > 0 ? 1 : 0}`;
  // R20: the noun agrees with m and the verb with n; only 1 takes the singular (is / dependency).
  return `${n} of ${m} ${m === 1 ? 'dependency' : 'dependencies'} ${n === 1 ? 'is' : 'are'} in the graveyard${TAILS[key](b, f, h)}`;
}

describe('P5: Buried plus forgotten plus haunted equals the headline total, and the headline text matches', () => {
  it('P5 B + F = DEAD, H = HAUNTED, N = B + F + H, and the text equals the oracle', () => {
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
          const model = buildHeaderModel(parsed, rows);

          if (parsed.summary.assessed === 0) {
            expect(model.headline).toBeNull();
            return;
          }
          const headline = model.headline;
          expect(headline).not.toBeNull();
          if (headline === null) return;

          const { buried: b, forgotten: f, haunted: h, n, m, text } = headline;
          for (const v of [b, f, h, n, m]) {
            expect(Number.isInteger(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(0);
          }
          expect(b + f).toBe(parsed.summary.counts.DEAD);
          expect(h).toBe(parsed.summary.counts.HAUNTED);
          expect(n).toBe(b + f + h);
          expect(m).toBe(parsed.summary.assessed);

          // Restless ghosts are counted in H and not in B.
          const restless = rows.filter((r) => r.kind === 'restless').length;
          expect(rows.filter((r) => r.graveType === 'buried').length).toBe(b);
          expect(h).toBeGreaterThanOrEqual(restless);

          expect(text).toBe(oracle(n, m, b, f, h));
        },
      ),
      cfg(),
    );
  });
});
