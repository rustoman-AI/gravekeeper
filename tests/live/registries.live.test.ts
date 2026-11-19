import { describe, expect } from "vitest";
import { assertRowPaths, liveIt, liveRowIt, type LiveResponse } from "./live-support";

// Requirement 23.8, 23.9, 23.15
// Live contract tests for the registry rows EF-20 (npm), EF-21 (crates.io) and
// EF-22 (PyPI per-version endpoint). Skipped unless GRAVEKEEPER_LIVE_TESTS=1.

const TIMEOUT = 30_000;

interface Fetched {
  readonly status: number;
  readonly response: LiveResponse;
}

async function get(url: string, headers: Record<string, string> = {}): Promise<Fetched> {
  const res = await fetch(url, { headers: { Accept: "application/json", ...headers } });
  const bodyText = await res.text();
  let body: unknown = bodyText;
  try {
    body = JSON.parse(bodyText);
  } catch {
    // non-JSON body
  }
  return { status: res.status, response: { body, bodyText, headers: res.headers } };
}

async function getOk(url: string, headers: Record<string, string> = {}): Promise<LiveResponse> {
  const { status, response } = await get(url, headers);
  if (status < 200 || status >= 300) throw new Error(`live request failed with HTTP ${status}`);
  return response;
}

describe("Registry live contract (EF-20 to EF-22)", () => {
  // `request` is deprecated on npm, so `deprecated` is present.
  liveRowIt("EF-20", "GET registry.npmjs.org/{name}/latest", async () => {
    assertRowPaths("EF-20", await getOk("https://registry.npmjs.org/request/latest"));
  }, TIMEOUT);

  liveRowIt("EF-21", "GET crates.io/api/v1/crates/{name}/owners (User-Agent)", async () => {
    assertRowPaths(
      "EF-21",
      await getOk("https://crates.io/api/v1/crates/serde/owners", { "User-Agent": "gravekeeper" }),
    );
  }, TIMEOUT);

  liveRowIt("EF-22", "GET pypi.org/pypi/{name}/{version}/json", async () => {
    assertRowPaths("EF-22", await getOk("https://pypi.org/pypi/requests/2.31.0/json"));
  }, TIMEOUT);

  // EF-20 marks scoped-name encoding as not verified. The adapter uses plain
  // encodeURIComponent, so a failure here is a live/table difference.
  liveIt("EF-20 scoped name %40babel%2Fcore/latest (informational)", async () => {
    const { status, response } = await get("https://registry.npmjs.org/%40babel%2Fcore/latest");
    const body = response.body;
    const hasMaintainers =
      typeof body === "object" &&
      body !== null &&
      Array.isArray((body as Record<string, unknown>).maintainers);
    console.info(`EF-20 scoped-name: status=${status} maintainers=${hasMaintainers}`);
    expect(status, "EF-20 scoped-name request status").toBe(200);
  }, TIMEOUT);
});
