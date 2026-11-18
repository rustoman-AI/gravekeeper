import { describe, expect, it } from 'vitest';
import { createConcurrencyLimiter } from '../../adapters/http/concurrency-limiter';
import { createFakeRuntime } from '../support/fake-runtime';

// Requirement 15.3, 15.14, 15.16

interface Deferred {
  readonly promise: Promise<void>;
  resolve(): void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('createConcurrencyLimiter', () => {
  it('runs one task at a time with limit 1', async () => {
    const rt = createFakeRuntime(0);
    const limiter = createConcurrencyLimiter(1, 0, rt);
    const signal = new AbortController().signal;
    const gate = deferred();
    const started: string[] = [];

    const first = limiter.run(async () => {
      started.push('a');
      await gate.promise;
      return 'a';
    }, signal);
    const second = limiter.run(async () => {
      started.push('b');
      return 'b';
    }, signal);

    await rt.flush();
    expect(started).toEqual(['a']);

    gate.resolve();
    expect(await first).toEqual({ acquired: true, value: 'a' });
    expect(await second).toEqual({ acquired: true, value: 'b' });
    expect(started).toEqual(['a', 'b']);
  });

  it('runs at most four tasks at once with limit 4', async () => {
    const rt = createFakeRuntime(0);
    const limiter = createConcurrencyLimiter(4, 0, rt);
    const signal = new AbortController().signal;
    const gates = Array.from({ length: 6 }, deferred);
    let active = 0;
    let peak = 0;
    const started: number[] = [];

    const runs = gates.map((gate, i) =>
      limiter.run(async () => {
        started.push(i);
        active += 1;
        peak = Math.max(peak, active);
        await gate.promise;
        active -= 1;
        return i;
      }, signal),
    );

    await rt.flush();
    expect(started).toEqual([0, 1, 2, 3]);

    gates[0]?.resolve();
    await rt.flush();
    expect(started).toEqual([0, 1, 2, 3, 4]);

    gates.forEach((g) => g.resolve());
    const results = await Promise.all(runs);
    expect(results.map((r) => r.acquired)).toEqual(Array(6).fill(true));
    expect(started).toEqual([0, 1, 2, 3, 4, 5]);
    expect(peak).toBe(4);
  });

  it('starts waiting tasks in FIFO order', async () => {
    const rt = createFakeRuntime(0);
    const limiter = createConcurrencyLimiter(1, 0, rt);
    const signal = new AbortController().signal;
    const gate = deferred();
    const started: number[] = [];

    const runs = [0, 1, 2, 3].map((i) =>
      limiter.run(async () => {
        started.push(i);
        if (i === 0) await gate.promise;
      }, signal),
    );
    await rt.flush();
    gate.resolve();
    await Promise.all(runs);
    expect(started).toEqual([0, 1, 2, 3]);
  });

  it('resolves acquired:false without running the task when aborted while waiting', async () => {
    const rt = createFakeRuntime(0);
    const limiter = createConcurrencyLimiter(1, 0, rt);
    const gate = deferred();
    const controller = new AbortController();
    let waitingRan = false;
    let laterRan = false;

    const holder = limiter.run(() => gate.promise, new AbortController().signal);
    const waiting = limiter.run(async () => {
      waitingRan = true;
    }, controller.signal);
    const later = limiter.run(async () => {
      laterRan = true;
    }, new AbortController().signal);

    await rt.flush();
    controller.abort();
    expect(await waiting).toEqual({ acquired: false });
    expect(waitingRan).toBe(false);

    gate.resolve();
    await holder;
    expect(await later).toEqual({ acquired: true, value: undefined });
    expect(laterRan).toBe(true);
  });

  it('does not run the task when the signal is already aborted', async () => {
    const rt = createFakeRuntime(0);
    const limiter = createConcurrencyLimiter(2, 0, rt);
    const controller = new AbortController();
    controller.abort();
    let ran = false;
    const result = await limiter.run(async () => {
      ran = true;
    }, controller.signal);
    expect(result).toEqual({ acquired: false });
    expect(ran).toBe(false);
  });

  it('releases the slot when a task fails', async () => {
    const rt = createFakeRuntime(0);
    const limiter = createConcurrencyLimiter(1, 0, rt);
    const signal = new AbortController().signal;

    const failing = limiter.run(async () => {
      throw new Error('boom');
    }, signal);
    const next = limiter.run(async () => 'ok', signal);

    await expect(failing).rejects.toThrow('boom');
    expect(await next).toEqual({ acquired: true, value: 'ok' });
  });

  it('spaces task starts by minIntervalMs on the injected clock', async () => {
    const rt = createFakeRuntime(1000);
    const limiter = createConcurrencyLimiter(4, 100, rt);
    const signal = new AbortController().signal;
    const startTimes: number[] = [];

    const runs = [0, 1, 2].map(() =>
      limiter.run(async () => {
        startTimes.push(rt.clock());
      }, signal),
    );

    await rt.flush();
    expect(startTimes).toEqual([1000]);
    while (rt.pendingTimers() > 0) {
      rt.advanceToNextTimer();
      await rt.flush();
    }
    await Promise.all(runs);
    expect(startTimes).toEqual([1000, 1100, 1200]);
  });

  it('resolves acquired:false when aborted during the spacing wait', async () => {
    const rt = createFakeRuntime(0);
    const limiter = createConcurrencyLimiter(4, 100, rt);
    const controller = new AbortController();
    let secondRan = false;

    const first = limiter.run(async () => 1, new AbortController().signal);
    const second = limiter.run(async () => {
      secondRan = true;
    }, controller.signal);

    await rt.flush();
    expect(rt.pendingTimers()).toBe(1);
    controller.abort();
    expect(await second).toEqual({ acquired: false });
    expect(secondRan).toBe(false);
    expect(await first).toEqual({ acquired: true, value: 1 });
  });
});
