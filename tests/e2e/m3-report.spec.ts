import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildPackageRows, parseScanResponse } from "../../view-model";
import { AXE_TAGS } from "./support/a11y";
import { resultPath } from "./support/bodies";
import { loadScan, type FixtureName } from "./support/fixtures";
import { hang, mockScan, respondWithFixture } from "./support/mock-scan";
import { expect, test } from "./support/test";

/**
 * Milestone 3 report screenshots and axe measurements.
 *
 * Runs only when `M3_REPORT=1` is set and only in the `desktop` project, so a normal
 * `npx playwright test` does not rewrite the committed files in `docs/screenshots/m3/`.
 *
 *   $env:M3_REPORT='1'; npx playwright test tests/e2e/m3-report.spec.ts --project=desktop
 *
 * Outputs: 7 PNGs (six at 1440x900, one at 390x844) and README.md in `docs/screenshots/m3/`;
 * the per-screen axe result under the key `m3A11y` of `test-results/m3-measurements.json`
 * (other keys, such as `scenePerf` and `jsBudget`, are kept). `/api/scan` is always mocked.
 * Graveyard-art Requirements 19.2, 19.3, 14.9.
 */

const SHOT_DIR = path.join(process.cwd(), "docs", "screenshots", "m3");
const MEASUREMENTS = path.join(process.cwd(), "test-results", "m3-measurements.json");
const START = new Date("2026-11-19T12:00:00Z");
const PAUSE_AT = new Date("2026-11-19T12:01:00Z");
const SCAN_REPO = "https://github.com/request/request";
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

type A11yEntry = { violationCount: number; ruleIds: string[]; url: string };
const a11y: Record<string, A11yEntry> = {};
const shots: Array<{ file: string; description: string }> = [];

test.use({ viewport: DESKTOP, reducedMotion: "reduce" });

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
  existing.m3A11y = a11y;
  writeFileSync(MEASUREMENTS, `${JSON.stringify(existing, null, 2)}\n`);
});

async function shootAndMeasure(page: Page, screen: string, description: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: path.join(SHOT_DIR, `${screen}.png`),
    animations: "disabled",
    caret: "hide",
  });
  shots.push({ file: `${screen}.png`, description });
  await page.clock.resume(); // axe schedules timers and hangs on a paused clock
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  a11y[screen] = {
    violationCount: results.violations.length,
    ruleIds: results.violations.map((v) => v.id),
    url: page.url(),
  };
}

function rowCount(fixture: FixtureName): number {
  const outcome = parseScanResponse(200, { get: () => null }, loadScan(fixture));
  if (outcome.kind !== "result") throw new Error(`${fixture} fixture did not parse`);
  return buildPackageRows(outcome.result).length;
}

/** Opens a result and waits for one `.gk-plot` button per row. */
async function openResults(page: Page, fixture: FixtureName): Promise<void> {
  await mockScan(page, respondWithFixture(fixture));
  await page.goto(resultPath(loadScan(fixture)));
  await expect(page.locator(".gk-scene")).toBeVisible();
  await expect(page.locator("button.gk-plot")).toHaveCount(rowCount(fixture), { timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(300);
}

/** Asserts the first plot's art box starts above the fold (Requirement 14.9). */
async function expectArtAboveFold(page: Page): Promise<void> {
  expect(await page.evaluate(() => window.scrollY), "page must not be scrolled").toBe(0);
  await page.addStyleTag({ content: ".gk-plot-art{animation:none !important}" });
  const art = page.locator("button.gk-plot .gk-plot-art").first();
  await expect(art).toBeAttached();
  const m = await art.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, viewport: window.innerHeight };
  });
  expect(m.top, JSON.stringify(m)).toBeLessThan(m.viewport);
}

test("M3 report screenshots and accessibility measurements", async ({ context }) => {
  test.skip(
    !process.env.M3_REPORT || test.info().project.name !== "desktop",
    "set M3_REPORT=1 and use the desktop project to produce the M3 report",
  );
  test.setTimeout(240_000);

  /** Runs one screen on a fresh page with its own fake clock. */
  async function screen(
    run: (page: Page) => Promise<void>,
    opts: { reducedMotion?: "reduce" | "no-preference"; viewport?: { width: number; height: number } } = {},
  ): Promise<void> {
    const page = await context.newPage();
    try {
      if (opts.viewport) await page.setViewportSize(opts.viewport);
      await page.emulateMedia({ reducedMotion: opts.reducedMotion ?? "reduce" });
      await page.clock.install({ time: START });
      await run(page);
    } finally {
      await page.close();
    }
  }

  // landing
  await screen(async (page) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Dig up" })).toBeVisible();
    await page.waitForTimeout(300);
    await shootAndMeasure(page, "landing", "Landing page with the hero scene");
  });

  // scanning, stage 3 (three stones lit), motion allowed, clock paused at 7 s
  await screen(
    async (page) => {
      await mockScan(page, hang());
      await page.goto("/");
      await expect(page.getByRole("button", { name: "Dig up" })).toBeVisible();
      await page.clock.pauseAt(PAUSE_AT);
      await page.getByLabel("GitHub repository URL").fill(SCAN_REPO);
      await page.getByRole("button", { name: "Dig up" }).click();
      await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
      await page.clock.runFor(7000);
      await expect(page.getByRole("status")).toHaveText("Consulting the vulnerability records");
      await shootAndMeasure(
        page,
        "scanning",
        "Scanning screen at stage 3 (three stones lit), motion allowed, clock paused at 7 s",
      );
    },
    { reducedMotion: "no-preference" },
  );

  // results scenes
  await screen(async (page) => {
    await openResults(page, "request");
    await expectArtAboveFold(page);
    await shootAndMeasure(page, "results-scene-request", "Results scene of request/request (1440x900)");
  });
  await screen(async (page) => {
    await openResults(page, "zoxide");
    await expectArtAboveFold(page);
    await shootAndMeasure(page, "results-scene-zoxide", "Results scene of ajeetdsouza/zoxide (1440x900)");
  });

  // detail panels
  for (const pkg of ["uuid", "aws-sign2"]) {
    await screen(async (page) => {
      await openResults(page, "request");
      await page.locator("button.gk-plot", { hasText: new RegExp(`^${pkg}$`) }).first().click();
      await expect(page.getByRole("dialog", { name: new RegExp(pkg) })).toBeVisible();
      await page.waitForTimeout(300);
      await shootAndMeasure(
        page,
        `detail-${pkg}`,
        `Detail panel of ${pkg} (epitaph first) over the request scene`,
      );
    });
  }

  // mobile results scene
  await screen(
    async (page) => {
      await openResults(page, "request");
      await expectArtAboveFold(page);
      await shootAndMeasure(
        page,
        "results-scene-request-mobile",
        "Results scene of request/request at 390x844",
      );
    },
    { viewport: MOBILE },
  );

  mkdirSync(SHOT_DIR, { recursive: true });
  writeFileSync(
    path.join(SHOT_DIR, "README.md"),
    [
      "# Milestone 3 screenshots",
      "",
      "Produced by `tests/e2e/m3-report.spec.ts` (`M3_REPORT=1`, `desktop` project): 1440x900 viewport",
      "(390x844 for the mobile shot), `reducedMotion: 'reduce'` except `scanning.png`",
      "(`no-preference`, clock paused at 7 s), fake clock fixed at 2026-11-19T12:00:00Z,",
      "`/api/scan` mocked.",
      "",
      "| File | Screen |",
      "| --- | --- |",
      ...shots.map((s) => `| \`${s.file}\` | ${s.description}. |`),
      "",
    ].join("\n"),
  );

  for (const [name, entry] of Object.entries(a11y)) {
    expect.soft(entry.ruleIds, `axe violations on ${name}`).toEqual([]);
  }
});
