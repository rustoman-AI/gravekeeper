import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consoleLogger } from '../../adapters/runtime/console-logger';
import { systemClock } from '../../adapters/runtime/system-clock';
import { systemRandom } from '../../adapters/runtime/system-random';
import { systemTimer } from '../../adapters/runtime/system-timer';
import type { LogEntry } from '../../pipeline/ports/runtime';

describe('system runtime adapters', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('systemClock', () => {
    it('returns epoch milliseconds', () => {
      vi.setSystemTime(1_700_000_000_000);
      expect(systemClock()).toBe(1_700_000_000_000);
    });
  });

  describe('systemRandom', () => {
    it('returns a value in [0, 1)', () => {
      for (let i = 0; i < 50; i++) {
        const value = systemRandom();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });
  });

  describe('systemTimer', () => {
    it('setTimeout fires the callback after the delay', () => {
      const callback = vi.fn();
      systemTimer.setTimeout(callback, 100);
      vi.advanceTimersByTime(99);
      expect(callback).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('clearTimeout cancels a pending callback', () => {
      const callback = vi.fn();
      const handle = systemTimer.setTimeout(callback, 100);
      systemTimer.clearTimeout(handle);
      vi.advanceTimersByTime(1000);
      expect(callback).not.toHaveBeenCalled();
    });

    it("sleep resolves 'elapsed' after the delay", async () => {
      const promise = systemTimer.sleep(50, new AbortController().signal);
      await vi.advanceTimersByTimeAsync(50);
      await expect(promise).resolves.toBe('elapsed');
    });

    it("sleep resolves 'aborted' when the signal aborts first", async () => {
      const controller = new AbortController();
      const promise = systemTimer.sleep(1000, controller.signal);
      controller.abort();
      await expect(promise).resolves.toBe('aborted');
      expect(vi.getTimerCount()).toBe(0);
    });

    it("sleep resolves 'aborted' at once for an already aborted signal", async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(systemTimer.sleep(1000, controller.signal)).resolves.toBe('aborted');
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('consoleLogger', () => {
    it('writes one JSON line with exactly source, status, durationMs, code', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const entry = {
        source: 'npm',
        status: 200,
        durationMs: 12,
        code: 'ok',
        url: 'https://example.test/secret',
        token: 'abc',
      } as unknown as LogEntry;

      consoleLogger.log(entry);

      expect(spy).toHaveBeenCalledTimes(1);
      const line = spy.mock.calls[0]?.[0] as string;
      expect(typeof line).toBe('string');
      expect(line).not.toContain('\n');
      const parsed = JSON.parse(line) as Record<string, unknown>;
      expect(Object.keys(parsed).sort()).toEqual(['code', 'durationMs', 'source', 'status']);
      expect(parsed).toEqual({ source: 'npm', status: 200, durationMs: 12, code: 'ok' });
    });

    it('keeps a null status', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      consoleLogger.log({ source: 'cache', status: null, durationMs: 0, code: 'miss' });
      const parsed = JSON.parse(spy.mock.calls[0]?.[0] as string) as Record<string, unknown>;
      expect(parsed.status).toBeNull();
    });
  });
});
