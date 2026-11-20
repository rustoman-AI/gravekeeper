import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseScanResponse } from '../../../view-model/parse-response';
import type { HeaderReader } from '../../../view-model/types';
import { cfg } from '../../support/fc-config';
import { arbScanResult } from '../../support/ui/scan-result-arbitrary';

const KINDS = ['result', 'error', 'failure'];

const arbHeaderValue = fc.oneof(
  fc.constantFrom('hit', 'miss', '1', '86400', '0', '-1', '99999999999', ''),
  fc.string({ maxLength: 20 }),
);
const arbHeaders: fc.Arbitrary<HeaderReader> = fc.oneof(
  fc.constant<HeaderReader>({ get: () => null }),
  fc.constant<HeaderReader>({
    get: () => {
      throw new Error('boom');
    },
  }),
  fc.dictionary(fc.constantFrom('x-cache-status', 'retry-after', 'Retry-After'), arbHeaderValue).map(
    (d): HeaderReader => ({ get: (name) => d[name] ?? null }),
  ),
);

const arbStatus = fc.oneof(
  fc.constantFrom(200, 400, 404, 429, 500, 502, 504),
  fc.integer({ min: -5, max: 1000 }),
  fc.double({ noDefaultInfinity: false }),
);

function nested(depth: number, leaf: unknown): unknown {
  let v: unknown = leaf;
  for (let i = 0; i < depth; i++) v = i % 2 === 0 ? { k: v } : [v];
  return v;
}

const arbDeep: fc.Arbitrary<unknown> = fc
  .tuple(fc.integer({ min: 0, max: 20000 }), fc.jsonValue())
  .map(([d, leaf]) => nested(d, leaf));
const arbHuge: fc.Arbitrary<unknown> = fc
  .tuple(fc.integer({ min: 1, max: 2_000_000 }), fc.constantFrom('a', '\u0000', '\u{1F480}'))
  .map(([n, c]) => ({ ok: false, error: { code: 'internal-error', message: c.repeat(n) } }));
const arbWrongType: fc.Arbitrary<unknown> = fc.anything({ withNullPrototype: true, withBigInt: true, withDate: true });
const arbOkEnvelope: fc.Arbitrary<unknown> = fc.record(
  {
    ok: fc.oneof(fc.boolean(), fc.anything()),
    error: fc.anything(),
    asOf: fc.anything(),
    repo: fc.anything(),
    discovery: fc.anything(),
    summary: fc.anything(),
    capped: fc.anything(),
    manifests: fc.anything(),
    assessed: fc.anything(),
    notes: fc.anything(),
    dependencies: fc.anything(),
    sources: fc.anything(),
  },
  { requiredKeys: [] },
);
const arbMutatedResult: fc.Arbitrary<unknown> = fc
  .tuple(arbScanResult(), fc.constantFrom(...['asOf', 'repo', 'summary', 'sources', 'dependencies', 'assessed', 'notes', 'ok']), fc.anything(), fc.boolean())
  .map(([result, key, replacement, drop]) => {
    const copy = JSON.parse(JSON.stringify(result)) as Record<string, unknown>;
    if (drop) delete copy[key];
    else copy[key] = replacement;
    return copy;
  });
const arbBody: fc.Arbitrary<unknown> = fc.oneof(
  arbWrongType,
  arbDeep,
  arbHuge,
  arbOkEnvelope,
  arbMutatedResult,
  arbScanResult().map((r) => JSON.parse(JSON.stringify(r)) as unknown),
);

describe('Property 27: Response parsing is total', () => {
  // Feature: graveyard-ui, Property 27: Response parsing is total
  // Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.7
  it('P27: returns exactly one of result, error or failure and never throws', () => {
    fc.assert(
      fc.property(arbStatus, arbHeaders, arbBody, (status, headers, body) => {
        const outcome = parseScanResponse(status, headers, body);
        expect(KINDS).toContain(outcome.kind);
        expect(KINDS.filter((k) => k === outcome.kind)).toHaveLength(1);
        if (outcome.kind === 'failure') expect(outcome.failure.kind).toBe('malformed-response');
      }),
      cfg({ numRuns: Number(process.env.FC_NUM_RUNS ?? 100) }),
    );
  });
});
