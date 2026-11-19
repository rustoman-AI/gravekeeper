import { it, type TestContext } from "vitest";
import { readGithubToken } from "../../adapters/runtime/token-reader";
import { ENDPOINT_FACT_MAP, type EndpointFactRow } from "../support/endpoint-fact-map";

// Requirement 23.8, 23.9, 23.14, 23.15
// Support for the live contract tests. Nothing here makes a network request
// and nothing here prints or returns the GitHub token.

/** True only when GRAVEKEEPER_LIVE_TESTS is exactly `1` (R23.8, R23.9). */
export const LIVE: boolean = process.env.GRAVEKEEPER_LIVE_TESTS === "1";

/** Skip reason for the token rows EF-17, EF-18 and EF-19 (R23.14). */
export const TOKEN_SKIP_REASON = "GITHUB_TOKEN not set";

/** Live test registrar: reported as skipped, never passed, unless LIVE (R23.9). */
export const liveIt = it.skipIf(!LIVE);

export function findRow(rowId: string): EndpointFactRow {
  const row = ENDPOINT_FACT_MAP.find((r) => r.id === rowId);
  if (row === undefined) throw new Error(`unknown Endpoint_Fact_Map row ${rowId}`);
  return row;
}

/** Skip reason for a row, or null when the row can run. Call only when LIVE. */
export function rowSkipReason(rowId: string): string | null {
  return findRow(rowId).requiresToken && readGithubToken() === null ? TOKEN_SKIP_REASON : null;
}

/**
 * Registers a live contract test for a row. Skipped when not LIVE; skipped with
 * `GITHUB_TOKEN not set` when the row needs a token and none is set.
 */
export function liveRowIt(
  rowId: string,
  name: string,
  fn: (row: EndpointFactRow, ctx: TestContext) => Promise<void> | void,
  timeout?: number,
): void {
  liveIt(
    `${rowId} ${name}`,
    async (ctx) => {
      const reason = rowSkipReason(rowId);
      if (reason !== null) ctx.skip(reason);
      await fn(findRow(rowId), ctx);
    },
    timeout,
  );
}

export type HeaderBag = Headers | Readonly<Record<string, string | readonly string[] | undefined>>;

export interface LiveResponse {
  readonly body: unknown;
  readonly bodyText?: string;
  readonly headers?: HeaderBag;
}

function headerPresent(headers: HeaderBag | undefined, name: string): boolean {
  if (headers === undefined) return false;
  if (headers instanceof Headers) return headers.has(name);
  const lower = name.toLowerCase();
  return Object.entries(headers).some(
    ([key, value]) => key.toLowerCase() === lower && value !== undefined,
  );
}

function present(value: unknown, segments: readonly string[]): boolean {
  if (segments.length === 0) return value !== undefined;
  const [head, ...rest] = segments as [string, ...string[]];
  if (head.endsWith("[]")) {
    const key = head.slice(0, -2);
    const arr = key === "" ? value : getMember(value, key);
    if (!Array.isArray(arr)) return false;
    if (rest.length === 0) return true;
    return arr.some((element) => present(element, rest));
  }
  if (head === "rN") {
    if (typeof value !== "object" || value === null) return false;
    return Object.entries(value).some(
      ([key, child]) => /^r\d+$/.test(key) && present(child, rest),
    );
  }
  return present(getMember(value, head), rest);
}

function getMember(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return Object.prototype.hasOwnProperty.call(value, key)
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/** True when one Endpoint_Fact_Map path exists in the response (syntax in endpoint-fact-map.ts). */
export function pathExists(response: LiveResponse, path: string): boolean {
  if (path === "$body") {
    const text = response.bodyText ?? (typeof response.body === "string" ? response.body : "");
    return text.length > 0;
  }
  if (path.startsWith("headers.")) return headerPresent(response.headers, path.slice(8));
  return present(response.body, path.split("."));
}

/** Paths of the row that the response lacks. Rows' notVerifiedPaths are not required (R23.8). */
export function missingPaths(rowId: string, response: LiveResponse): string[] {
  const row = findRow(rowId);
  const optional = new Set(row.notVerifiedPaths ?? []);
  return row.paths.filter((p) => !optional.has(p) && !pathExists(response, p));
}

/**
 * Failure message that names only the row id, the source and the missing path
 * (R23.15). It never contains response content, URLs or headers.
 */
export function formatLiveFailure(row: EndpointFactRow, path: string): string {
  return `live contract failure: row ${row.id}, source ${row.source}, path ${path}`;
}

/** Throws one error per row naming the first missing path; passes when all paths exist (R23.8). */
export function assertRowPaths(rowId: string, response: LiveResponse): void {
  const row = findRow(rowId);
  const missing = missingPaths(rowId, response);
  const first = missing[0];
  if (first !== undefined) throw new Error(formatLiveFailure(row, first));
}
