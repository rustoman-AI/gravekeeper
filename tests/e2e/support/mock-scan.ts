import type { Page, Request, Route } from "@playwright/test";
import { loadScan, type FixtureName } from "./fixtures";

export type ScanHandler = (route: Route, request: Request) => Promise<void> | void;

/** Intercepts `**\/api/scan`. Returns the list of request bodies seen (parsed JSON, or raw text). */
export async function mockScan(page: Page, handler: ScanHandler): Promise<unknown[]> {
  const seen: unknown[] = [];
  await page.route("**/api/scan", async (route, request) => {
    const raw = request.postData();
    try {
      seen.push(raw === null ? null : JSON.parse(raw));
    } catch {
      seen.push(raw);
    }
    await handler(route, request);
  });
  return seen;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

/** Replies 200 with a generated file. `cache` sets `X-Gravekeeper-Cache`. */
export function respondWithFixture(
  name: FixtureName,
  opts: { cache?: string; headers?: Record<string, string> } = {},
): ScanHandler {
  return (route) =>
    route.fulfill({
      status: 200,
      headers: {
        ...JSON_HEADERS,
        ...(opts.cache ? { "X-Gravekeeper-Cache": opts.cache } : {}),
        ...opts.headers,
      },
      body: JSON.stringify(loadScan(name)),
    });
}

/** Waits `ms` real milliseconds, then runs `next`. */
export function withDelay(ms: number, next: ScanHandler): ScanHandler {
  return async (route, request) => {
    await sleep(ms);
    await next(route, request);
  };
}

/** Never answers: the request stays pending until the page cancels it. */
export function hang(): ScanHandler {
  return () => new Promise<void>(() => {});
}

/**
 * Replies with a status, a JSON body and optional headers
 * (for example `Retry-After`, `X-Gravekeeper-Cache`).
 */
export function respondWithStatus(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): ScanHandler {
  return (route) =>
    route.fulfill({
      status,
      headers: { ...JSON_HEADERS, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
}

/** Replies with a Scan_Error body `{ ok: false, error: { code, message, details? } }`. */
export function respondWithError(
  status: number,
  error: { code: string; message?: string; details?: unknown },
  headers: Record<string, string> = {},
): ScanHandler {
  return respondWithStatus(
    status,
    { ok: false, error: { message: error.code, ...error } },
    headers,
  );
}

/** Replies with a raw body (for malformed responses: invalid JSON, wrong shape). */
export function respondWithRaw(
  body: string,
  opts: { status?: number; contentType?: string; headers?: Record<string, string> } = {},
): ScanHandler {
  return (route) =>
    route.fulfill({
      status: opts.status ?? 200,
      headers: { "content-type": opts.contentType ?? "application/json", ...opts.headers },
      body,
    });
}

/** Aborts the request (browser reports a network failure). */
export function abortRequest(errorCode: Parameters<Route["abort"]>[0] = "failed"): ScanHandler {
  return (route) => route.abort(errorCode);
}
