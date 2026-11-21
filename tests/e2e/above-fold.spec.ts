import type { Page } from "@playwright/test";
import { loadScan } from "./support/fixtures";
import { mockScan, respondWithFixture } from "./support/mock-scan";
import { expect, test } from "./support/test";

// graveyard-art Requirements 5.10, 5.11, 5.12, 5.14: the first plot's art starts above the fold.

function resultPath(): string {
  const { repo } = loadScan("request") as unknown as { repo: { owner: string; repo: string } };
  return `/?repo=${encodeURIComponent(`https://github.com/${repo.owner}/${repo.repo}`)}`;
}

function plotCount(): number {
  const body = loadScan("request") as unknown as {
    assessed?: { dependency: { ecosystem: string; name: string } }[];
  };
  return new Set((body.assessed ?? []).map((a) => `${a.dependency.ecosystem}:${a.dependency.name}`)).size;
}

async function openResults(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockScan(page, respondWithFixture("request"));
  await page.goto(resultPath());
  await expect(page.locator(".gk-scene")).toBeVisible();
  await expect(page.locator("button.gk-plot")).toHaveCount(plotCount(), { timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

async function measureArt(page: Page) {
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY, "the page must not be scrolled before measuring").toBe(0);
  // Ghost drift animates the art box; measure the resting layout.
  await page.addStyleTag({ content: ".gk-plot-art{animation:none !important}" });
  const art = page.locator("button.gk-plot .gk-plot-art").first();
  await expect(art).toBeAttached();
  return art.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: r.height, viewport: window.innerHeight };
  });
}

const DESKTOP_SIZES = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
];

test.describe("above the fold", () => {
  for (const size of DESKTOP_SIZES) {
    test.describe(`desktop ${size.width}x${size.height}`, () => {
      test.use({ viewport: size });

      test("the whole first art box is inside the viewport", async ({ page }) => {
        test.skip(test.info().project.name !== "desktop", "desktop project only");
        await openResults(page);
        const m = await measureArt(page);
        expect(m.viewport).toBe(size.height);
        expect(m.top, JSON.stringify(m)).toBeLessThan(m.viewport);
        expect(m.bottom, JSON.stringify(m)).toBeLessThanOrEqual(m.viewport);
      });

      test("the plaque sits in the same row as the headline", async ({ page }) => {
        test.skip(test.info().project.name !== "desktop", "desktop project only");
        await openResults(page);
        const headline = await page.locator(".gk-results-header .gk-headline").first().boundingBox();
        const plaque = await page.locator(".gk-results-header .gk-plaque").first().boundingBox();
        expect(headline).not.toBeNull();
        expect(plaque).not.toBeNull();
        const overlap =
          Math.min(headline!.y + headline!.height, plaque!.y + plaque!.height) -
          Math.max(headline!.y, plaque!.y);
        expect(overlap, `headline ${JSON.stringify(headline)} plaque ${JSON.stringify(plaque)}`).toBeGreaterThan(0);
        expect(plaque!.x).toBeGreaterThan(headline!.x);
      });
    });
  }

  test("mobile 390x844: the first art box starts in view and at least half is visible", async ({ page }) => {
    test.skip(test.info().project.name !== "mobile", "mobile project only");
    await openResults(page);
    const m = await measureArt(page);
    expect(m.viewport).toBe(844);
    expect(m.top, JSON.stringify(m)).toBeLessThan(m.viewport);
    const visible = Math.min(m.bottom, m.viewport) - m.top;
    expect(visible, JSON.stringify(m)).toBeGreaterThanOrEqual(m.height / 2);
  });
});
