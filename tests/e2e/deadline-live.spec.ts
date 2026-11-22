import { ROUTE_MAX_DURATION_SECONDS } from "../../pipeline/constants";
import { expect, test } from "./support/test";

// Session 21: production timeout guard. Runs only in the `deployed` project (E2E_BASE_URL set),
// against production, with no mock of POST /api/scan. Never part of CI: it makes real scans.
//
// It scans repos until it gets at least one uncached scan (X-Gravekeeper-Cache: miss) and asserts
// that every scan responds in under RESPONSE_LIMIT_MS (< ROUTE_MAX_DURATION_SECONDS). Before the
// fix, uncached request/request scans hit the 30 s function timeout (504).

// 28 s: under Vercel's 30 s maxDuration, above the 24 s wall budget plus serialize.
const RESPONSE_LIMIT_MS = 28_000;

// Pick several so that at least one is uncached when the test runs. request/request is the repo
// from the incident report; the rest are a mix of npm, PyPI and Cargo.
const REPOS = [
  "https://github.com/request/request",
  "https://github.com/pallets/flask",
  "https://github.com/serde-rs/serde",
  "https://github.com/axios/axios",
  "https://github.com/pytest-dev/pytest",
];

interface ScanOutcome {
  readonly repo: string;
  readonly ms: number;
  readonly status: number;
  readonly cache: string | null;
  readonly ok: boolean;
}

test.skip(!process.env.E2E_BASE_URL, "E2E_BASE_URL is not set");

test("every production scan responds under the function limit, including an uncached one", async ({ request }) => {
  test.setTimeout(REPOS.length * (RESPONSE_LIMIT_MS + 5_000) + 60_000);
  expect(RESPONSE_LIMIT_MS, "the limit must be under maxDuration").toBeLessThan(
    ROUTE_MAX_DURATION_SECONDS * 1000,
  );

  const outcomes: ScanOutcome[] = [];
  for (const repo of REPOS) {
    const started = Date.now();
    const response = await request.post("/api/scan", {
      data: { repoUrl: repo },
      headers: { "content-type": "application/json", "cache-control": "no-cache" },
      timeout: RESPONSE_LIMIT_MS + 4_000,
      failOnStatusCode: false,
    });
    const ms = Date.now() - started;
    const headers = response.headers();
    const cache = headers["x-gravekeeper-cache"] ?? null;
    let ok = false;
    try {
      const body = (await response.json()) as { ok?: boolean };
      ok = body.ok === true;
    } catch {
      ok = false;
    }
    const outcome: ScanOutcome = { repo, ms, status: response.status(), cache, ok };
    outcomes.push(outcome);
    console.log(`deadline-live: ${repo} -> ${ms} ms, status ${response.status()}, cache ${cache ?? "?"}`);

    // Every scan, cached or not, must answer well under the function limit and never 504.
    expect(outcome.ms, `${repo} responded in ${outcome.ms} ms`).toBeLessThan(RESPONSE_LIMIT_MS);
    expect(outcome.status, `${repo} must not time out`).not.toBe(504);
    expect(outcome.status, `${repo} must not be a gateway timeout`).not.toBe(502);
  }

  // The point of the test: at least one scan was genuinely uncached (a cold scan), and it still
  // answered under the limit. If every candidate was already warm this run cannot prove the fix,
  // so it fails loudly rather than passing on cache hits alone.
  const uncached = outcomes.filter((o) => o.cache === "miss");
  expect(uncached.length, "no uncached scan was observed; all candidates were cached").toBeGreaterThan(0);
  for (const o of uncached) {
    expect(o.ms, `uncached ${o.repo} responded in ${o.ms} ms`).toBeLessThan(RESPONSE_LIMIT_MS);
    expect(o.ok || o.status !== 200, `uncached ${o.repo} returned a result or a clear error`).toBe(true);
  }

  test.info().annotations.push(
    ...outcomes.map((o) => ({ type: `scan-${o.cache ?? "unknown"}-ms`, description: `${o.repo}=${o.ms}` })),
  );
});
