import { describe, expect } from "vitest";
import { assertRowPaths, liveRowIt, type LiveResponse } from "./live-support";

// Requirement 23.8, 23.9, 23.15
// Live contract tests for the verified deps.dev rows EF-1, EF-2 and EF-25.
// Skipped unless GRAVEKEEPER_LIVE_TESTS=1. No token is needed.

const TIMEOUT = 30_000;
const BASE = "https://api.deps.dev/v3";
const PACKAGE = "lodash";
const VERSION = "4.17.21";
const SCORED_ADVISORY = "GHSA-p8p7-x288-28g6";
const WITHDRAWN_ADVISORY = "GHSA-w2j9-qh3j-4h63";
const HEADERS: Record<string, string> = { "User-Agent": "gravekeeper-live-contract-tests" };

async function get(url: string): Promise<{ status: number; response: LiveResponse }> {
  const res = await fetch(url, { headers: HEADERS });
  const bodyText = await res.text();
  let body: unknown = bodyText;
  try {
    body = JSON.parse(bodyText);
  } catch {
    // non-JSON body
  }
  return { status: res.status, response: { body, bodyText, headers: res.headers } };
}

async function getOk(url: string): Promise<LiveResponse> {
  const { status, response } = await get(url);
  if (status !== 200) throw new Error(`live request failed with HTTP ${status}`);
  return response;
}

describe("deps.dev live contract (EF-1, EF-2, EF-25)", () => {
  liveRowIt("EF-1", "GET /systems/npm/packages/{name}", async () => {
    assertRowPaths("EF-1", await getOk(`${BASE}/systems/npm/packages/${PACKAGE}`));
  }, TIMEOUT);

  liveRowIt("EF-2", "GET /systems/npm/packages/{name}/versions/{version}", async () => {
    assertRowPaths(
      "EF-2",
      await getOk(`${BASE}/systems/npm/packages/${PACKAGE}/versions/${VERSION}`),
    );
  }, TIMEOUT);

  liveRowIt("EF-25", "GET /advisories/{id} has advisoryKey.id and cvss3Score", async () => {
    assertRowPaths("EF-25", await getOk(`${BASE}/advisories/${SCORED_ADVISORY}`));
  }, TIMEOUT);

  liveRowIt("EF-25", "GET /advisories/{id} of a withdrawn advisory returns 404", async () => {
    const { status } = await get(`${BASE}/advisories/${WITHDRAWN_ADVISORY}`);
    expect(status).toBe(404);
  }, TIMEOUT);
});
