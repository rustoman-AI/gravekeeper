import type { Page } from "@playwright/test";
import { loadScan, type FixtureName } from "./support/fixtures";
import { mockScan, respondWithFixture, withDelay } from "./support/mock-scan";
import { expect, test } from "./support/test";

// Requirements 17.3, 17.6, 20.7: cumulative layout shift of the rendered results.\n// graveyard-art 9.9, 14.7: landing (hero), scanning (caretaker scene) and results stay within the same limit.

// Test-owned constant (requirements table: tests).
const RESULTS_CLS_MAX = 0.01;

type ShiftRecord = { value: number; startTime: number; sources: string[] };

declare global {
  interface Window {
    __gkShifts?: ShiftRecord[];
    __gkStart?: number;
  }
}

const FIXTURES: readonly FixtureName[] = [
  "request",
  "canopy",
  "zoxide",
  "synthetic-300",
];

function repoUrlOf(name: FixtureName): string {
  const body = loadScan(name) as { repo?: { owner?: string; repo?: string } };
  const { owner, repo } = body.repo ?? {};
  if (!owner || !repo) throw new Error(`fixture ${name} has no repo`);
  return `https://github.com/${owner}/${repo}`;
}

function rowCountOf(name: FixtureName): number {
  // One plot per package: the same package in several scopes shares a plot.
  const body = loadScan(name) as {
    assessed?: { dependency: { ecosystem: string; name: string } }[];
  };
  return new Set(
    (body.assessed ?? []).map(
      (a) => `${a.dependency.ecosystem}:${a.dependency.name}`,
    ),
  ).size;
}

async function observeShifts(page: Page): Promise<void> {
      await page.addInitScript(() => {
        window.__gkShifts = [];
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const shift = entry as PerformanceEntry & {
              value: number;
              hadRecentInput: boolean;
              sources?: { node: Node | null }[];
            };
            if (shift.hadRecentInput) continue;
            // Entries before startMeasuring() (fonts.ready) are discarded.
            if (window.__gkStart === undefined || shift.startTime < window.__gkStart) continue;
            window.__gkShifts?.push({
              value: shift.value,
              startTime: shift.startTime,
              sources: (shift.sources ?? []).map((s) => {
                const n = s.node;
                if (!n) return "(removed node)";
                if (n.nodeType !== 1) return n.nodeName;
                const el = n as Element;
                return `${el.tagName.toLowerCase()}.${String(el.getAttribute("class") ?? "").trim().replace(/\s+/g, ".")}`;
              }),
            });
          }
        }).observe({ type: "layout-shift", buffered: true });
      });
}

// R21 (graveyard-art): CLS is measured only after `document.fonts.ready`, so the result does not depend on
// when the display font arrives. Known gap, accepted to keep `font-display: swap` and IM Fell English SC:
// on a real device a late font swap on the headline can still shift the content below it by about 0.025.
async function startMeasuring(page: Page): Promise<void> {
  await page.evaluate(() =>
    document.fonts.ready.then(() => {
      window.__gkStart = performance.now();
    }),
  );
}

async function settle(page: Page): Promise<number> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.waitForTimeout(500);
  const shifts = await page.evaluate(() => window.__gkShifts ?? []);
  return shifts.reduce((sum, s) => sum + s.value, 0);
}

test.describe("results layout shift", () => {
  test.setTimeout(90_000);

  for (const fixture of FIXTURES) {
    test(`${fixture} results shift at most RESULTS_CLS_MAX`, async ({
      page,
    }, testInfo) => {
      await observeShifts(page);
      await mockScan(page, respondWithFixture(fixture));
      await page.goto(`/?repo=${encodeURIComponent(repoUrlOf(fixture))}`);
      await startMeasuring(page);

      // Windowed bands fill in after a timer; wait until every plot is mounted.
      const rows = rowCountOf(fixture);
      expect(rows).toBeGreaterThan(0);
      await expect(page.locator("button.gk-plot")).toHaveCount(rows, {
        timeout: 60_000,
      });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() => resolve()),
            ),
          ),
      );
      await page.waitForTimeout(500);

      const shifts = await page.evaluate(() => window.__gkShifts ?? []);
      const total = shifts.reduce((sum, s) => sum + s.value, 0);
      console.log(
        `layout-shift ${fixture} [${testInfo.project.name}] cls=${total} entries=${shifts.length}`,
      );
      expect(
        total,
        `CLS ${total} for ${fixture}; shifts: ${JSON.stringify(shifts)}`,
      ).toBeLessThanOrEqual(RESULTS_CLS_MAX);
    });
  }
});

test.describe("landing and scanning layout shift", () => {
  test("landing (hero) shifts at most RESULTS_CLS_MAX", async ({ page }) => {
    await observeShifts(page);
    await page.goto("/");
    await startMeasuring(page);
    await expect(page.locator(".gk-hero")).toBeVisible();
    await expect(page.getByRole("button", { name: "Dig up" })).toBeVisible();
    const total = await settle(page);
    expect(total, `landing CLS ${total}`).toBeLessThanOrEqual(RESULTS_CLS_MAX);
  });

  test("scanning (caretaker scene) and results shift at most RESULTS_CLS_MAX", async ({ page }) => {
    await observeShifts(page);
    await mockScan(page, withDelay(1500, respondWithFixture("request")));
    await page.goto("/");
    await startMeasuring(page);
    await page.getByLabel("GitHub repository URL").fill("https://github.com/request/request");
    await page.getByRole("button", { name: "Dig up" }).click();
    await expect(page.locator(".gk-caretaker-scene")).toBeVisible();
    const scanning = await settle(page);
    expect(scanning, `scanning CLS ${scanning}`).toBeLessThanOrEqual(RESULTS_CLS_MAX);
    await expect(page.locator("button.gk-plot").first()).toBeVisible({ timeout: 30_000 });
    const total = await settle(page);
    expect(total, `landing+scanning+results CLS ${total}`).toBeLessThanOrEqual(RESULTS_CLS_MAX);
  });
});