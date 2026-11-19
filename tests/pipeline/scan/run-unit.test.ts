// Requirements 16.5, 16.8, 16.12
import { describe, expect, it, vi } from 'vitest';
import type { LogEntry, Logger, SourceResult } from '../../../pipeline/ports';
import { WorkLedger } from '../../../pipeline/scan/ledger';
import { createUnitRunner, raceAbort, safeLog } from '../../../pipeline/scan/run-unit';

const HEADERS = {} as never;
const okResult: SourceResult<number> = {
  kind: 'ok',
  status: 200,
  body: 1,
  headers: HEADERS,
  fromCache: false,
};
const entry: LogEntry = { source: 'npm', status: 200, durationMs: 1, code: 'x' };

describe('safeLog', () => {
  it('ignores a Logger that throws', () => {
    const logger: Logger = {
      log() {
        throw new Error('boom');
      },
    };
    expect(() => safeLog(logger, entry)).not.toThrow();
  });

  it('passes the entry to the Logger', () => {
    const log = vi.fn();
    safeLog({ log }, entry);
    expect(log).toHaveBeenCalledWith(entry);
  });
});

describe('raceAbort', () => {
  it('resolves with deadline at the abort for a source that never settles', async () => {
    const controller = new AbortController();
    const racing = raceAbort(new Promise<SourceResult<number>>(() => undefined), controller.signal);
    controller.abort();
    await expect(racing).resolves.toMatchObject({ kind: 'failed', reason: 'deadline' });
  });

  it('returns the result when the source settles first', async () => {
    const controller = new AbortController();
    await expect(raceAbort(Promise.resolve(okResult), controller.signal)).resolves.toBe(okResult);
  });

  it('maps a rejection to a network failure', async () => {
    const controller = new AbortController();
    await expect(
      raceAbort(Promise.reject(new Error('x')), controller.signal),
    ).resolves.toMatchObject({ kind: 'failed', reason: 'network' });
  });
});

describe('createUnitRunner', () => {
  function setup() {
    const ledger = new WorkLedger();
    const controller = new AbortController();
    return { ledger, controller, runner: createUnitRunner(ledger, controller.signal) };
  }

  it('records deadline and never calls when the signal is already aborted', async () => {
    const { ledger, controller, runner } = setup();
    controller.abort();
    const call = vi.fn(() => Promise.resolve(okResult));
    const result = await runner.runUnit('npm', 'u1', call);
    expect(call).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kind: 'failed', reason: 'deadline' });
    expect(ledger.entries).toEqual([
      { source: 'npm', unitKey: 'u1', outcome: { ok: false, reason: 'deadline' } },
    ]);
  });

  it('records deadline when the abort comes while the call never settles', async () => {
    const { ledger, controller, runner } = setup();
    const running = runner.runUnit('npm', 'u1', () => new Promise<SourceResult>(() => undefined));
    controller.abort();
    await running;
    expect(ledger.entries[0]?.outcome).toEqual({ ok: false, reason: 'deadline' });
  });

  it('records an ok result as ok', async () => {
    const { ledger, runner } = setup();
    await runner.runUnit('npm', 'u1', () => Promise.resolve(okResult));
    expect(ledger.entries[0]?.outcome).toEqual({ ok: true });
  });

  it('records absent (404) as ok', async () => {
    const { ledger, runner } = setup();
    const absent: SourceResult = { kind: 'absent', headers: HEADERS, fromCache: false };
    await expect(runner.runUnit('pypi', 'u1', () => Promise.resolve(absent))).resolves.toBe(absent);
    expect(ledger.entries[0]?.outcome).toEqual({ ok: true });
  });

  it('records an unparsable 2xx body as a failed unit with http-error (D5)', async () => {
    const { ledger, runner } = setup();
    const unparsable: SourceResult = { kind: 'unparsable', status: 200, headers: HEADERS };
    await expect(runner.runUnit('npm', 'u1', () => Promise.resolve(unparsable))).resolves.toBe(
      unparsable,
    );
    expect(ledger.entries[0]?.outcome).toEqual({ ok: false, reason: 'http-error' });
  });

  it('records a failed result with its reason', async () => {
    const { ledger, runner } = setup();
    const failed: SourceResult = { kind: 'failed', reason: 'rate-limited', status: 429, headers: null };
    await runner.runUnit('github', 'u1', () => Promise.resolve(failed));
    expect(ledger.entries[0]?.outcome).toEqual({ ok: false, reason: 'rate-limited' });
  });

  it('keeps the first outcome for a duplicate unitKey', async () => {
    const { ledger, runner } = setup();
    const failed: SourceResult = { kind: 'failed', reason: 'timeout', status: null, headers: null };
    await runner.runUnit('npm', 'u1', () => Promise.resolve(failed));
    await runner.runUnit('npm', 'u1', () => Promise.resolve(okResult));
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]?.outcome).toEqual({ ok: false, reason: 'timeout' });
  });

  it('records a network failure when the call rejects', async () => {
    const { ledger, runner } = setup();
    const result = await runner.runUnit('npm', 'u1', () => Promise.reject(new Error('x')));
    expect(result).toMatchObject({ kind: 'failed', reason: 'network' });
    expect(ledger.entries[0]?.outcome).toEqual({ ok: false, reason: 'network' });
  });

  it('records a network failure when the call throws synchronously', async () => {
    const { ledger, runner } = setup();
    await runner.runUnit('npm', 'u1', () => {
      throw new Error('x');
    });
    expect(ledger.entries[0]?.outcome).toEqual({ ok: false, reason: 'network' });
  });

  it('skipUnit records the given reason', () => {
    const { ledger, runner } = setup();
    runner.skipUnit('osv', 'u1', 'budget');
    expect(ledger.entries[0]).toEqual({
      source: 'osv',
      unitKey: 'u1',
      outcome: { ok: false, reason: 'budget' },
    });
  });
});
