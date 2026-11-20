import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildPackageRows, parseScanResponse } from "../../view-model";
import { AXE_TAGS } from "./support/a11y";
import { loadScan } from "./support/fixtures";
import { hang, mockScan, respondWithFixture, type ScanHandler } from "./support/mock-scan";
import { expect, test } from "./support/test";

/**
 * Milestone 1 report screenshots and axe measurements (Requirements 20.10, 20.11, 16.10).
 *
 * Runs only when `M1_REPORT=1` is set and only in the `desktop` project, so a normal
 * `npx playwright test` does not rewrite the committed files in `docs/screenshots/m1/`.
 *
 *   $env:M1_REPORT='1'; npx playwright test tests/e2e/m1-report.spec.ts --project=desktop
 *
 * With `E2E_BASE_URL` set the `desktop` project also runs this spec against the deployed
 * site (`/api/scan` stays mocked in the browser, so GitHub is never called).
 *
 * Outputs: six PNGs (1440x900, reduced motion, fixed clock) and README.md in
 * `docs/screenshots/m1/`; the per-screen axe result under the key `m1A11y` of
 * `test-results/m1-measurements.json` (other keys are kept). Any axe violation fails the spec
 * after the result is recorded.
 */

const REPO = "request/request";
const REPO_URL = `https://github.com/${REPO}`;
const SHOT_DIR = path.join(process.cwd(), "docs", "screenshots", "m1");
const MEASUREMENTS = path.join(process.cwd(), "test-results", "m1-measurements.json");

type A11yEntry = { violationCount: number; ruleIds: string[]; url: string };
const a11y: Record<string, A11yEntry> = {};

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
  existing.m1A11y = a11y;
  writeFileSync(MEASUREMENTS, `${JSON.stringify(existing, null, 2)}\n`);
});

async function shoot(page: Page, file: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, file), animations: "disabled" });
}

async function measure(page: Page, screen: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  a11y[screen] = {
    violationCount: results.violations.length,
    ruleIds: results.violations.map((v) => v.id),
    url: page.url(),
  };
}

function sel(label: string): string {
  return `button.gk-plot[aria-label=${JSON.stringify(label)}]`;
}

test("M1 report screenshots and accessibility measurements", async ({ page }) => {
  test.skip(
    !process.env.M1_REPORT || test.info().project.name !== "desktop",
    "set M1_REPORT=1 and use the desktop project to produce the M1 report",
  );
  test.setTimeout(180_000);

  const outcome = parseScanResponse(200, { get: () => null }, loadScan("request"));
  if (outcome.kind !== "result") throw new Error("request fixture did not parse");
  const rows = buildPackageRows(outcome.result);
  const uuid = rows.find((r) => r.name === "uuid" && r.ecosystem === "npm");
  if (!uuid) throw new Error("uuid (npm) is not in the request/request fixture");
  const forgotten = rows.find((r) => r.graveType === "forgotten");
  if (!forgotten) throw new Error("the request/request fixture has no forgotten package");

  let handler: ScanHandler = hang();
  await mockScan(page, (route, request) => handler(route, request));
  await page.clock.install({ time: new Date("2026-11-19T12:00:00Z") });

  // 1. Landing
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Dig up" })).toBeVisible();
  await shoot(page, "landing.png");
  await measure(page, "landing");

  // 2. Scanning, stage 3 in progress
  await page.clock.pauseAt(new Date("2026-11-19T12:01:00Z"));
  await page.getByLabel("GitHub repository URL").fill(REPO_URL);
  await page.getByRole("button", { name: "Dig up" }).click();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  await page.clock.runFor(6500);
  await expect(page.getByRole("status")).toHaveText("Consulting the vulnerability records");
  await shoot(page, "scanning.png");
  await page.clock.resume(); // axe schedules timers and hangs on a paused clock
  await measure(page, "scanning");

  // 3. Results, Scene
  handler = respondWithFixture("request");
  await page.goto(`/?repo=${encodeURIComponent(REPO_URL)}`);
  await expect(page.locator("button.gk-plot")).toHaveCount(rows.length);
  await expect(page.locator("button.gk-plot").first()).toBeVisible();
  await shoot(page, "results-scene-request.png");
  await measure(page, "results-scene-request");

  // 4. Detail panels over the Scene
  const dialog = page.getByRole("dialog");
  await page.locator(sel(uuid.accessibleLabel)).click();
  await expect(dialog).toBeVisible();
  await shoot(page, "detail-uuid.png");
  await measure(page, "detail-uuid");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.locator(sel(forgotten.accessibleLabel)).click();
  await expect(dialog).toBeVisible();
  await shoot(page, "detail-forgotten.png");
  await measure(page, "detail-forgotten");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // 5. Results, List
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await shoot(page, "results-list-request.png");
  await measure(page, "results-list-request");

  const forgottenCount = rows.filter((r) => r.graveType === "forgotten").length;
  writeFileSync(
    path.join(SHOT_DIR, "README.md"),
    [
      "# Milestone 1 screenshots",
      "",
      "Produced by `tests/e2e/m1-report.spec.ts` (`M1_REPORT=1`, `desktop` project): 1440x900 viewport,",
      "`reducedMotion: 'reduce'`, fake clock fixed at 2026-11-19T12:00:00Z, `/api/scan` mocked with the",
      "recorded fixture `tests/e2e/.generated/scan-request.json` (repository `request/request`).",
      "",
      "| File | What it shows |",
      "| --- | --- |",
      "| `landing.png` | Landing page. |",
      "| `scanning.png` | Scanning screen with stage 3 (\"Consulting the vulnerability records\") in progress, 6.5 s into a scan that never answers. |",
      `| \`results-scene-request.png\` | Results Scene for \`${REPO}\`, top of the page (header and first rows). |`,
      `| \`results-list-request.png\` | Results List view for \`${REPO}\`. |`,
      `| \`detail-uuid.png\` | Detail panel of the package \`uuid\` (npm) of \`${REPO}\`. |`,
      `| \`detail-forgotten.png\` | Detail panel of \`${forgotten.displayName}\` (${forgotten.ecosystem}), Grave_Type \`forgotten\`. |`,
      "",
      "## Forgotten package",
      "",
      `The recorded \`request\` replay has ${forgottenCount} packages with Grave_Type \`forgotten\`. The view-model`,
      "(`buildPackageRows`) returns rows in scene order; the first one with `graveType === 'forgotten'` is",
      `\`${forgotten.displayName}\` (${forgotten.ecosystem}, score ${forgotten.score}), so that package is shown.`,
      "No synthetic result was needed.",
      "",
    ].join("\n"),
  );

  for (const [screen, entry] of Object.entries(a11y)) {
    expect.soft(entry.ruleIds, `axe violations on ${screen}`).toEqual([]);
  }
});
