import { ROUTE_MAX_DURATION_SECONDS } from "../../pipeline/constants";
import { expect, test } from "./support/test";

// Session 21: production timeout guard. Runs only in the `deployed` project (E2E_BASE_URL set),
// against production, with no mock of POST /api/scan. Never part of CI: it makes real scans.
//
// It scans repos in order and stops at the first genuinely uncached scan
// (X-Gravekeeper-Cache: miss), asserting that scan responds in under RESPONSE_LIMIT_MS. Before the
// fix, uncached request/request scans hit the 30 s function timeout (504). Every scan it makes,
// cached or not, is also asserted under the limit. If the whole (deliberately long and varied)
// candidate list is already warm in the Scan_Cache, the test cannot exercise a cold path and skips
// with a clear message rather than failing; the cold path is also proven by the fake-clock property
// test tests/pipeline/api/wall-budget.property.test.ts.

// 28 s: under Vercel's 30 s maxDuration, above the 24 s wall budget plus serialize.
const RESPONSE_LIMIT_MS = 28_000;

// A long, varied pool (npm, PyPI, Cargo) so that a run usually finds at least one repo not yet in
// the Scan_Cache. request/request is the repo from the incident report and is tried first.
const REPOS = [
  "https://github.com/request/request",
  "https://github.com/npm/node-semver",
  "https://github.com/sindresorhus/got",
  "https://github.com/webpack/webpack",
  "https://github.com/babel/babel",
  "https://github.com/prettier/prettier",
  "https://github.com/pallets/werkzeug",
  "https://github.com/psf/requests",
  "https://github.com/tokio-rs/tokio",
  "https://github.com/rayon-rs/rayon",
  "https://github.com/dateutil/dateutil",
  "https://github.com/numpy/numpy",
];

interface ScanOutcome {
  readonly repo: string;
  readonly ms: number;
  readonly status: number;
  readonly cache: string | null;
  readonly ok: boolean;
}

test.skip(!process.env.E2E_BASE_URL, "E2E_BASE_URL is not set");

test("an uncached production scan responds under the function limit", async ({ request }) => {
  test.setTimeout(REPOS.length * (RESPONSE_LIMIT_MS + 5_000) + 60_000);
  expect(RESPONSE_LIMIT_MS, "the limit must be under maxDuration").toBeLessThan(
    ROUTE_MAX_DURATION_SECONDS * 1000,
  );

  const outcomes: ScanOutcome[] = [];
  let uncached: ScanOutcome | null = null;

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

    // Every scan this test makes, cached or not, must answer well under the function limit and
    // never 502/504. This is the direct regression check for the production timeouts.
    expect(outcome.ms, `${repo} responded in ${outcome.ms} ms`).toBeLessThan(RESPONSE_LIMIT_MS);
    expect(outcome.status, `${repo} must not be a gateway timeout`).not.toBe(502);
    expect(outcome.status, `${repo} must not be a function timeout`).not.toBe(504);

    if (cache === "miss") {
      uncached = outcome;
      break; // the cold path is exercised; stop so we do not warm the whole pool needlessly
    }
  }

  test.info().annotations.push(
    ...outcomes.map((o) => ({ type: `scan-${o.cache ?? "unknown"}-ms`, description: `${o.repo}=${o.ms}` })),
  );

  if (uncached === null) {
    test.skip(
      true,
      `every candidate was already warm in the Scan_Cache (${outcomes.length} tried); no cold scan to measure this run`,
    );
    return;
  }

  // The cold scan returned a result or a clear error, within the limit, and not a timeout.
  expect(uncached.ms, `uncached ${uncached.repo} responded in ${uncached.ms} ms`).toBeLessThan(RESPONSE_LIMIT_MS);
  expect(
    uncached.ok || uncached.status !== 200,
    `uncached ${uncached.repo} returned a result or a clear error`,
  ).toBe(true);
});
