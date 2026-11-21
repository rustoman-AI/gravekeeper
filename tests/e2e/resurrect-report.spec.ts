import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildPackageRows, parseScanResponse } from "../../view-model";
import { AXE_TAGS } from "./support/a11y";
import { okHandler, resultPath } from "./support/bodies";
import { loadScan, type ScanOkBody } from "./support/fixtures";
import { mockScan } from "./support/mock-scan";
import { expect, test } from "./support/test";

/**
 * Resurrect report screenshots, slot texts and axe counts.
 *
 * Runs only when `RS_REPORT=1` is set and only in the `desktop` project, so a normal
 * `npx playwright test` does not rewrite the committed files in `docs/screenshots/resurrect/`.
 *
 *   $env:RS_REPORT='1'; npx playwright test tests/e2e/resurrect-report.spec.ts --project=desktop
 *
 * Outputs: three 1440x900 PNGs in `docs/screenshots/resurrect/` and
 * `test-results/resurrect-slot-text.json` (slot inner text and axe violation counts).
 * `/api/scan` is always mocked. No token is read or written.
 * Resurrect Requirements 16.1, 16.2, 16.5.
 */

const SHOT_DIR = path.join(process.cwd(), "docs", "screenshots", "resurrect");
const OUTPUT = path.join(process.cwd(), "test-results", "resurrect-slot-text.json");
const DESKTOP = { width: 1440, height: 900 };

type Axe = { violationCount: number; ruleIds: string[] };
type SlotEntry = {
  package: string;
  source: "request fixture" | "synthetic body";
  synthetic: boolean;
  innerText: string;
  screenshot: string | null;
  axe: Axe;
};
const entries: SlotEntry[] = [];

test.use({ viewport: DESKTOP, reducedMotion: "reduce" });

type DepEntry = {
  dependency: { name: string; rawName: string; versionSpec: string };
  [key: string]: unknown;
};
type Summary = { total: number; assessed: number; counts: Record<string, number> };

/** The request fixture plus one buried `request` npm row, labelled synthetic in the output file. */
function syntheticBody(): ScanOkBody {
  const body = loadScan("request");
  const deps = body["dependencies"] as DepEntry[];
  const assessed = body["assessed"] as DepEntry[];
  const dep = structuredClone(deps.find((d) => d.dependency.name === "har-validator")!);
  const ass = structuredClone(assessed.find((a) => a.dependency.name === "har-validator")!);
  for (const part of [dep.dependency, ass.dependency]) {
    part.name = "request";
    part.rawName = "request";
    part.versionSpec = "^2.88.2";
  }
  dep["lookupVersion"] = "2.88.2";
  dep["hints"] = [
    {
      kind: "deprecation-notice",
      text: "request has been deprecated, see https://github.com/request/request/issues/3142",
      sourceUrl: null,
    },
  ];
  deps.push(dep);
  assessed.push(ass);
  const summary = body["summary"] as Summary;
  summary["total"] += 1;
  summary["assessed"] += 1;
  summary["counts"]["DEAD"] += 1;
  return body;
}

function rowCount(body: ScanOkBody): number {
  const outcome = parseScanResponse(200, { get: () => null }, body);
  if (outcome.kind !== "result") throw new Error("body did not parse");
  return buildPackageRows(outcome.result).length;
}

async function openPanel(page: Page, name: string): Promise<Locator> {
  await page
    .locator("button.gk-plot", { hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: new RegExp(name) });
  await expect(dialog).toBeVisible();
  const slot = dialog.locator('[data-slot="resurrect"]');
  await expect(slot).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForTimeout(300);
  return slot;
}

/**
 * Scrolls the panel's own scroll container (not the page) so the whole slot is inside it
 * and inside the viewport. Returns the geometry for the assertion.
 */
async function scrollSlotIntoView(slot: Locator): Promise<{ fits: boolean; slotTop: number; slotBottom: number; boxTop: number; boxBottom: number; scrolled: boolean }> {
  return slot.evaluate((el) => {
    let box: HTMLElement | null = el.parentElement;
    while (box !== null) {
      const oy = getComputedStyle(box).overflowY;
      if ((oy === "auto" || oy === "scroll") && box.scrollHeight > box.clientHeight) break;
      box = box.parentElement;
    }
    const scrolled = box !== null;
    if (box !== null) {
      const b = box.getBoundingClientRect();
      const s = el.getBoundingClientRect();
      // Put the slot's bottom at the container's bottom; when it is taller, put its top at the top.
      const delta = s.height <= b.height ? s.bottom - b.bottom + 16 : s.top - b.top;
      box.scrollTop += delta;
    }
    const s2 = el.getBoundingClientRect();
    const b2 = (box ?? document.documentElement).getBoundingClientRect();
    const top = Math.max(0, b2.top);
    const bottom = Math.min(window.innerHeight, b2.bottom);
    return {
      fits: s2.top >= top - 0.5 && s2.bottom <= bottom + 0.5,
      slotTop: s2.top,
      slotBottom: s2.bottom,
      boxTop: top,
      boxBottom: bottom,
      scrolled,
    };
  });
}

async function measure(page: Page): Promise<Axe> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return { violationCount: results.violations.length, ruleIds: results.violations.map((v) => v.id) };
}

test("Resurrect report screenshots, slot text and axe counts", async ({ page }) => {
  test.skip(
    !process.env.RS_REPORT || test.info().project.name !== "desktop",
    "set RS_REPORT=1 and use the desktop project to produce the Resurrect report",
  );
  test.setTimeout(180_000);
  mkdirSync(SHOT_DIR, { recursive: true });

  const shots: Array<[string, string]> = [
    ["har-validator", "resurrect-buried-har-validator.png"],
    ["aws-sign2", "resurrect-forgotten-aws-sign2.png"],
    ["uuid", "resurrect-restless-uuid.png"],
  ];

  async function visit(body: ScanOkBody, source: SlotEntry["source"], pkgs: Array<[string, string | null]>): Promise<void> {
    await mockScan(page, okHandler(body));
    await page.goto(resultPath(body));
    await expect(page.locator(".gk-scene")).toBeVisible();
    await expect(page.locator("button.gk-plot")).toHaveCount(rowCount(body), { timeout: 30_000 });
    await page.waitForTimeout(300);
    for (const [pkg, file] of pkgs) {
      const slot = await openPanel(page, pkg);
      const geometry = await scrollSlotIntoView(slot);
      expect(geometry.scrolled, `${pkg}: a scroll container exists`).toBe(true);
      expect(geometry.fits, `${pkg}: slot fully visible ${JSON.stringify(geometry)}`).toBe(true);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      if (file !== null) {
        await page.mouse.move(0, 0);
        await page.screenshot({ path: path.join(SHOT_DIR, file), animations: "disabled", caret: "hide" });
      }
      const innerText = await slot.innerText();
      const axe = await measure(page);
      entries.push({
        package: pkg,
        source,
        synthetic: source === "synthetic body",
        innerText,
        screenshot: file === null ? null : `docs/screenshots/resurrect/${file}`,
        axe,
      });
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
  }

  try {
    await visit(loadScan("request"), "request fixture", [
      ...shots,
      ["phantomjs-prebuilt", null],
    ]);
    await visit(syntheticBody(), "synthetic body", [["request", null]]);
  } finally {
    mkdirSync(path.dirname(OUTPUT), { recursive: true });
    writeFileSync(
      OUTPUT,
      `${JSON.stringify(
        {
          note: "The entry with synthetic=true comes from a synthetic body (a buried 'request' npm row added to the request fixture, mocked); the row is synthetic, but its hint text is the real npm deprecation notice of request@2.88.2, fetched from https://registry.npmjs.org/request/latest on 2026-11-21.",
          slots: entries,
          axeViolationTotal: entries.reduce((n, e) => n + e.axe.violationCount, 0),
        },
        null,
        2,
      )}\n`,
    );
  }

  for (const e of entries) {
    expect.soft(e.axe.ruleIds, `axe violations on ${e.package}`).toEqual([]);
  }
});
