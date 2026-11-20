// Feature: graveyard-ui, Property 16: Scene is deterministic and independent of input order
// Validates: Requirements 8.2, 8.13
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildPackageRows } from '../../../view-model/package-rows';
import { parseScanResponse } from '../../../view-model/parse-response';
import { buildSceneModel } from '../../../view-model/scene';
import type { ParsedScanResult } from '../../../view-model/types';
import type { ScanResult } from '../../../pipeline/scan/types';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';
import { cfg } from '../../support/fc-config';

const headers = { get: (): string | null => null };

function rotate<T>(items: readonly T[], offset: number): T[] {
  if (items.length === 0) return [];
  const k = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(k), ...items.slice(0, k)];
}

function parse(body: unknown): ParsedScanResult {
  const out = parseScanResponse(200, headers, body);
  expect(out.kind).toBe('result');
  if (out.kind !== 'result') throw new Error('response did not parse');
  return out.result;
}

describe('P16 Scene is deterministic and independent of input order', () => {
  it('P16 builds equal scenes twice and after rotating dependencies and assessed together', () => {
    fc.assert(
      fc.property(
        arbScanResult({ large: true }),
        fc.integer({ min: 2, max: 20 }),
        fc.nat({ max: 10000 }),
        (result: ScanResult, columns: number, offset: number) => {
          const body = JSON.parse(JSON.stringify(result)) as Record<string, unknown>;
          const parsed = parse(body);

          const first = buildSceneModel(buildPackageRows(parsed), columns);
          const second = buildSceneModel(buildPackageRows(parsed), columns);
          expect(second).toEqual(first);

          const rotated = parse({
            ...body,
            dependencies: rotate(body['dependencies'] as unknown[], offset),
            assessed: rotate(body['assessed'] as unknown[], offset),
          });
          const third = buildSceneModel(buildPackageRows(rotated), columns);
          expect(third).toEqual(first);
        },
      ),
      cfg(),
    );
  }, 600_000);
});
