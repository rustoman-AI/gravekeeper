// Feature: graveyard-ui, Property 29: Cache status mapping
// Validates: Requirements 14.9, 14.10
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CACHE_STATUS_HEADER } from '../../../pipeline/constants';
import { parseScanResponse } from '../../../view-model/parse-response';
import { cfg } from '../../support/fc-config';

function headers(value: string | undefined) {
  return {
    get: (name: string): string | null =>
      value !== undefined && name.toLowerCase() === CACHE_STATUS_HEADER.toLowerCase() ? value : null,
  };
}

function body(): Record<string, unknown> {
  return {
    ok: true,
    asOf: '2026-01-01T00:00:00Z',
    repo: { host: 'github.com', owner: 'o', repo: 'r', branch: 'main', defaultBranch: 'main' },
    discovery: {},
    manifests: [],
    dependencies: [{ dependency: { name: 'a' }, facts: {}, versionBasis: 'pinned', advisories: [] }],
    assessed: [{}],
    summary: {},
    sources: { github: 'ok', depsdev: 'ok', osv: 'ok', npm: 'ok', cratesio: 'ok', pypi: 'ok' },
    capped: {},
    notes: [],
  };
}

const caseVariants = fc
  .constantFrom('hit', 'miss')
  .chain((word) =>
    fc.tuple(fc.constant(word), fc.array(fc.boolean(), { minLength: word.length, maxLength: word.length })),
  )
  .map(([word, flips]) => [...word].map((c, i) => (flips[i] ? c.toUpperCase() : c)).join(''));
const padded = fc
  .tuple(fc.constantFrom('hit', 'miss'), fc.constantFrom('', ' ', '\t', '\n'), fc.constantFrom('', ' ', '\t', '\n'))
  .map(([w, a, b]) => `${a}${w}${b}`);
const headerValue = fc.oneof(
  fc.constantFrom('hit', 'miss', 'HIT', 'Miss', '', ' ', 'unknown'),
  caseVariants,
  padded,
  fc.string(),
);
const maybeHeader = fc.option(headerValue, { nil: undefined });

describe('P29: Cache status mapping', () => {
  it('P29 maps hit and miss exactly, anything else to unknown, and never changes the result', () => {
    const reference = parseScanResponse(200, headers(undefined), body());
    expect(reference.kind).toBe('result');
    fc.assert(
      fc.property(maybeHeader, (value) => {
        const out = parseScanResponse(200, headers(value), body());
        if (out.kind !== 'result' || reference.kind !== 'result') return false;
        const expected = value === 'hit' ? 'hit' : value === 'miss' ? 'miss' : 'unknown';
        return out.cache === expected && JSON.stringify(out.result) === JSON.stringify(reference.result);
      }),
      cfg(),
    );
  });

  it('P29 reads no cache status from a non-200 status', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 599 }).filter((s) => s !== 200),
        maybeHeader,
        (status, value) => {
          const out = parseScanResponse(status, headers(value), body());
          return out.kind === 'failure' && !('cache' in out);
        },
      ),
      cfg(),
    );
  });
});
