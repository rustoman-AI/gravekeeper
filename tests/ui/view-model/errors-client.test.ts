import { describe, expect, it } from 'vitest';
import { buildErrorModel } from '../../../view-model/errors';
import type { ClientFailureKind } from '../../../view-model/types';

// Requirement 13.8 and the design's error table.
const CASES: ReadonlyArray<{ failure: ClientFailureKind; heading: string; message: string }> = [
  { failure: 'network-failure', heading: 'The road is washed out', message: 'The server could not be reached.' },
  { failure: 'timeout', heading: 'The night ran out', message: 'The server did not answer in time.' },
  {
    failure: 'malformed-response',
    heading: 'The records are garbled',
    message: 'The server sent an answer that Gravekeeper could not read.',
  },
];

describe('buildErrorModel for client failures (R13.8)', () => {
  for (const { failure, heading, message } of CASES) {
    describe(failure, () => {
      const model = buildErrorModel({ kind: 'client', failure, submittedValue: 'https://github.com/o/r' });

      it('uses the themed heading and the plain sentence', () => {
        expect(model.code).toBe(failure);
        expect(model.heading).toBe(heading);
        expect(model.plainMessage).toBe(message);
      });

      it('has cooldown 0 so Retry is enabled at once', () => {
        expect(model.retryCooldownSeconds).toBe(0);
      });

      it('offers retry then back-to-gate only', () => {
        expect(model.actions.map((a) => a.id)).toEqual(['retry', 'back-to-gate']);
      });

      it('carries no status, hint, picker or URLs', () => {
        expect(model.httpStatus).toBeNull();
        expect(model.hint).toBeNull();
        expect(model.invalidPart).toBeNull();
        expect(model.picker).toBeNull();
        expect(model.defaultBranchUrl).toBeNull();
        expect(model.rootScanUrl).toBeNull();
      });
    });
  }
});
