import { spawnSync } from 'node:child_process';
import path from 'node:path';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { REDIRECT_MAX_HOPS } from '../../pipeline/constants';
import { redirectChain, sameOriginChain } from './arbitraries/redirects';
import { createFakeRuntime, runUntilSettled } from './fake-runtime';
import { OfflineFetchError, clearOfflineFetchCalls, offlineFetchCalls } from './offline-fetch';
import { createScriptedFetch, scriptFromSteps } from './scripted-fetch';

// Requirement 23.1

describe('offline fetch guard', () => {
  it('stub rejects with OfflineFetchError and records the url', async () => {
    await expect(fetch('https://example.com/a')).rejects.toBeInstanceOf(OfflineFetchError);
    expect(offlineFetchCalls()).toEqual(['https://example.com/a']);
    clearOfflineFetchCalls();
    expect(offlineFetchCalls()).toEqual([]);
  });

  it('fails a test that swallowed the throw (child run)', () => {
    const vitestEntry = path.resolve('node_modules/vitest/vitest.mjs');
    const result = spawnSync(
      process.execPath,
      [vitestEntry, '--run', '--config', 'tests/support/fixtures/vitest.child.config.mts'],
      { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, GRAVEKEEPER_LIVE_TESTS: '' } },
    );
    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).not.toBe(0);
    expect(output).toContain('offline fetch guard: 1 network call(s) attempted');
    expect(output).toContain('https://swallowed.example.com/x');
  }, 60000);
});

describe('scripted fetch', () => {
  it('records the abort instant of an aborted call', async () => {
    const runtime = createFakeRuntime(1000);
    const scripted = createScriptedFetch(
      scriptFromSteps([{ latencyMs: 500, response: { status: 200 } }]),
      runtime,
    );
    const controller = new AbortController();
    const pending = scripted.fetch('https://x.test/a', { signal: controller.signal });
    const outcome = pending.then(
      () => 'resolved',
      (error: unknown) => (error as Error).name,
    );
    await runtime.flush();
    runtime.timer.setTimeout(() => controller.abort(), 200);
    runtime.advanceToNextTimer(); // the abort timer (due at 1200) fires before the 1500 response
    expect(await runUntilSettled(outcome, runtime)).toBe('AbortError');
    expect(scripted.calls).toHaveLength(1);
    expect(scripted.calls[0]?.sentAtMs).toBe(1000);
    expect(scripted.calls[0]?.abortedAtMs).toBe(1200);
  });

  it("latency 'never' stays pending until aborted, then records the abort", async () => {
    const runtime = createFakeRuntime(50);
    const scripted = createScriptedFetch(
      scriptFromSteps([{ latencyMs: 'never', response: { status: 200 } }]),
      runtime,
    );
    const controller = new AbortController();
    let settled = false;
    const outcome = scripted.fetch('https://x.test/b', { signal: controller.signal }).then(
      () => {
        settled = true;
        return 'resolved';
      },
      (error: unknown) => {
        settled = true;
        return (error as Error).name;
      },
    );
    await runtime.flush();
    expect(settled).toBe(false);
    expect(runtime.pendingTimers()).toBe(0);
    expect(scripted.calls[0]?.abortedAtMs).toBeNull();
    controller.abort();
    expect(await outcome).toBe('AbortError');
    expect(scripted.calls[0]?.abortedAtMs).toBe(50);
  });

  it('serves the scripted response and counts attempts per url', async () => {
    const runtime = createFakeRuntime(0);
    const scripted = createScriptedFetch(
      scriptFromSteps([
        { latencyMs: 0, response: 'network-error' },
        { latencyMs: 0, response: { status: 200, body: { kind: 'text', text: 'ok' } } },
      ]),
      runtime,
    );
    await expect(runUntilSettled(scripted.fetch('https://x.test/c'), runtime)).rejects.toThrow('fetch failed');
    const response = await runUntilSettled(scripted.fetch('https://x.test/c'), runtime);
    expect(await response.text()).toBe('ok');
    expect(scripted.calls.map((c) => c.attemptIndex)).toEqual([0, 1]);
  });
});

describe('redirect arbitraries', () => {
  it('redirectChain produces lengths within 0..REDIRECT_MAX_HOPS + 2 and covers both ends', () => {
    const lengths = new Set<number>();
    fc.assert(
      fc.property(redirectChain, (chain) => {
        lengths.add(chain.hops.length);
        return chain.hops.length >= 0 && chain.hops.length <= REDIRECT_MAX_HOPS + 2;
      }),
      { numRuns: 300 },
    );
    expect(lengths.has(0)).toBe(true);
    expect(Math.max(...lengths)).toBeGreaterThan(REDIRECT_MAX_HOPS);
  });

  it('sameOriginChain uses only followable location kinds', () => {
    fc.assert(
      fc.property(sameOriginChain, (chain) =>
        chain.hops.every((h) => ['relative-path', 'relative-bare', 'absolute-same'].includes(h.kind)),
      ),
      { numRuns: 100 },
    );
  });
});
