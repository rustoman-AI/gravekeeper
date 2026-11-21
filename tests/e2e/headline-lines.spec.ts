import type { Page } from "@playwright/test";
import { loadScan } from "./support/fixtures";
import { mockScan, respondWithFixture } from "./support/mock-scan";
import { expect, test } from "./support/test";

// art-polish Requirements 5.3, 5.4: from 1280 px the verdict headline takes at most two lines beside the plaque.
// Lines are counted as distinct rounded `top` values of Range.getClientRects() over the headline text.

const SENTENCE = "31 of 40 dependencies are in the graveyard: 6 buried, 20 forgotten, 5 haunted.";

function resultPath(): string {
  const { repo } = loadScan("request") as unknown as { repo: { owner: string; repo: string } };
  return `/?repo=${encodeURIComponent(`https://github.com/${repo.owner}/${repo.repo}`)}`;
}

async function openResults(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockScan(page, respondWithFixture("request"));
  await page.goto(resultPath());
  await expect(page.locator(".gk-scene")).toBeVisible();
  await expect(page.locator(".gk-results-header .gk-headline").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

const SIZES = [
  { width: 1280, height: 720, min: 28, max: 40 },
  { width: 1440, height: 760, min: 28, max: 40 },
  { width: 1920, height: 1080, min: 40, max: 40 },
];

test.describe("headline lines", () => {
  for (const size of SIZES) {
    test.describe(`${size.width}x${size.height}`, () => {
      test.use({ viewport: { width: size.width, height: size.height } });

      test("the headline takes at most two lines beside the plaque", async ({ page }) => {
        test.skip(test.info().project.name !== "desktop", "desktop project only");
        await openResults(page);
        const m = await page.evaluate(() => {
          const el = document.querySelector<HTMLElement>(".gk-results-header .gk-headline")!;
          const range = document.createRange();
          range.selectNodeContents(el);
          const tops = new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top)));
          const plaque = document.querySelector(".gk-results-header .gk-plaque")!.getBoundingClientRect();
          const box = el.getBoundingClientRect();
          return {
            text: (el.textContent ?? "").trim(),
            lines: tops.size,
            fontSize: parseFloat(getComputedStyle(el).fontSize),
            overlap: Math.min(box.bottom, plaque.bottom) - Math.max(box.top, plaque.top),
            plaqueRight: plaque.left >= box.right - 1,
          };
        });
        expect(m.text).toBe(SENTENCE);
        expect(m.lines, JSON.stringify(m)).toBeLessThanOrEqual(2);
        expect(m.overlap, JSON.stringify(m)).toBeGreaterThan(0);
        expect(m.plaqueRight, JSON.stringify(m)).toBe(true);
        expect(m.fontSize, JSON.stringify(m)).toBeGreaterThanOrEqual(size.min);
        expect(m.fontSize, JSON.stringify(m)).toBeLessThanOrEqual(size.max);
      });
    });
  }
});
