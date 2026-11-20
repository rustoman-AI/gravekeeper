import type { Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { CLIENT_FETCH_TIMEOUT_MS } from "../../view-model";
import {
  NO_MANIFESTS_MESSAGE,
  degradedBody,
  emptyBody,
  noteOf,
  okHandler,
  pickerBody,
  resultPath,
} from "./support/bodies";
import { loadScan, type FixtureName } from "./support/fixtures";
import {
  abortRequest,
  hang,
  mockScan,
  respondWithError,
  respondWithFixture,
  respondWithRaw,
  type ScanHandler,
} from "./support/mock-scan";
import { expect, test } from "./support/test";

/**
 * Screenshots of every screen S1 to S18 of the design "Screen list" (Requirements 20.10, 20.11).
 *
 * Runs only when `SCREENSHOTS=1` is set, so a normal `npx playwright test` does not rewrite
 * the committed files in `docs/screenshots/`:
 *
 *   $env:SCREENSHOTS='1'; npx playwright test tests/e2e/screenshots.spec.ts --project=desktop --project=mobile
 *
 * Files are `docs/screenshots/<screen>-<variant>-<viewport>.png` (viewport is the project name,
 * `desktop` 1280x800 or `mobile` 390x844) and overwrite earlier files of the same name.
 * `docs/screenshots/m1/` and `docs/screenshots/m2/` are not touched. `/api/scan` is always mocked.
 * Determinism: reduced motion, fake clock at 2026-11-19T12:00:00Z, fonts ready, animations
 * disabled, caret hidden, viewport (not full page) screenshots.
 */

const SHOT_DIR = path.join(process.cwd(), "docs", "screenshots");
const REPO = "https://github.com/request/request";
const FIXTURES: readonly FixtureName[] = ["request", "canopy", "zoxide", "synthetic-restless"];
const START = new Date("2026-11-19T12:00:00Z");
const PAUSE_AT = new Date("2026-11-19T12:01:00Z");

test.use({ reducedMotion: "reduce" });

test.beforeEach(async ({ page }) => {
  test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to write docs/screenshots");
  await page.clock.install({ time: START });
});

async function shoot(page: Page, name: string): Promise<void> {
  const viewport = test.info().project.name;
  await page.evaluate(() => document.fonts.ready);
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(SHOT_DIR, `${name}-${viewport}.png`),
    animations: "disabled",
    caret: "hide",
  });
}

/** Waits for the scene (or list) to render and its windowed bands to fill. */
async function settleResults(page: Page): Promise<void> {
  await expect(page.locator("button.gk-plot").first()).toBeVisible();
  await page.waitForTimeout(400);
}

async function openResult(page: Page, fixture: FixtureName, view?: "list"): Promise<void> {
  await mockScan(page, respondWithFixture(fixture));
  await page.goto(resultPath(loadScan(fixture), view));
  if (view === "list") {
    await expect(page.getByRole("table")).toBeVisible();
    await page.waitForTimeout(400);
  } else {
    await settleResults(page);
  }
}

async function submit(page: Page, repo: string = REPO): Promise<void> {
  await page.getByLabel("GitHub repository URL").fill(repo);
  await page.getByRole("button", { name: "Dig up" }).click();
}

/** Loads the landing page, freezes the clock, then submits (pause after load, before submit). */
async function submitFrozen(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Dig up" })).toBeVisible();
  await page.clock.pauseAt(PAUSE_AT);
  await submit(page);
}

async function gotoScan(page: Page, repo: string = REPO, manifests: string[] = []): Promise<void> {
  const query = [
    `repo=${encodeURIComponent(repo)}`,
    ...manifests.map((m) => `manifest=${encodeURIComponent(m)}`),
  ];
  await page.goto(`/?${query.join("&")}`);
}

async function errorHeading(page: Page, heading: string): Promise<void> {
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  await page.waitForTimeout(200);
}

// S1
test("S1 landing", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Dig up" })).toBeVisible();
  await shoot(page, "landing-default");
  await page.getByRole("button", { name: "Dig up" }).click();
  await expect(page.getByText("Enter a repository URL")).toBeVisible();
  await shoot(page, "landing-empty-input");
});

// S2
test("S2 scanning stages", async ({ page }) => {
  await mockScan(page, hang());
  await submitFrozen(page);
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  const stages = [
    "Reading the repository",
    "Checking the registries",
    "Consulting the vulnerability records",
    "Asking GitHub about the living",
  ];
  const steps = [0, 2000, 4000, 4000];
  for (let i = 0; i < stages.length; i++) {
    if (steps[i]) await page.clock.runFor(steps[i]!);
    await expect(page.getByRole("status")).toHaveText(stages[i]!);
    await shoot(page, `scanning-stage${String(i + 1)}`);
  }
});

// S3, S4, S6
for (const fixture of FIXTURES) {
  test(`S3 S4 S6 results and notes for ${fixture}`, async ({ page }) => {
    await openResult(page, fixture);
    await shoot(page, `results-scene-${fixture}`);
    await page.getByRole("heading", { name: "The caretaker's notes" }).evaluate((el) => {
      el.scrollIntoView({ block: "start" });
    });
    await page.waitForTimeout(400);
    await shoot(page, `notes-${fixture}`);

    await openResult(page, fixture, "list");
    await shoot(page, `results-list-${fixture}`);
  });
}

// S5
const KINDS = ["tombstone", "overgrown", "ghost", "restless", "lantern", "unmarked"] as const;
for (const kind of KINDS) {
  test(`S5 detail ${kind}`, async ({ page }) => {
    await openResult(page, "synthetic-restless");
    await page.locator(`button.gk-plot[data-kind="${kind}"]`).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.waitForTimeout(400);
    await shoot(page, `detail-${kind}`);
  });
}

// S6 degraded
test("S6 notes degraded", async ({ page }) => {
  const body = degradedBody();
  await mockScan(page, okHandler(body));
  await page.goto(resultPath(body));
  await expect(page.getByRole("heading", { name: "The caretaker's notes" })).toBeVisible();
  await settleResults(page);
  await page.getByRole("heading", { name: "The caretaker's notes" }).evaluate((el) => {
    el.scrollIntoView({ block: "start" });
  });
  await page.waitForTimeout(400);
  await shoot(page, "notes-degraded");
});

// S7
test("S7 empty graveyard", async ({ page }) => {
  const body = emptyBody([noteOf("no-manifests", NO_MANIFESTS_MESSAGE)], []);
  await mockScan(page, okHandler(body));
  await page.goto(resultPath(body));
  await expect(page.getByText(NO_MANIFESTS_MESSAGE, { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(200);
  await shoot(page, "results-empty");
});

// S8
test("S8 manifest picker", async ({ page }) => {
  const body = pickerBody();
  await mockScan(page, okHandler(body));
  await page.goto(resultPath(body));
  await expect(page.getByRole("button", { name: "Scan selected manifests" })).toBeVisible();
  await page.waitForTimeout(200);
  await shoot(page, "picker-results");
});

// S9
const PARTS = ["url", "host", "path", "owner", "repository", "branch"] as const;
for (const part of PARTS) {
  test(`S9 error invalid-url ${part}`, async ({ page }) => {
    await mockScan(
      page,
      respondWithError(400, {
        code: "invalid-url",
        message: `The ${part} of the URL is not accepted.`,
        details: { part },
      }),
    );
    await gotoScan(page, "https://example.com/nope");
    await errorHeading(page, "That is not a grave we can find");
    await shoot(page, `error-invalid-url-${part}`);
  });
}

// S10, S11
test("S10 error repo-not-found", async ({ page }) => {
  await mockScan(
    page,
    respondWithError(404, {
      code: "repo-not-found",
      message: "This repository does not exist or is not public.",
    }),
  );
  await gotoScan(page);
  await errorHeading(page, "No such graveyard");
  await shoot(page, "error-repo-not-found");
});

test("S11 error branch-not-found", async ({ page }) => {
  await mockScan(
    page,
    respondWithError(404, {
      code: "branch-not-found",
      message: "The branch nope does not exist in this repository.",
      details: { branch: "nope" },
    }),
  );
  await gotoScan(page, `${REPO}/tree/nope`);
  await errorHeading(page, "That branch has no graves");
  await shoot(page, "error-branch-not-found");
});

// S12, S13
const CANDIDATES = ["package.json", "apps/web/package.json", "apps/api/package.json"];
const MANIFEST_ERRORS = [
  {
    code: "too-many-manifests",
    heading: "Too many plots at once",
    status: 400,
    message: "Choose at most 10 manifests per scan.",
    details: (candidates: string[]) => ({ limit: 10, candidates }),
    selected: ["a/package.json", "b/package.json"],
  },
  {
    code: "manifest-not-found",
    heading: "That manifest is not here",
    status: 404,
    message: "The manifest missing/package.json was not found in this repository.",
    details: (candidates: string[]) => ({ path: "missing/package.json", candidates }),
    selected: ["missing/package.json"],
  },
];
for (const v of MANIFEST_ERRORS) {
  for (const [variant, candidates] of [
    ["candidates", CANDIDATES],
    ["empty", [] as string[]],
  ] as const) {
    test(`S12 S13 error ${v.code} ${variant}`, async ({ page }) => {
      await mockScan(
        page,
        respondWithError(v.status, {
          code: v.code,
          message: v.message,
          details: v.details([...candidates]),
        }),
      );
      await gotoScan(page, REPO, v.selected);
      await errorHeading(page, v.heading);
      await shoot(page, `error-${v.code}-${variant}`);
    });
  }
}

// S14 to S16: retry cooldown, screenshots taken on a paused clock at the start of the countdown.
const UPSTREAM_MESSAGE =
  "GitHub could not be reached, so the repository could not be read. Try again in a minute.";
const FROZEN_ERRORS: Array<{
  name: string;
  heading: string;
  handler: ScanHandler;
}> = [
  {
    name: "error-upstream-503",
    heading: "The gates are shut for now",
    handler: respondWithError(
      503,
      { code: "upstream-unavailable", message: UPSTREAM_MESSAGE, details: { source: "github" } },
      { "Retry-After": "30" },
    ),
  },
  {
    name: "error-upstream-502",
    heading: "The gates are shut for now",
    handler: respondWithError(502, {
      code: "upstream-unavailable",
      message: UPSTREAM_MESSAGE,
      details: { source: "github" },
    }),
  },
  {
    name: "error-deadline-exceeded",
    heading: "The night ran out",
    handler: respondWithError(504, {
      code: "deadline-exceeded",
      message: "The repository could not be read in time. Try again in a minute.",
    }),
  },
  {
    name: "error-internal-error",
    heading: "The gravedigger tripped",
    handler: respondWithError(500, {
      code: "internal-error",
      message: "Something went wrong on our side. Try again in a minute.",
    }),
  },
];
for (const e of FROZEN_ERRORS) {
  test(`S14 S15 S16 ${e.name}`, async ({ page }) => {
    await mockScan(page, e.handler);
    await submitFrozen(page);
    await errorHeading(page, e.heading);
    await shoot(page, e.name);
  });
}

// S17
const REASONS = [
  "invalid-json",
  "invalid-type",
  "unknown-field",
  "missing-field",
  "too-many-items",
  "branch-conflict",
  "body-too-large",
  "unsupported-media-type",
  "method-not-allowed",
] as const;
for (const reason of REASONS) {
  test(`S17 error invalid-request ${reason}`, async ({ page }) => {
    const status =
      reason === "body-too-large"
        ? 413
        : reason === "method-not-allowed"
          ? 405
          : reason === "unsupported-media-type"
            ? 415
            : 400;
    await mockScan(
      page,
      respondWithError(status, {
        code: "invalid-request",
        message: `The request is not valid: ${reason}.`,
        details: { reason },
      }),
    );
    await gotoScan(page);
    await errorHeading(page, "The request was not understood");
    await shoot(page, `error-invalid-request-${reason}`);
  });
}

// S18
test("S18 client failure network-failure", async ({ page }) => {
  await mockScan(page, abortRequest("failed"));
  await page.goto("/");
  await submit(page);
  await errorHeading(page, "The road is washed out");
  await shoot(page, "error-network-failure");
});

test("S18 client failure timeout", async ({ page }) => {
  await mockScan(page, hang());
  await submitFrozen(page);
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  await page.clock.runFor(CLIENT_FETCH_TIMEOUT_MS);
  await errorHeading(page, "The night ran out");
  await shoot(page, "error-timeout");
});

test("S18 client failure malformed-response", async ({ page }) => {
  await mockScan(page, respondWithRaw("<html>not json</html>", { contentType: "text/html" }));
  await page.goto("/");
  await submit(page);
  await errorHeading(page, "The records are garbled");
  await shoot(page, "error-malformed-response");
});
