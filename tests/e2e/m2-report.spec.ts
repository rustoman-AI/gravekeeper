import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AXE_TAGS } from "./support/a11y";
import {
  NO_MANIFESTS_MESSAGE,
  degradedBody,
  emptyBody,
  noteOf,
  okHandler,
  pickerBody,
  resultPath,
} from "./support/bodies";
import { abortRequest, mockScan, respondWithError, type ScanHandler } from "./support/mock-scan";
import { expect, test } from "./support/test";

/**
 * Milestone 2 report screenshots and axe measurements.
 *
 * Runs only when `M2_REPORT=1` is set and only in the `desktop` project, so a normal
 * `npx playwright test` does not rewrite the committed files in `docs/screenshots/m2/`.
 * The `deployed` project only matches deployed/live-scan specs, so it never picks this one up.
 *
 *   $env:M2_REPORT='1'; npx playwright test tests/e2e/m2-report.spec.ts --project=desktop
 *
 * Outputs: 14 PNGs (1440x900, reduced motion, fixed clock) and README.md in
 * `docs/screenshots/m2/`; the per-screen axe result under the key `m2A11y` of
 * `test-results/m2-measurements.json` (other keys are kept). `/api/scan` is always mocked.
 */

const REPO = "https://github.com/request/request";
const SHOT_DIR = path.join(process.cwd(), "docs", "screenshots", "m2");
const MEASUREMENTS = path.join(process.cwd(), "test-results", "m2-measurements.json");
const START = new Date("2026-11-19T12:00:00Z");
const PAUSE_AT = new Date("2026-11-19T12:01:00Z");
const CANDIDATES = ["package.json", "apps/web/package.json", "apps/api/package.json"];

type A11yEntry = { violationCount: number; ruleIds: string[]; url: string };
const a11y: Record<string, A11yEntry> = {};
const shots: Array<{ screen: string; description: string }> = [];

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });

test.afterAll(() => {
  if (Object.keys(a11y).length === 0) return;
  mkdirSync(path.dirname(MEASUREMENTS), { recursive: true });
  let existing: Record<string, unknown> = {};
  if (existsSync(MEASUREMENTS)) {
    try {
      existing = JSON.parse(readFileSync(MEASUREMENTS, "utf8")) as Record<string, unknown>;
    } catch {
      existing = {};
    }
  }
  existing.m2A11y = a11y;
  writeFileSync(MEASUREMENTS, `${JSON.stringify(existing, null, 2)}\n`);
});

async function shootAndMeasure(page: Page, screen: string, description: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: path.join(SHOT_DIR, `${screen}.png`),
    animations: "disabled",
    caret: "hide",
  });
  shots.push({ screen, description });
  await page.clock.resume(); // axe schedules timers and hangs on a paused clock
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  a11y[screen] = {
    violationCount: results.violations.length,
    ruleIds: results.violations.map((v) => v.id),
    url: page.url(),
  };
}

async function gotoScan(page: Page, repo: string = REPO, manifests: string[] = []): Promise<void> {
  const query = [
    `repo=${encodeURIComponent(repo)}`,
    ...manifests.map((m) => `manifest=${encodeURIComponent(m)}`),
  ];
  await page.goto(`/?${query.join("&")}`);
}

/** Loads the landing page, freezes the clock, then submits (pause after load, before submit). */
async function submitFrozen(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Dig up" })).toBeVisible();
  await page.clock.pauseAt(PAUSE_AT);
  await page.getByLabel("GitHub repository URL").fill(REPO);
  await page.getByRole("button", { name: "Dig up" }).click();
}

async function heading(page: Page, text: string): Promise<void> {
  await expect(page.getByRole("heading", { level: 1, name: text })).toBeVisible();
  await page.waitForTimeout(200);
}

test("M2 report screenshots and accessibility measurements", async ({ context }) => {
  test.skip(
    !process.env.M2_REPORT || test.info().project.name !== "desktop",
    "set M2_REPORT=1 and use the desktop project to produce the M2 report",
  );
  test.setTimeout(240_000);

  /** Runs one screen on a fresh page with its own fake clock and mocked /api/scan. */
  async function screen(handler: ScanHandler, run: (page: Page) => Promise<void>): Promise<void> {
    const page = await context.newPage();
    try {
      await page.clock.install({ time: START });
      await mockScan(page, handler);
      await run(page);
    } finally {
      await page.close();
    }
  }

  // notes-section: degraded result, notes heading at the top of the viewport
  const degraded = degradedBody();
  await screen(okHandler(degraded), async (page) => {
    await page.goto(resultPath(degraded));
    await expect(page.getByRole("heading", { name: "The caretaker's notes" })).toBeVisible();
    await expect(page.locator("button.gk-plot").first()).toBeVisible();
    await page.waitForTimeout(400);
    await page.getByRole("heading", { name: "The caretaker's notes" }).evaluate((el) => {
      el.scrollIntoView({ block: "start" });
    });
    await page.waitForTimeout(400);
    await shootAndMeasure(page, "notes-section", "The caretaker's notes of a degraded result");
  });

  // invalid-url (part url)
  await screen(
    respondWithError(400, {
      code: "invalid-url",
      message: "The URL is not accepted.",
      details: { part: "url" },
    }),
    async (page) => {
      await gotoScan(page, "https://example.com/nope");
      await heading(page, "That is not a grave we can find");
      await shootAndMeasure(page, "error-invalid-url", "Error invalid-url (part url)");
    },
  );

  // invalid-request
  await screen(
    respondWithError(400, {
      code: "invalid-request",
      message: "The request is not valid: invalid-json.",
      details: { reason: "invalid-json" },
    }),
    async (page) => {
      await gotoScan(page);
      await heading(page, "The request was not understood");
      await shootAndMeasure(page, "error-invalid-request", "Error invalid-request");
    },
  );

  // repo-not-found
  await screen(
    respondWithError(404, {
      code: "repo-not-found",
      message: "This repository does not exist or is not public.",
    }),
    async (page) => {
      await gotoScan(page);
      await heading(page, "No such graveyard");
      await shootAndMeasure(page, "error-repo-not-found", "Error repo-not-found");
    },
  );

  // branch-not-found
  await screen(
    respondWithError(404, {
      code: "branch-not-found",
      message: "The branch nope does not exist in this repository.",
      details: { branch: "nope" },
    }),
    async (page) => {
      await gotoScan(page, `${REPO}/tree/nope`);
      await heading(page, "That branch has no graves");
      await shootAndMeasure(page, "error-branch-not-found", "Error branch-not-found");
    },
  );

  // too-many-manifests, with candidates (picker)
  await screen(
    respondWithError(400, {
      code: "too-many-manifests",
      message: "Choose at most 10 manifests per scan.",
      details: { limit: 10, candidates: CANDIDATES },
    }),
    async (page) => {
      await gotoScan(page, REPO, ["a/package.json", "b/package.json"]);
      await heading(page, "Too many plots at once");
      await expect(page.getByRole("checkbox")).toHaveCount(CANDIDATES.length);
      await shootAndMeasure(
        page,
        "error-too-many-manifests",
        "Error too-many-manifests with the manifest picker",
      );
    },
  );

  // manifest-not-found, with candidates (picker)
  await screen(
    respondWithError(404, {
      code: "manifest-not-found",
      message: "The manifest missing/package.json was not found in this repository.",
      details: { path: "missing/package.json", candidates: CANDIDATES },
    }),
    async (page) => {
      await gotoScan(page, REPO, ["missing/package.json"]);
      await heading(page, "That manifest is not here");
      await expect(page.getByRole("checkbox")).toHaveCount(CANDIDATES.length);
      await shootAndMeasure(
        page,
        "error-manifest-not-found",
        "Error manifest-not-found with the manifest picker",
      );
    },
  );

  // upstream-unavailable 503 (Retry-After 30, start of the countdown) and 502
  const UPSTREAM =
    "GitHub could not be reached, so the repository could not be read. Try again in a minute.";
  await screen(
    respondWithError(
      503,
      { code: "upstream-unavailable", message: UPSTREAM, details: { source: "github" } },
      { "Retry-After": "30" },
    ),
    async (page) => {
      await submitFrozen(page);
      await heading(page, "The gates are shut for now");
      await expect(page.getByText("You can try again in 30 seconds")).toBeVisible();
      await shootAndMeasure(page, "error-upstream-503", "Error upstream-unavailable, HTTP 503, countdown at 30 s");
    },
  );
  await screen(
    respondWithError(502, {
      code: "upstream-unavailable",
      message: UPSTREAM,
      details: { source: "github" },
    }),
    async (page) => {
      await submitFrozen(page);
      await heading(page, "The gates are shut for now");
      await expect(page.getByText("You can try again in 10 seconds")).toBeVisible();
      await shootAndMeasure(page, "error-upstream-502", "Error upstream-unavailable, HTTP 502, fallback countdown at 10 s");
    },
  );

  // deadline-exceeded, internal-error
  await screen(
    respondWithError(504, {
      code: "deadline-exceeded",
      message: "The repository could not be read in time. Try again in a minute.",
    }),
    async (page) => {
      await submitFrozen(page);
      await heading(page, "The night ran out");
      await shootAndMeasure(page, "error-deadline-exceeded", "Error deadline-exceeded");
    },
  );
  await screen(
    respondWithError(500, {
      code: "internal-error",
      message: "Something went wrong on our side. Try again in a minute.",
    }),
    async (page) => {
      await submitFrozen(page);
      await heading(page, "The gravedigger tripped");
      await shootAndMeasure(page, "error-internal-error", "Error internal-error");
    },
  );

  // picker (no-root-manifest)
  const picker = pickerBody();
  await screen(okHandler(picker), async (page) => {
    await page.goto(resultPath(picker));
    await expect(page.getByRole("button", { name: "Scan selected manifests" })).toBeVisible();
    await page.waitForTimeout(200);
    await shootAndMeasure(page, "picker", "Manifest picker of the no-root-manifest note");
  });

  // empty graveyard
  const empty = emptyBody([noteOf("no-manifests", NO_MANIFESTS_MESSAGE)], []);
  await screen(okHandler(empty), async (page) => {
    await page.goto(resultPath(empty));
    await expect(page.getByText(NO_MANIFESTS_MESSAGE, { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(200);
    await shootAndMeasure(page, "empty-graveyard", "Empty graveyard (no manifests found)");
  });

  // client failure: network-failure
  await screen(abortRequest("failed"), async (page) => {
    await submitFrozen(page);
    await heading(page, "The road is washed out");
    await expect(page.getByText("The server could not be reached.", { exact: true })).toBeVisible();
    await shootAndMeasure(page, "client-failure-network-failure", "Client failure network-failure");
  });

  mkdirSync(SHOT_DIR, { recursive: true });
  writeFileSync(
    path.join(SHOT_DIR, "README.md"),
    [
      "# Milestone 2 screenshots",
      "",
      "Produced by `tests/e2e/m2-report.spec.ts` (`M2_REPORT=1`, `desktop` project): 1440x900 viewport,",
      "`reducedMotion: 'reduce'`, fake clock fixed at 2026-11-19T12:00:00Z, `/api/scan` mocked.",
      "",
      "| File | Screen |",
      "| --- | --- |",
      ...shots.map((s) => `| \`${s.screen}.png\` | ${s.description}. |`),
      "",
    ].join("\n"),
  );

  for (const [name, entry] of Object.entries(a11y)) {
    expect.soft(entry.ruleIds, `axe violations on ${name}`).toEqual([]);
  }
});
