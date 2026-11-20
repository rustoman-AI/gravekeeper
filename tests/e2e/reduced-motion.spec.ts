import type { Page } from "@playwright/test";
import { mockScan, respondWithFixture, withDelay } from "./support/mock-scan";
import { expect, test } from "./support/test";

// Requirements 4.10, 8.7, 16.6, 20.6; graveyard-art 9.8, 10.5, 14.8.

const REPO_URL = "https://github.com/request/request";

/** Number of running CSS animations whose target is inside the scene. */
function runningSceneAnimations(page: Page): Promise<number> {
  return page.evaluate(() => {
    const scene = document.querySelector(".gk-scene");
    if (scene === null) return -1;
    return document.getAnimations().filter((a) => {
      const target = (a.effect as KeyframeEffect | null)?.target ?? null;
      return a.playState === "running" && target !== null && scene.contains(target);
    }).length;
  });
}

/** Elements (anywhere in the document) whose computed animation is not `none`. */
function animatedElements(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("*"))
      .filter((el) => getComputedStyle(el).animationName !== "none")
      .map((el) => `${el.tagName.toLowerCase()}.${el.getAttribute("class") ?? ""}`),
  );
}

test.describe("reduced motion", () => {
  test.describe("with prefers-reduced-motion: reduce", () => {
    test.use({ reducedMotion: "reduce" });

    test("landing, scanning, results and detail run without animation", async ({ page }) => {
      await mockScan(page, withDelay(1500, respondWithFixture("request")));

      // Landing.
      await page.goto("/");
      await expect(page.getByRole("button", { name: "Dig up" })).toBeVisible();
      // Hero (graveyard-art R9.8): present, and nothing in it animates.
      await expect(page.locator(".gk-hero")).toBeVisible();
      expect(await animatedElements(page)).toEqual([]);

      // Scanning.
      await page.getByLabel("GitHub repository URL").fill(REPO_URL);
      await page.getByRole("button", { name: "Dig up" }).click();
      await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
      // graveyard-art R10.5: all stones lit, lantern at the last stone, nothing animates.
      const caretakerScene = page.locator('.gk-caretaker-scene[data-still="true"]');
      await expect(caretakerScene).toBeVisible();
      await expect(caretakerScene.locator('g.gk-stone[data-lit="true"]')).toHaveCount(4);
      await expect(caretakerScene.locator("g.gk-stone")).toHaveCount(4);
      for (const selector of [".gk-caretaker", ".gk-stone-glow"]) {
        const durations = await caretakerScene.locator(selector).evaluateAll((els) =>
          els.map((el) => getComputedStyle(el).transitionDuration),
        );
        expect(durations.length, selector).toBeGreaterThan(0);
        for (const d of durations) expect(d, selector).toMatch(/^0s(, 0s)*$/);
      }
      // Fog inside the scene is static (R9.8 / R10.5 apply the same rule to every fog layer).
      expect(
        await page.locator(".gk-fog, .gk-fog-low, .gk-fog-high, .gk-fog-b").evaluateAll((els) =>
          els.filter((el) => getComputedStyle(el).animationName !== "none").length,
        ),
      ).toBe(0);
      expect(await animatedElements(page)).toEqual([]);

      // Results.
      const scene = page.locator(".gk-scene");
      await expect(scene).toBeVisible();
      await expect(scene.locator("button.gk-plot").first()).toBeVisible();
      expect(await runningSceneAnimations(page)).toBe(0);
      expect(await animatedElements(page)).toEqual([]);

      // Detail.
      await scene.locator("button.gk-plot").first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      expect(await runningSceneAnimations(page)).toBe(0);
      expect(await animatedElements(page)).toEqual([]);
    });
  });

  test.describe("without a motion preference", () => {
    test.use({ reducedMotion: "no-preference" });

    test("the synthetic-restless scene has running animations", async ({ page }) => {
      await mockScan(page, respondWithFixture("synthetic-restless"));
      await page.goto("/");
      await page.getByLabel("GitHub repository URL").fill(REPO_URL);
      await page.getByRole("button", { name: "Dig up" }).click();
      const scene = page.locator(".gk-scene");
      await expect(scene).toBeVisible();
      await expect.poll(() => runningSceneAnimations(page)).toBeGreaterThan(0);
    });
  });
});
