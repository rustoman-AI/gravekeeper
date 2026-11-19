import { describe } from "vitest";
import { assertRowPaths, liveRowIt, type LiveResponse } from "./live-support";

// Requirement 23.8, 23.9, 23.15
// Live contract tests for the verified OSV rows EF-5 to EF-10. Skipped unless
// GRAVEKEEPER_LIVE_TESTS=1. EF-11 (next_page_token) is not verified and is
// excluded (R23.13).

const TIMEOUT = 30_000;
const OSV = "https://api.osv.dev/v1";
/** lodash 4.17.15 has known advisories. */
const QUERY = { queries: [{ package: { name: "lodash", ecosystem: "npm" }, version: "4.17.15" }] };
/** GitHub advisory with aliases, database_specific.severity and a CVSS_V3 severity entry. */
const ADVISORY_ID = "GHSA-p6mc-m468-83gw";
/** Withdrawn GitHub advisory (carries `withdrawn`). */
const WITHDRAWN_ID = "GHSA-wq4c-wm6x-jw44";
/** RustSec advisory with affected[].database_specific.informational. */
const INFORMATIONAL_ID = "RUSTSEC-2020-0036";

async function osv(path: string, init?: RequestInit): Promise<LiveResponse> {
  const res = await fetch(`${OSV}${path}`, init);
  if (!res.ok) throw new Error(`live request failed with HTTP ${res.status}`);
  const bodyText = await res.text();
  return { body: JSON.parse(bodyText) as unknown, bodyText, headers: res.headers };
}

const vuln = (id: string): Promise<LiveResponse> => osv(`/vulns/${encodeURIComponent(id)}`);

describe("OSV live contract (EF-5 to EF-10)", () => {
  liveRowIt("EF-5", "POST /v1/querybatch", async () => {
    assertRowPaths(
      "EF-5",
      await osv("/querybatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(QUERY),
      }),
    );
  }, TIMEOUT);

  // The withdrawn advisory has every EF-6 path, including `withdrawn`.
  liveRowIt("EF-6", "GET /v1/vulns/{id}", async () => {
    assertRowPaths("EF-6", await vuln(WITHDRAWN_ID));
  }, TIMEOUT);

  liveRowIt("EF-7", "advisory severity fields", async () => {
    assertRowPaths("EF-7", await vuln(ADVISORY_ID));
  }, TIMEOUT);

  liveRowIt("EF-8", "withdrawn flag", async () => {
    assertRowPaths("EF-8", await vuln(WITHDRAWN_ID));
  }, TIMEOUT);

  liveRowIt("EF-9", "aliases", async () => {
    assertRowPaths("EF-9", await vuln(ADVISORY_ID));
  }, TIMEOUT);

  liveRowIt("EF-10", "informational advisory", async () => {
    assertRowPaths("EF-10", await vuln(INFORMATIONAL_ID));
  }, TIMEOUT);
});
