// Feature: graveyard-ui, Property 6: Model values are JSON-safe
// **Validates: Requirements 6.7**
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { ScanResult } from '../../../pipeline/scan/types';
import { buildHeaderModel } from '../../../view-model/header';
import { buildNotesModel } from '../../../view-model/notes';
import { buildPackageRows } from '../../../view-model/package-rows';
import { parseScanResponse } from '../../../view-model/parse-response';
import { buildSceneModel } from '../../../view-model/scene';
import { buildTableModel } from '../../../view-model/table';
import type { TableColumnKey, TableSort } from '../../../view-model/types';
import { cfg } from '../../support/fc-config';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';

const headers = { get: (): string | null => null };
const COLUMN_KEYS: readonly TableColumnKey[] = ['name', 'ecosystem', 'status', 'score', 'reason', 'scopes', 'version'];

const arbSort = fc.option(
  fc.record({
    column: fc.constantFrom(...COLUMN_KEYS),
    direction: fc.constantFrom('asc' as const, 'desc' as const),
  }),
  { nil: null },
) as fc.Arbitrary<TableSort | null>;

/** Independent walk: returns "path: problem" for the first non-JSON value, or null. */
function findIssue(value: unknown, path: string, ancestors: readonly object[]): string | null {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? null : `${path}: non-finite number ${String(value)}`;
  if (value === undefined) return `${path}: undefined`;
  if (typeof value !== 'object') return `${path}: ${typeof value}`;
  if (ancestors.includes(value)) return `${path}: cycle`;
  const next = [...ancestors, value];
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (!(i in value)) return `${path}[${i}]: array hole`;
      const issue = findIssue(value[i], `${path}[${i}]`, next);
      if (issue !== null) return issue;
    }
    return null;
  }
  const proto = Object.getPrototypeOf(value) as unknown;
  if (proto !== Object.prototype && proto !== null) return `${path}: non-plain object (${Object.prototype.toString.call(value)})`;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === 'symbol') return `${path}: symbol key`;
    const issue = findIssue((value as Record<string, unknown>)[key], `${path}.${key}`, next);
    if (issue !== null) return issue;
  }
  return null;
}

describe('P6 Model values are JSON-safe', () => {
  it('P6 scene, table, header and notes models are plain JSON values that round-trip unchanged', () => {
    fc.assert(
      fc.property(arbScanResult({ large: true }), arbSort, fc.integer({ min: 2, max: 20 }), (result: ScanResult, sort, columns) => {
        const out = parseScanResponse(200, headers, JSON.parse(JSON.stringify(result)));
        expect(out.kind).toBe('result');
        if (out.kind !== 'result') return;
        const rows = buildPackageRows(out.result);
        const models: Record<string, unknown> = {
          scene: buildSceneModel(rows, columns),
          table: buildTableModel(rows, sort),
          header: buildHeaderModel(out.result, rows),
          notes: buildNotesModel(out.result),
        };
        for (const [name, model] of Object.entries(models)) {
          // Check 1: independent walk.
          const issue = findIssue(model, name, []);
          expect(issue, `walk check found: ${issue ?? ''}`).toBeNull();
          // Check 2: round-trip (strict, so undefined-valued keys are caught).
          expect(JSON.parse(JSON.stringify(model)), `round-trip check failed for ${name}`).toStrictEqual(model);
        }
      }),
      cfg(),
    );
  });
});
