import { describe, expect, it } from 'vitest';
import { createFakeRuntime, runUntilSettled } from './fake-runtime';

// Requirement 15.10, 23.1

describe('fake runtime', () => {
  it('fires timers by due time, then by creation order', () => {
    const rt = createFakeRuntime(1000);
    const fired: string[] = [];
    rt.timer.setTimeout(() => fired.push('c'), 50);
    rt.timer.setTimeout(() => fired.push('a'), 10);
    rt.timer.setTimeout(() => fired.push('b1'), 20);
    rt.timer.setTimeout(() => fired.push('b2'), 20);
    expect(rt.pendingTimers()).toBe(4);
    while (rt.advanceToNextTimer()) {
      // drain
    }
    expect(fired).toEqual(['a', 'b1', 'b2', 'c']);
    expect(rt.clock()).toBe(1050);
    expect(rt.pendingTimers()).toBe(0);
  });

  it('advanceToNextTimer returns false when nothing is pending', () => {
    const rt = createFakeRuntime(0);
    expect(rt.advanceToNextTimer()).toBe(false);
    expect(rt.clock()).toBe(0);
  });

  it('clearTimeout removes a pending timer', () => {
    const rt = createFakeRuntime(0);
    let fired = false;
    const handle = rt.timer.setTimeout(() => {
      fired = true;
    }, 5);
    rt.timer.clearTimeout(handle);
    expect(rt.pendingTimers()).toBe(0);
    expect(rt.advanceToNextTimer()).toBe(false);
    expect(fired).toBe(false);
  });

  it('sleep returns aborted at once on an aborted signal without a timer', async () => {
    const rt = createFakeRuntime(0);
    const controller = new AbortController();
    controller.abort();
    await expect(rt.timer.sleep(100, controller.signal)).resolves.toBe('aborted');
    expect(rt.pendingTimers()).toBe(0);
  });

  it('sleep resolves aborted and clears its timer when aborted while waiting', async () => {
    const rt = createFakeRuntime(0);
    const controller = new AbortController();
    const result = rt.timer.sleep(100, controller.signal);
    expect(rt.pendingTimers()).toBe(1);
    controller.abort();
    await expect(result).resolves.toBe('aborted');
    expect(rt.pendingTimers()).toBe(0);
  });

  it('sleep resolves elapsed when its timer fires', async () => {
    const rt = createFakeRuntime(0);
    const result = rt.timer.sleep(100, new AbortController().signal);
    rt.advanceToNextTimer();
    await expect(result).resolves.toBe('elapsed');
    expect(rt.clock()).toBe(100);
  });

  it('random cycles the given values and defaults to 0', () => {
    const rt = createFakeRuntime(0, [0.25, 0.5]);
    expect([rt.random(), rt.random(), rt.random()]).toEqual([0.25, 0.5, 0.25]);
    expect(createFakeRuntime(0).random()).toBe(0);
  });

  it('runUntilSettled drives a chain of three timers', async () => {
    const rt = createFakeRuntime(0);
    const signal = new AbortController().signal;
    const chain = (async () => {
      await rt.timer.sleep(10, signal);
      await rt.timer.sleep(20, signal);
      await rt.timer.sleep(30, signal);
      return rt.clock();
    })();
    await expect(runUntilSettled(chain, rt)).resolves.toBe(60);
  });

  it('runUntilSettled propagates rejection', async () => {
    const rt = createFakeRuntime(0);
    await expect(runUntilSettled(Promise.reject(new Error('boom')), rt)).rejects.toThrow('boom');
  });

  it('runUntilSettled fails with stuck when no timer is pending', async () => {
    const rt = createFakeRuntime(0);
    await expect(runUntilSettled(new Promise<void>(() => undefined), rt)).rejects.toThrow('stuck');
  });
});
