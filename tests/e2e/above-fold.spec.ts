import type { Page } from "@playwright/test";
import { loadScan } from "./support/fixtures";
import { mockScan, respondWithFixture } from "./support/mock-scan";
import { expect, test } from "./support/test";

// art-polish Requirements 2.1 to 2.5: the first row with its labels (and the top of the second row on desktop) is above the fold.
// Rows come from the plot's `--y` (px): y = SCENE_PADDING_PX (16) + row * PLOT_CELL_HEIGHT_PX (156) + 8 + jitter (-8..8), so row = floor((y - 16) / 156).
// Expected to fail at 1280x720 and 390x700 until task 7.4 (headline and header).

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


interface RowMeasure {
  viewport: number;
  firstRowLabelBottom: number;
  secondRowArtTop: number | null;
  secondRowArtVisible: number | null;
}

async function measureRows(page: Page): Promise<RowMeasure> {
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY, "the page must not be scrolled before measuring").toBe(0);
  // Ghost drift animates the art box; measure the resting layout.
  await page.addStyleTag({ content: ".gk-plot-art{animation:none !important}" });
  return page.evaluate(() => {
    const plots = Array.from(document.querySelectorAll<HTMLElement>("button.gk-plot")).map((el) => {
      const y = parseFloat(el.style.getPropertyValue("--y"));
      return {
        row: Math.floor((y - 16) / 156),
        art: el.querySelector(".gk-plot-art")!.getBoundingClientRect(),
        label: el.querySelector(".gk-plot-label")!.getBoundingClientRect(),
      };
    });
    const first = plots.filter((p) => p.row === 0);
    const second = plots.filter((p) => p.row === 1);
    const viewport = window.innerHeight;
    const secondTop = second.length > 0 ? Math.min(...second.map((p) => p.art.top)) : null;
    return {
      viewport,
      firstRowLabelBottom: Math.max(...first.map((p) => p.label.bottom)),
      secondRowArtTop: secondTop,
      secondRowArtVisible: secondTop === null ? null : viewport - secondTop,
    };
  });
}

const DESKTOP_SIZES = [
  { width: 1440, height: 760 },
  { width: 1280, height: 720 },
];

test.describe("above the fold", () => {
  for (const size of DESKTOP_SIZES) {
    test.describe(`desktop ${size.width}x${size.height}`, () => {
      test.use({ viewport: size });

      test("the first row with labels is in view and 40 px of the second row show", async ({ page }) => {
        test.skip(test.info().project.name !== "desktop", "desktop project only");
        await openResults(page);
        const m = await measureRows(page);
        expect(m.viewport).toBe(size.height);
        expect(m.firstRowLabelBottom, JSON.stringify(m)).toBeLessThanOrEqual(m.viewport);
        expect(m.secondRowArtVisible, JSON.stringify(m)).not.toBeNull();
        expect(m.secondRowArtVisible!, JSON.stringify(m)).toBeGreaterThanOrEqual(40);
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

  test.describe("mobile 390x700", () => {
    test.use({ viewport: { width: 390, height: 700 } });

    test("the first row with labels is in view", async ({ page }) => {
      test.skip(test.info().project.name !== "mobile", "mobile project only");
      await openResults(page);
      const m = await measureRows(page);
      expect(m.viewport).toBe(700);
      expect(m.firstRowLabelBottom, JSON.stringify(m)).toBeLessThanOrEqual(m.viewport);
    });
  });
});
