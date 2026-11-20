// Requirements 3.2, 3.3, 14.1, 21.5: the Scan_Client is the only browser I/O; it never throws.
import { describe, expect, it } from 'vitest';
import { createScanClient } from '../../../client/scan-client';
import type { ScanClientOutcome } from '../../../client/scan-client';
import { CLIENT_FETCH_TIMEOUT_MS } from '../../../view-model/index';
import { buildScanResult, manyRows } from '../../support/ui/scan-result-builder';

interface FakeTimers {
  readonly setTimer: (fn: () => void, ms: number) => unknown;
  readonly clearTimer: (handle: unknown) => void;
  readonly started: { handle: number; ms: number; fn: () => void }[];
  readonly cleared: unknown[];
  fire(): void;
}

function fakeTimers(): FakeTimers {
  const started: FakeTimers['started'] = [];
  const cleared: unknown[] = [];
  let next = 1;
  return {
    started,
    cleared,
    setTimer: (fn, ms) => {
      const handle = next++;
      started.push({ handle, ms, fn });
      return handle;
    },
    clearTimer: (handle) => {
      cleared.push(handle);
    },
    fire: () => {
      for (const t of started) if (!cleared.includes(t.handle)) t.fn();
    },
  };
}

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

/** A fetch that records calls and lets the test decide how it settles. */
function fakeFetch(respond: (call: Call) => Promise<Response>): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = ((url: unknown, init: RequestInit) => {
    const call = { url: String(url), init };
    calls.push(call);
    return respond(call);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

/** A fetch that never answers on its own and rejects when its signal aborts. */
const hangingUntilAbort = (call: Call): Promise<Response> =>
  new Promise((_resolve, reject) => {
    call.init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });

const REQUEST = { repoUrl: 'https://github.com/synthetic/graveyard', manifests: ['package.json'] };

const json = (body: unknown, status: number, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const errorBody = (code: string) => ({ ok: false, error: { code, message: `synthetic ${code}` } });

function setup(respond: (call: Call) => Promise<Response>) {
  const timers = fakeTimers();
  const { fetchImpl, calls } = fakeFetch(respond);
  const client = createScanClient({ fetchImpl, setTimer: timers.setTimer, clearTimer: timers.clearTimer });
  return { client, timers, calls };
}

const expectTimerCleared = (timers: FakeTimers): void => {
  expect(timers.started).toHaveLength(1);
  expect(timers.cleared).toEqual([timers.started[0].handle]);
};

describe('Scan_Client', () => {
  it('sends one POST to /api/scan with the JSON body, header and options', async () => {
    const { client, timers, calls } = setup(async () => json(buildScanResult(manyRows(2)), 200));
    const controller = new AbortController();
    await client.run(REQUEST, controller.signal);

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toBe('/api/scan');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual(REQUEST);
    expect(init.credentials).toBe('omit');
    expect(init.cache).toBe('no-store');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(timers.started[0].ms).toBe(CLIENT_FETCH_TIMEOUT_MS);
  });

  it('returns a result with cache hit for a 200 with the hit header', async () => {
    const { client, timers } = setup(async () =>
      json(buildScanResult(manyRows(2)), 200, { 'X-Gravekeeper-Cache': 'hit' }),
    );
    const outcome = await client.run(REQUEST, new AbortController().signal);
    expect(outcome.kind).toBe('result');
    if (outcome.kind === 'result') {
      expect(outcome.cache).toBe('hit');
      expect(outcome.result.dependencies).toHaveLength(2);
    }
    expectTimerCleared(timers);
  });

  it('returns an error with retryAfterSeconds for a 503 with Retry-After', async () => {
    const { client, timers } = setup(async () =>
      json(errorBody('upstream-unavailable'), 503, { 'Retry-After': '42' }),
    );
    const outcome = await client.run(REQUEST, new AbortController().signal);
    expect(outcome).toMatchObject({ kind: 'error', status: 503, retryAfterSeconds: 42 });
    expectTimerCleared(timers);
  });

  it('returns an error with null retryAfterSeconds for a 502 without Retry-After', async () => {
    const { client, timers } = setup(async () => json(errorBody('upstream-unavailable'), 502));
    const outcome = await client.run(REQUEST, new AbortController().signal);
    expect(outcome).toMatchObject({ kind: 'error', status: 502, retryAfterSeconds: null });
    expectTimerCleared(timers);
  });

  it('returns malformed-response when the body is not JSON', async () => {
    const { client, timers } = setup(async () => new Response('<html>oops</html>', { status: 502 }));
    const outcome = await client.run(REQUEST, new AbortController().signal);
    expect(outcome).toEqual({ kind: 'failure', failure: { kind: 'malformed-response' } });
    expectTimerCleared(timers);
  });

  it('returns network-failure when fetch rejects', async () => {
    const { client, timers } = setup(() => Promise.reject(new TypeError('Failed to fetch')));
    const outcome = await client.run(REQUEST, new AbortController().signal);
    expect(outcome).toEqual({ kind: 'failure', failure: { kind: 'network-failure' } });
    expectTimerCleared(timers);
  });

  it('returns network-failure when fetch throws synchronously', async () => {
    const { client, timers } = setup(() => {
      throw new Error('boom');
    });
    const outcome = await client.run(REQUEST, new AbortController().signal);
    expect(outcome).toEqual({ kind: 'failure', failure: { kind: 'network-failure' } });
    expectTimerCleared(timers);
  });

  it('returns timeout and aborts the request when no answer arrives in time', async () => {
    const { client, timers, calls } = setup(hangingUntilAbort);
    const pending = client.run(REQUEST, new AbortController().signal);
    expect(timers.started[0].ms).toBe(CLIENT_FETCH_TIMEOUT_MS);
    expect(calls[0].init.signal?.aborted).toBe(false);
    timers.fire();
    expect(await pending).toEqual({ kind: 'failure', failure: { kind: 'timeout' } });
    expect(calls[0].init.signal?.aborted).toBe(true);
    expectTimerCleared(timers);
  });

  it('returns aborted when the caller aborts while waiting', async () => {
    const { client, timers, calls } = setup(hangingUntilAbort);
    const controller = new AbortController();
    const pending = client.run(REQUEST, controller.signal);
    controller.abort();
    expect(await pending).toEqual({ kind: 'aborted' });
    expect(calls[0].init.signal?.aborted).toBe(true);
    expectTimerCleared(timers);
  });

  it('returns aborted without calling fetch when the signal is already aborted', async () => {
    const { client, calls } = setup(hangingUntilAbort);
    const controller = new AbortController();
    controller.abort();
    expect(await client.run(REQUEST, controller.signal)).toEqual({ kind: 'aborted' });
    expect(calls).toHaveLength(0);
  });

  it('ignores an abort that arrives after the answer', async () => {
    const { client, timers } = setup(async () => json(errorBody('repo-not-found'), 404));
    const controller = new AbortController();
    const outcome = await client.run(REQUEST, controller.signal);
    controller.abort();
    expect(outcome).toMatchObject({ kind: 'error', status: 404 });
    expectTimerCleared(timers);
  });

  it('ignores the timer firing after the answer', async () => {
    const { client, timers } = setup(async () => json(errorBody('repo-not-found'), 404));
    const outcome = await client.run(REQUEST, new AbortController().signal);
    timers.fire();
    expect(outcome.kind).toBe('error');
  });

  it('never throws, even when clearTimer or setTimer throw', async () => {
    const outcomes: ScanClientOutcome[] = [];
    const okFetch = fakeFetch(async () => json(errorBody('internal-error'), 500)).fetchImpl;

    const badClear = createScanClient({
      fetchImpl: okFetch,
      setTimer: () => 1,
      clearTimer: () => {
        throw new Error('clear failed');
      },
    });
    outcomes.push(await badClear.run(REQUEST, new AbortController().signal));

    const badSet = createScanClient({
      fetchImpl: okFetch,
      setTimer: () => {
        throw new Error('set failed');
      },
      clearTimer: () => undefined,
    });
    outcomes.push(await badSet.run(REQUEST, new AbortController().signal));

    expect(outcomes[0].kind).toBe('error');
    expect(outcomes[1]).toEqual({ kind: 'failure', failure: { kind: 'network-failure' } });
  });
});
