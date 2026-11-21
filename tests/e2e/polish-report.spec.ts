import AxeBuilder from "@axe-core/playwright";
import type { Browser, Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildPackageRows, parseScanResponse } from "../../view-model";
import { AXE_TAGS } from "./support/a11y";
import { resultPath } from "./support/bodies";
import { loadScan } from "./support/fixtures";
import { mockScan, respondWithFixture } from "./support/mock-scan";
import { expect, test } from "./support/test";

/**
 * Art-polish report screenshots, axe per screen and layout measurements.
 *
 * Runs only when `POLISH_REPORT=1` is set and only in the `desktop` project, so a normal
 * `npx playwright test` does not rewrite the committed files in `docs/screenshots/polish/`.
 *
 *   $env:POLISH_REPORT='1'; npx playwright test tests/e2e/polish-report.spec.ts --project=desktop
 *
 * `POLISH_OUT_DIR` (a path relative to the project root) replaces `docs/screenshots/polish`
 * for preview runs, for example `test-results/polish-preview`.
 *
 * Outputs: four PNGs (landing and request results, each at 1440x760 and 390x700) and
 * `test-results/polish-measurements.json` (viewport, axe violation count and, for the results
 * screens, the first-row label bottom, the second-row art top, the Headline line count and
 * font size). `/api/scan` is always mocked. Nothing is written when the gate is not set.
 * Art-polish Requirements 10.1, 10.2, 10.3.
 */

const SHOT_DIR = path.join(process.cwd(), process.env.POLISH_OUT_DIR ?? path.join("docs", "screenshots", "polish"));
const MEASUREMENTS = path.join(process.cwd(), "test-results", "polish-measurements.json");
const CELL_H = 156;

const SIZES = [
  { label: "1440x760", width: 1440, height: 760, mobile: false },
  { label: "390x700", width: 390, height: 700, mobile: true },
] as const;

type Measurement = {
  viewport: { width: number; height: number };
  axeViolationCount: number;
  axeRuleIds: string[];
  firstRowLabelBottom?: number | null;
  secondRowArtTop?: number | null;
  headlineLineCount?: number | null;
  headlineFontSizePx?: number | null;
};
const measurements: Record<string, Measurement> = {};

function rowCount(): number {
  const outcome = parseScanResponse(200, { get: () => null }, loadScan("request"));
  if (outcome.kind !== "result") throw new Error("request fixture did not parse");
  return buildPackageRows(outcome.result).length;
}

/** Layout numbers of the results screen, measured at rest (art animations off). */
async function measureResults(page: Page) {
  await page.addStyleTag({ content: ".gk-plot-art{animation:none !important}" });
  return page.evaluate((cellH) => {
    const plots = Array.from(document.querySelectorAll<HTMLElement>("button.gk-plot")).map((el) => ({
      top: el.getBoundingClientRect().top,
      labelBottom: el.querySelector(".gk-plot-label")?.getBoundingClientRect().bottom ?? null,
      artTop: el.querySelector(".gk-plot-art")?.getBoundingClientRect().top ?? null,
    }));
    plots.sort((a, b) => a.top - b.top);
    const firstTop = plots[0]?.top ?? 0;
    const first = plots.filter((p) => p.top < firstTop + cellH);
    const rest = plots.filter((p) => p.top >= firstTop + cellH);
    const labels = first.map((p) => p.labelBottom).filter((v): v is number => v !== null);
    const arts = rest.map((p) => p.artTop).filter((v): v is number => v !== null);
    const headline = document.querySelector<HTMLElement>(".gk-headline");
    let lines: number | null = null;
    let fontSize: number | null = null;
    if (headline) {
      const range = document.createRange();
      range.selectNodeContents(headline);
      lines = new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top))).size;
      fontSize = Number.parseFloat(getComputedStyle(headline).fontSize);
    }
    return {
      firstRowLabelBottom: labels.length ? Math.max(...labels) : null,
      secondRowArtTop: arts.length ? Math.min(...arts) : null,
      headlineLineCount: lines,
      headlineFontSizePx: fontSize,
    };
  }, CELL_H);
}

async function runScreen(
  browser: Browser,
  baseURL: string | undefined,
  size: (typeof SIZES)[number],
  name: "landing" | "results-request",
): Promise<void> {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: size.width, height: size.height },
    isMobile: size.mobile,
    hasTouch: size.mobile,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  try {
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    const key = `${name}-${size.label}`;
    const extra: Partial<Measurement> = {};
    if (name === "landing") {
      await page.goto("/");
      await expect(page.getByRole("button", { name: "Dig up" })).toBeVisible();
    } else {
      await mockScan(page, respondWithFixture("request"));
      await page.goto(resultPath(loadScan("request")));
      await expect(page.locator(".gk-scene")).toBeVisible();
      await expect(page.locator("button.gk-plot")).toHaveCount(rowCount(), { timeout: 30_000 });
    }
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.waitForTimeout(300);
    if (name === "results-request") Object.assign(extra, await measureResults(page));
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    mkdirSync(SHOT_DIR, { recursive: true });
    await page.mouse.move(0, 0);
    await page.screenshot({ path: path.join(SHOT_DIR, `${key}.png`), animations: "disabled", caret: "hide" });
    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    measurements[key] = {
      viewport: { width: size.width, height: size.height },
      axeViolationCount: axe.violations.length,
      axeRuleIds: axe.violations.map((v) => v.id),
      ...extra,
    };
  } finally {
    await context.close();
  }
}

test("Polish report screenshots and measurements", async ({ browser, baseURL }) => {
  test.skip(
    !process.env.POLISH_REPORT || test.info().project.name !== "desktop",
    "set POLISH_REPORT=1 and use the desktop project to produce the polish report",
  );
  test.setTimeout(180_000);

  try {
    for (const name of ["landing", "results-request"] as const) {
      for (const size of SIZES) await runScreen(browser, baseURL, size, name);
    }
  } finally {
    mkdirSync(path.dirname(MEASUREMENTS), { recursive: true });
    writeFileSync(MEASUREMENTS, `${JSON.stringify(measurements, null, 2)}\n`);
  }

  for (const [key, m] of Object.entries(measurements)) {
    expect.soft(m.axeRuleIds, `axe violations on ${key}`).toEqual([]);
  }
});
