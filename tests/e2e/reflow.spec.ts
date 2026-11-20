import type { Page } from "@playwright/test";
import { columnsFor, SCENE_MIN_COLUMNS } from "../../view-model";
import { mockScan, respondWithError, respondWithFixture, withDelay } from "./support/mock-scan";
import { expect, test } from "./support/test";

// Requirements 16.4, 16.9, 9.6; graveyard-art 9.9, 14.7 (hero and full-width stage).
//
// Zoom emulation: browser zoom to 200 percent on a 1280 CSS px window leaves a layout
// viewport of 640 CSS px, so "200 percent zoom" is a 640 x 400 viewport here. The 320 CSS px
// case (WCAG 1.4.10, 400 percent of 1280) is a 320 x 640 viewport. Viewports are set per test.
// "No two-dimensional scrolling" means the page has no horizontal overflow
// (documentElement.scrollWidth <= clientWidth); vertical scrolling is allowed.

const REPO = "https://github.com/request/request";

const VIEWPORTS = [
  { label: "320 CSS px", width: 320, height: 640 },
  { label: "200 percent zoom (640 CSS px)", width: 640, height: 400 },
] as const;

async function overflowReport(page: Page): Promise<string> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const limit = root.clientWidth;
    const wide: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.right > limit + 0.5) {
        wide.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} right=${Math.round(rect.right)}`);
      }
    }
    return `scrollWidth=${root.scrollWidth} clientWidth=${limit}; ${wide.slice(0, 6).join(" | ")}`;
  });
}

async function expectNoPageScrollX(page: Page, screen: string): Promise<void> {
  const ok = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(ok, `${screen}: ${await overflowReport(page)}`).toBe(true);
}

/** Distinct plot columns, clustering plot left edges (jitter is at most 16 px across a cell). */
async function renderedColumns(page: Page): Promise<{ columns: number; containerWidth: number }> {
  return page.evaluate(() => {
    const scene = document.querySelector(".gk-scene") as HTMLElement;
    const lefts = Array.from(document.querySelectorAll("button.gk-plot"))
      .map((el) => el.getBoundingClientRect().left)
      .sort((a, b) => a - b);
    let columns = 0;
    let last = Number.NEGATIVE_INFINITY;
    for (const x of lefts) {
      if (x - last > 20) columns += 1;
      last = x;
    }
    return { columns, containerWidth: scene.clientWidth };
  });
}

async function gotoResults(page: Page): Promise<void> {
  await mockScan(page, respondWithFixture("request"));
  await page.goto(`/?repo=${encodeURIComponent(REPO)}`);
  await expect(page.locator("button.gk-plot").first()).toBeVisible();
}

/** Presses Tab until `matches` is true for the focused element; fails after `max` presses. */
async function tabUntil(
  page: Page,
  what: string,
  matches: () => boolean,
  max = 120,
): Promise<void> {
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(matches)) return;
  }
  throw new Error(`keyboard focus never reached ${what} in ${max} Tab presses`);
}

for (const vp of VIEWPORTS) {
  test.describe(`reflow at ${vp.label}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("landing has no horizontal page scrolling", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByLabel("GitHub repository URL")).toBeVisible();
      await expect(page.locator(".gk-hero")).toBeVisible();
      await expectNoPageScrollX(page, `landing @${vp.width}`);
      const hero = await page.locator(".gk-hero").boundingBox();
      expect((hero?.x ?? 0) + (hero?.width ?? 0), "hero right edge").toBeLessThanOrEqual(vp.width + 0.5);
    });

    test("scanning stage has no horizontal page scrolling", async ({ page }) => {
      await mockScan(page, withDelay(3000, respondWithFixture("request")));
      await page.goto(`/?repo=${encodeURIComponent(REPO)}`);
      await expect(page.locator(".gk-caretaker-scene")).toBeVisible();
      await expectNoPageScrollX(page, `scanning @${vp.width}`);
      const stage = await page.locator(".gk-caretaker-scene").boundingBox();
      expect((stage?.x ?? 0) + (stage?.width ?? 0), "stage right edge").toBeLessThanOrEqual(vp.width + 0.5);
    });

    test("results Scene has no horizontal page scrolling and reflows its columns", async ({ page }) => {
      await gotoResults(page);
      await expectNoPageScrollX(page, `scene @${vp.width}`);
      const { columns, containerWidth } = await renderedColumns(page);
      if (vp.width === 320) {
        expect(columns, `container ${containerWidth}px`).toBe(SCENE_MIN_COLUMNS);
      } else {
        expect(columns, `container ${containerWidth}px`).toBe(columnsFor(containerWidth));
      }
    });

    test("List has no horizontal page scrolling", async ({ page }) => {
      await gotoResults(page);
      await page.getByRole("button", { name: "List", exact: true }).click();
      await expect(page.getByRole("table")).toBeVisible();
      await expectNoPageScrollX(page, `list @${vp.width}`);
    });

    test("detail panel has no horizontal page scrolling", async ({ page }) => {
      await gotoResults(page);
      await page.locator("button.gk-plot").first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectNoPageScrollX(page, `detail @${vp.width}`);
      const box = await page.getByRole("dialog").boundingBox();
      expect(box?.x ?? 0, "dialog left edge on screen").toBeGreaterThanOrEqual(-0.5);
      expect((box?.x ?? 0) + (box?.width ?? 0), "dialog right edge on screen").toBeLessThanOrEqual(
        vp.width + 0.5,
      );
    });

    test("error screen has no horizontal page scrolling", async ({ page }) => {
      await mockScan(page, respondWithError(404, { code: "repo-not-found" }));
      await page.goto(`/?repo=${encodeURIComponent(REPO)}`);
      await expect(page.getByRole("heading", { name: "No such graveyard" })).toBeVisible();
      await expectNoPageScrollX(page, `error @${vp.width}`);
    });
  });
}

test.describe("keyboard-only run", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test("Tab reaches the form, a featured link, the toggle, a plot, a sort button and Close", async ({
    page,
  }) => {
    await mockScan(page, respondWithFixture("request"));
    await page.goto("/");
    await expect(page.getByLabel("GitHub repository URL")).toBeVisible();

    await tabUntil(page, "the landing form input", () => document.activeElement?.tagName === "INPUT");
    await tabUntil(page, "a featured graveyard link", () => {
      const el = document.activeElement as HTMLAnchorElement | null;
      return el?.tagName === "A" && el.href.includes("repo=");
    });

    // Submit through the keyboard: Enter on the featured link starts a scan.
    await page.keyboard.press("Enter");
    await expect(page.locator("button.gk-plot").first()).toBeVisible();

    await tabUntil(page, "the view toggle", () => {
      const el = document.activeElement as HTMLElement | null;
      return el?.tagName === "BUTTON" && el.hasAttribute("aria-pressed");
    });
    await tabUntil(page, "a scene plot", () =>
      (document.activeElement as HTMLElement | null)?.classList.contains("gk-plot") === true,
    );

    // Back to the toggle, switch to List with Enter, then reach a sort button.
    await page.keyboard.press("Shift+Tab");
    await page.getByRole("button", { name: "List", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("table")).toBeVisible();
    await tabUntil(page, "a list sort button", () => {
      const el = document.activeElement as HTMLElement | null;
      return el?.tagName === "BUTTON" && el.closest("th") !== null;
    });

    // Open the first package from the list, then reach Close.
    await tabUntil(page, "a package button in the list", () => {
      const el = document.activeElement as HTMLElement | null;
      return el?.tagName === "BUTTON" && el.closest("td") !== null;
    });
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await tabUntil(page, 'the detail panel "Close" button', () => {
      const el = document.activeElement as HTMLElement | null;
      return el?.tagName === "BUTTON" && /^close$/i.test((el.textContent ?? "").trim() || el.getAttribute("aria-label") || "");
    });
  });
});
