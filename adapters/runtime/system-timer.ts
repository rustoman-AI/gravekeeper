import type { Timer, TimerHandle } from '../../pipeline/ports/runtime';

// Requirement 15.10
function sleep(ms: number, signal: AbortSignal): Promise<'elapsed' | 'aborted'> {
  if (signal.aborted) return Promise.resolve('aborted');
  return new Promise((resolve) => {
    const onAbort = (): void => {
      clearTimeout(id);
      resolve('aborted');
    };
    const id = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve('elapsed');
    }, Math.max(0, ms));
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Timer backed by the runtime's `setTimeout`. `sleep` never rejects. */
export const systemTimer: Timer = {
  setTimeout(callback: () => void, ms: number): TimerHandle {
    return { id: setTimeout(callback, ms) };
  },
  clearTimeout(handle: TimerHandle): void {
    clearTimeout(handle.id as ReturnType<typeof setTimeout>);
  },
  sleep,
};
