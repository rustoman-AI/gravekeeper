import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { handleScanRequest } from '../../../pipeline/api/handle-scan-request';
import type { ApiDeps, RawScanRequest } from '../../../pipeline/api/handle-scan-request';
import { SCAN_WALL_BUDGET_MS } from '../../../pipeline/constants';
import type { SourceName } from '../../../pipeline/ports';
import type { ScanDeps } from '../../../pipeline/scan/types';
import { createFakeRuntime, runUntilSettled } from '../../support/fake-runtime';
import { cfg } from '../../support/fc-config';

// Feature: scan-pipeline, Session 21: the response is sent within the wall budget measured from
// function invocation (receivedAtMs), regardless of how long any source takes and of how much time
// was already spent before the handler read the clock. This is the regression guard for the
// production timeouts (docs/session-21-timeout-rca.md): the earlier P49 measured from the in-handler
// clock reading and so could not see the cold-start / buildDeps / body-read time.

/** Sources whose every method returns a promise that never settles and ignores the signal. */
function neverSettlingSources(): ScanDeps['sources'] {
  const never = (): ScanDeps['sources'][SourceName] =>
    new Proxy({}, { get: () => (): Promise<never> => new Promise<never>(() => undefined) }) as unknown as ScanDeps['sources'][SourceName];
  return { github: never(), depsdev: never(), osv: never(), npm: never(), cratesio: never(), pypi: never() } as unknown as ScanDeps['sources'];
}

function jsonRequest(text: string): RawScanRequest {
  const bytes = new TextEncoder().encode(text);
  return {
    method: 'POST',
    contentType: 'application/json',
    contentLength: String(bytes.byteLength),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
  };
}

describe('Session 21: a response is produced within the wall budget from receivedAtMs', () => {
  it('never-settling sources: the response arrives by receivedAtMs + SCAN_WALL_BUDGET_MS for any time already spent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1_000_000, max: 2_000_000_000 }),
        // Milliseconds already spent before the handler reads the clock: cold start + buildDeps +
        // body read. Includes values large enough that the remaining budget hits its floor.
        fc.integer({ min: 0, max: SCAN_WALL_BUDGET_MS + 10_000 }),
        async (receivedAtMs, spentMs) => {
          // The clock already reads spentMs past receivedAtMs: that time was spent on cold start,
          // buildDeps and the body read before the handler read the clock. receivedAtMs is threaded
          // separately, as the route does.
          const startedAtMs = receivedAtMs + spentMs;
          const runtime = createFakeRuntime(startedAtMs);
          const deps: ApiDeps = {
            sources: neverSettlingSources(),
            clock: runtime.clock,
            timer: runtime.timer,
            random: runtime.random,
            logger: { log: () => undefined },
            scanCache: { get: () => Promise.resolve(null), set: () => Promise.resolve() },
            readEnv: () => ({}),
            receivedAtMs,
          };
          const response = await runUntilSettled(
            handleScanRequest(jsonRequest(JSON.stringify({ repoUrl: 'https://github.com/o/r' })), deps),
            runtime,
          );
          // The margin fires at startedAtMs + remainingBudget, where remainingBudget is
          // max(MIN_SCAN_DEADLINE_MS, SCAN_WALL_BUDGET_MS - spentMs). So the response is due at
          // max(receivedAtMs + SCAN_WALL_BUDGET_MS, startedAtMs + MIN_SCAN_DEADLINE_MS).
          const finishedAtMs = runtime.clock();
          const floorBound = startedAtMs + 2000; // MIN_SCAN_DEADLINE_MS floor
          const bound = Math.max(receivedAtMs + SCAN_WALL_BUDGET_MS, floorBound);
          expect(finishedAtMs).toBeLessThanOrEqual(bound);
          // While there is budget left (not on the floor), the response is at or before the wall
          // budget from invocation: the whole point of the fix.
          if (spentMs <= SCAN_WALL_BUDGET_MS - 2000) {
            expect(finishedAtMs).toBeLessThanOrEqual(receivedAtMs + SCAN_WALL_BUDGET_MS);
          }
          expect(response.status).not.toBe(200); // never-settling discovery -> deadline-exceeded
        },
      ),
      cfg(),
    );
  });
});
