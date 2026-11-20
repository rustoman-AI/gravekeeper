// Feature: graveyard-ui, Property 24: Error model is total and keeps the plain message
// Validates: Requirements 13.1, 13.2, 13.13
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildErrorModel } from '../../../view-model/errors';
import type { ClientFailureKind, ErrorInput } from '../../../view-model/types';
import { cfg } from '../../support/fc-config';

const KNOWN_CODES = [
  'invalid-url',
  'repo-not-found',
  'branch-not-found',
  'too-many-manifests',
  'manifest-not-found',
  'upstream-unavailable',
  'deadline-exceeded',
  'internal-error',
  'invalid-request',
] as const;
const STATUSES = [200, 400, 404, 405, 413, 415, 500, 502, 503, 504] as const;
const FAILURES: readonly ClientFailureKind[] = ['network-failure', 'timeout', 'malformed-response'];

const hostile = fc.oneof(
  fc.string(),
  fc.string({ unit: 'binary' }),
  fc.constantFrom('<script>alert(1)</script>', '\u0000\u001b[31m', '"><img src=x onerror=1>', '__proto__', '\u202e', '', ' '),
);

const code = fc.oneof(fc.constantFrom(...KNOWN_CODES), hostile);
const details = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.anything(),
  fc.record({ candidates: fc.oneof(fc.array(hostile, { maxLength: 30 }), fc.anything()) }, { requiredKeys: [] }),
  fc.record({ part: fc.oneof(fc.constantFrom('url', 'host', 'path', 'owner', 'repository', 'branch'), hostile, fc.anything()) }, { requiredKeys: [] }),
);
const retryAfter = fc.oneof(
  fc.constant(null),
  fc.nat(100000),
  fc.integer({ min: -100000, max: -1 }),
  fc.double({ noNaN: false }),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1.5),
);

const apiInput = fc
  .record({
    status: fc.oneof(fc.constantFrom(...STATUSES), fc.integer()),
    code,
    message: hostile,
    details,
    retryAfterSeconds: retryAfter,
    submittedValue: hostile,
    repoValue: hostile,
    selectedManifests: fc.array(hostile, { maxLength: 8 }),
  })
  .map(
    (r): ErrorInput =>
      ({
        kind: 'api',
        status: r.status,
        error: { code: r.code, message: r.message, ...(r.details === undefined ? {} : { details: r.details }) },
        retryAfterSeconds: r.retryAfterSeconds,
        submittedValue: r.submittedValue,
        repoValue: r.repoValue,
        selectedManifests: r.selectedManifests,
      }) as unknown as ErrorInput,
  );

const clientInput = fc
  .record({ failure: fc.constantFrom(...FAILURES), submittedValue: hostile })
  .map((r): ErrorInput => ({ kind: 'client', ...r }));

describe('P24: Error model is total and keeps the plain message', () => {
  it('P24 never throws, and always has a heading, a way out and unique actions', () => {
    fc.assert(
      fc.property(fc.oneof(apiInput, clientInput), (input) => {
        const model = buildErrorModel(input);
        expect(model.heading.length).toBeGreaterThan(0);
        expect(model.actions.length).toBeGreaterThan(0);
        const ids = model.actions.map((a) => a.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toContain('back-to-gate');
        for (const a of model.actions) expect(a.label.length).toBeGreaterThan(0);
        const c = model.retryCooldownSeconds;
        expect(c === null || (Number.isInteger(c) && c >= 0)).toBe(true);
      }),
      cfg(),
    );
  });

  it('P24 keeps the API message exactly', () => {
    fc.assert(
      fc.property(apiInput, (input) => {
        if (input.kind !== 'api') throw new Error('unreachable');
        expect(buildErrorModel(input).plainMessage).toBe(input.error.message);
      }),
      cfg(),
    );
  });
});
