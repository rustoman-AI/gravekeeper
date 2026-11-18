import { afterEach, beforeEach, expect } from "vitest";

/**
 * Offline fetch guard (R23.1). Replaces `globalThis.fetch` with a stub that
 * records the call and throws, and fails any test during which a call was
 * recorded, even when the code under test swallowed the throw.
 * Inactive for files under `tests/live` when `GRAVEKEEPER_LIVE_TESTS` is `1`.
 */

export class OfflineFetchError extends Error {
  readonly url: string;

  constructor(url: string) {
    super(`offline fetch guard: network call attempted to ${url}`);
    this.name = "OfflineFetchError";
    this.url = url;
  }
}

const calls: string[] = [];

export function offlineFetchCalls(): readonly string[] {
  return calls;
}

export function clearOfflineFetchCalls(): void {
  calls.length = 0;
}

function describeInput(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (typeof input === "object" && input !== null && "url" in input) {
    const url = (input as { url: unknown }).url;
    if (typeof url === "string") return url;
  }
  return String(input);
}

const offlineFetch = (input: unknown): Promise<Response> => {
  const url = describeInput(input);
  calls.push(url);
  return Promise.reject(new OfflineFetchError(url));
};

function isLiveFile(): boolean {
  if (process.env.GRAVEKEEPER_LIVE_TESTS !== "1") return false;
  const path = (expect.getState().testPath ?? "").replace(/\\/g, "/");
  return /(^|\/)tests\/live\//.test(path);
}

// Keep the real fetch across setup-file re-runs (for example with `isolate: false`).
const REAL_FETCH = Symbol.for("gravekeeper.realFetch");
const store = globalThis as unknown as Record<symbol, typeof fetch | undefined>;
store[REAL_FETCH] ??= globalThis.fetch;

const live = isLiveFile();

globalThis.fetch = live
  ? (store[REAL_FETCH] as typeof fetch)
  : (offlineFetch as unknown as typeof fetch);

beforeEach(() => {
  clearOfflineFetchCalls();
});

afterEach(() => {
  if (live) return;
  if (calls.length > 0) {
    const recorded = calls.slice();
    clearOfflineFetchCalls();
    expect.fail(
      `offline fetch guard: ${recorded.length} network call(s) attempted: ${recorded.join(", ")}`,
    );
  }
});
