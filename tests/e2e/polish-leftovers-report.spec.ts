import type { Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildPackageRows, parseScanResponse } from "../../view-model";
import { resultPath } from "./support/bodies";
import { loadScan } from "./support/fixtures";
import { mockScan, respondWithFixture } from "./support/mock-scan";
import { expect, test } from "./support/test";

/**
 * Polish-leftovers screenshots: the landing hero and the uuid grave (restless ghost, full-size
 * stone and cross) at 1440x760.
 *
 * Runs only when `POLISH_LEFTOVERS_REPORT=1` is set and only in the `desktop` project, so a normal
 * `npx playwright test` skips it and does not rewrite `docs/screenshots/polish/`.
 *
 *   $env:POLISH_LEFTOVERS_REPORT='1'; npx playwright test tests/e2e/polish-leftovers-report.spec.ts --project=desktop
 *
 * `POLISH_OUT_DIR` (a path relative to the project root) replaces `docs/screenshots/polish` for
 * preview runs, for example `test-results/polish-leftovers-preview`.
 *
 * Outputs: `leftovers-landing-hero-1440x760.png` and `leftovers-uuid-grave-1440x760.png`.
 * Determinism: fixed viewport, device scale factor 1, reduced motion, fake clock, fonts ready,
 * animations disabled, caret hidden, a full repaint before each shot, and every shot is taken
 * twice and must be byte-equal before it is written. `/api/scan` is always mocked.
 * Polish-leftovers Requirements 4.7, 4.8, 5.8.
 */

const SHOT_DIR = path.join(process.cwd(), process.env.POLISH_OUT_DIR ?? path.join("docs", "screenshots", "polish"));
const START = new Date("2026-11-19T12:00:00Z");
const PAD = 32;
const VIEWPORT = { width: 1440, height: 760 };

test.use({ viewport: VIEWPORT, deviceScaleFactor: 1, isMobile: false, hasTouch: false, reducedMotion: "reduce" });

function rowCount(): number {
  const outcome = parseScanResponse(200, { get: () => null }, loadScan("request"));
  if (outcome.kind !== "result") throw new Error("request fixture did not parse");
  return buildPackageRows(outcome.result).length;
}

/** Hides the page for two frames and shows it again, so the next frame is a full repaint. */
async function fullRepaint(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const frames = () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      });
    await document.fonts.ready;
    const root = document.documentElement;
    const before = root.style.visibility;
    root.style.visibility = "hidden";
    await frames();
    root.style.visibility = before;
    await frames();
  });
  await page.mouse.move(0, 0);
}

type Clip = { x: number; y: number; width: number; height: number };

/** Takes the shot twice, requires equal bytes, then writes the file. */
async function shootTwice(page: Page, file: string, clip?: Clip): Promise<void> {
  const take = async () => {
    await fullRepaint(page);
    return page.screenshot({ animations: "disabled", caret: "hide", ...(clip ? { clip } : {}) });
  };
  const first = await take();
  const second = await take();
  expect(second.equals(first), `${file}: two captures differ`).toBe(true);
  mkdirSync(SHOT_DIR, { recursive: true });
  writeFileSync(path.join(SHOT_DIR, file), first);
}

/** Viewport rectangle of a plot including its label band. */
async function plotRect(page: Page, namePrefix: string): Promise<Clip | null> {
  return page.evaluate((prefix) => {
    const el = Array.from(document.querySelectorAll<HTMLElement>("button.gk-plot")).find((b) =>
      (b.getAttribute("aria-label") ?? "").startsWith(prefix),
    );
    if (!el) return null;
    const rects = [el, ...Array.from(el.querySelectorAll<HTMLElement>(".gk-plot-art, .gk-plot-label"))].map((n) =>
      n.getBoundingClientRect(),
    );
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    const right = Math.max(...rects.map((r) => r.right));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    return { x: left, y: top, width: right - left, height: bottom - top };
  }, namePrefix);
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    !process.env.POLISH_LEFTOVERS_REPORT || testInfo.project.name !== "desktop",
    "set POLISH_LEFTOVERS_REPORT=1 and use the desktop project to produce the polish-leftovers screenshots",
  );
  await page.clock.install({ time: START });
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("Landing hero screenshot", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Dig up" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(300);
  await shootTwice(page, "leftovers-landing-hero-1440x760.png");
});

test("uuid grave screenshot", async ({ page }) => {
  test.setTimeout(120_000);
  await mockScan(page, respondWithFixture("request"));
  await page.goto(resultPath(loadScan("request")));
  await expect(page.locator(".gk-scene")).toBeVisible();
  await expect(page.locator("button.gk-plot")).toHaveCount(rowCount(), { timeout: 30_000 });
  await page.addStyleTag({ content: ".gk-plot-art{animation:none !important}" });

  const uuid = page.locator('button.gk-plot[aria-label^="uuid,"]').first();
  await expect(uuid).toHaveCount(1);
  await uuid.evaluate((el) => {
    el.scrollIntoView({ block: "center", inline: "center" });
  });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(400);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );

  const uuidRect = await plotRect(page, "uuid,");
  if (!uuidRect) throw new Error("uuid plot not found");
  // Include the neighbour "karma" grave for comparison when it sits close by.
  const karmaRect = await plotRect(page, "karma,");
  let box = uuidRect;
  if (karmaRect) {
    const left = Math.min(uuidRect.x, karmaRect.x);
    const top = Math.min(uuidRect.y, karmaRect.y);
    const right = Math.max(uuidRect.x + uuidRect.width, karmaRect.x + karmaRect.width);
    const bottom = Math.max(uuidRect.y + uuidRect.height, karmaRect.y + karmaRect.height);
    if (right - left <= 480 && bottom - top <= 360) box = { x: left, y: top, width: right - left, height: bottom - top };
  }

  const x = Math.max(0, Math.floor(box.x - PAD));
  const y = Math.max(0, Math.floor(box.y - PAD));
  const right = Math.min(VIEWPORT.width, Math.ceil(box.x + box.width + PAD));
  const bottom = Math.min(VIEWPORT.height, Math.ceil(box.y + box.height + PAD));
  await shootTwice(page, "leftovers-uuid-grave-1440x760.png", { x, y, width: right - x, height: bottom - y });
});
