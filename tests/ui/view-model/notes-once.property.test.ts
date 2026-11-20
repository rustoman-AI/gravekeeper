// Feature: graveyard-art, Property GA-P13
// Validates: Requirements 11.6, 11.8
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildNotesModel } from '../../../view-model/notes';
import { parseScanResponse } from '../../../view-model/parse-response';
import type { ParsedScanResult } from '../../../view-model/types';
import { cfg } from '../../support/fc-config';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';

// A small shared pool so that notes of other codes often carry the same text as the empty message.
const POOL = ['No manifests were found on the plot map', 'The plot is bare', 'same text', '', 'Other'];
const arbMessage = fc.oneof(fc.constantFrom(...POOL), fc.string({ maxLength: 30 }));
const arbCode = fc.oneof(
  fc.constantFrom('no-manifests', 'no-root-manifest', 'dependency-cap-exceeded', 'source-failed', 'tree-truncated'),
  fc.constantFrom('github-token-missing', 'package-not-found', 'made-up-code', 'other', ''),
  fc.stringMatching(/^[a-z]+(-[a-z]+){0,2}$/),
);
const arbNotes = fc.array(fc.record({ code: arbCode, message: arbMessage }), { maxLength: 30 });

function parsedWith(generated: unknown, notes: readonly { code: string; message: string }[]): ParsedScanResult {
  const wire = JSON.parse(JSON.stringify(generated)) as Record<string, unknown>;
  wire['notes'] = notes.map((n) => ({ code: n.code, message: n.message }));
  const outcome = parseScanResponse(200, { get: () => null }, wire);
  if (outcome.kind !== 'result') throw new Error(`generated result did not parse: ${outcome.kind}`);
  return outcome.result;
}

const sorted = (xs: readonly string[]): string[] => [...xs].sort();

describe('GA-P13: The empty-graveyard message appears once', () => {
  it('GA-P13 shows empty.message once in the empty block and nowhere in the groups; other notes stay once', () => {
    fc.assert(
      fc.property(arbScanResult(), arbNotes, (generated, notes) => {
        const result = parsedWith(generated, notes);
        const model = buildNotesModel(result);
        const allGroupMessages = model.sections.flatMap((s) => s.groups.flatMap((g) => [...g.messages]));

        if (model.empty === null) {
          // Nothing is removed without an empty block.
          expect(sorted(allGroupMessages)).toEqual(sorted(result.notes.map((n) => n.message)));
        } else {
          const msg = model.empty.message;
          // Empty message occurs once overall: in the empty block, never in a group.
          expect(allGroupMessages.filter((m) => m === msg)).toHaveLength(0);
          const expected = result.notes.filter((n) => n.message !== msg).map((n) => n.message);
          expect(allGroupMessages).toHaveLength(result.notes.length - result.notes.filter((n) => n.message === msg).length);
          expect(sorted(allGroupMessages)).toEqual(sorted(expected));
        }

        // Counts consistent, no empty groups or sections.
        for (const s of model.sections) {
          expect(s.groups.length).toBeGreaterThan(0);
          for (const g of s.groups) {
            expect(g.count).toBe(g.messages.length);
            expect(g.count).toBeGreaterThan(0);
            expect(g.previewCount).toBe(Math.min(5, g.count));
          }
        }

        // Picker and cap banner do not depend on the removal.
        expect(model.picker !== null).toBe(result.notes.some((n) => n.code === 'no-root-manifest'));
        const skipped = result.capped.skipped.length;
        if (skipped === 0) expect(model.capBanner).toBeNull();
        else {
          expect(model.capBanner?.skippedCount).toBe(skipped);
          const cap = result.notes.find((n) => n.code === 'dependency-cap-exceeded');
          expect(model.capBanner?.message).toBe(cap?.message ?? 'Some dependencies were not assessed');
        }
      }),
      cfg(),
    );
  });
});
