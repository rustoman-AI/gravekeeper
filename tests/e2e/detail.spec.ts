import type { Locator, Page } from "@playwright/test";
import { expectNoA11yViolations } from "./support/a11y";
import type { FixtureName } from "./support/fixtures";
import { mockScan, respondWithFixture } from "./support/mock-scan";
import { expect, test } from "./support/test";

// Requirements 10.1, 10.16, 16.4, 16.10, 20.2, 20.5.

async function openScan(page: Page, fixture: FixtureName, repo: string): Promise<void> {
  await mockScan(page, respondWithFixture(fixture));
  await page.goto("/");
  await page.getByLabel("GitHub repository URL").fill(`https://github.com/${repo}`);
  await page.getByRole("button", { name: "Dig up" }).click();
  await expect(page.locator("button.gk-plot").first()).toBeVisible();
}

function dialogOf(page: Page): Locator {
  return page.getByRole("dialog");
}

const SYNTHETIC: ReadonlyArray<{ kind: string; name: string; screen: string }> = [
  { kind: "tombstone", name: "buried-one", screen: "detail-tombstone" },
  { kind: "overgrown", name: "forgotten-one", screen: "detail-overgrown" },
  { kind: "ghost", name: "ghost-one", screen: "detail-ghost" },
  { kind: "restless", name: "restless-one", screen: "detail-restless" },
  { kind: "lantern", name: "lantern-one", screen: "detail-lantern" },
];

test.describe("detail panel (synthetic-restless)", () => {
  test.beforeEach(async ({ page }) => {
    await openScan(page, "synthetic-restless", "example/synthetic-restless");
  });

  for (const { kind, name, screen } of SYNTHETIC) {
    test(`${kind}: opens and closes by mouse`, async ({ page }) => {
      const plot = page.locator(`button.gk-plot[data-kind="${kind}"]`).first();
      await plot.click();
      const dialog = dialogOf(page);
      await expect(dialog).toBeVisible();
      await expect(page.getByRole("dialog", { name: new RegExp(name) })).toBeVisible();
      await dialog.getByRole("button", { name: "Close" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(plot).toBeFocused();
    });

    test(`${kind}: opens with Enter, closes with Escape and returns focus`, async ({ page }) => {
      const plot = page.locator(`button.gk-plot[data-kind="${kind}"]`).first();
      await plot.focus();
      await page.keyboard.press("Enter");
      const dialog = dialogOf(page);
      await expect(page.getByRole("dialog", { name: new RegExp(name) })).toBeVisible();
      await expect
        .poll(() => dialog.evaluate((el) => el.contains(document.activeElement)))
        .toBe(true);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(plot).toBeFocused();
    });

    test(`${kind}: has no axe violations with the panel open`, async ({ page }) => {
      await page.locator(`button.gk-plot[data-kind="${kind}"]`).first().click();
      await expect(page.getByRole("dialog", { name: new RegExp(name) })).toBeVisible();
      await expectNoA11yViolations(page, screen, test.info().project.name);
    });
  }

  test("the ghost's advisories show the three labelled groups", async ({ page }) => {
    await page.locator('button.gk-plot[data-kind="ghost"]').first().click();
    const dialog = dialogOf(page);
    await expect(dialog).toBeVisible();
    const advisories = dialog.locator("section", {
      has: page.getByRole("heading", { name: "Advisories", exact: true }),
    });
    await expect(advisories.getByText("Counted as open", { exact: true })).toBeVisible();
    await expect(advisories.getByText("Informational, not counted", { exact: true })).toBeVisible();
    await expect(advisories.getByText("Withdrawn, not counted", { exact: true })).toBeVisible();
    await expect(advisories.getByText("Not classified", { exact: true })).toHaveCount(0);
  });
});

test.describe("detail panel (request fixture)", () => {
  test.beforeEach(async ({ page }) => {
    await openScan(page, "request", "request/request");
  });

  test("a forgotten grave opens and passes axe", async ({ page }) => {
    const plot = page.locator('button.gk-plot[data-kind="overgrown"]').first();
    await plot.click();
    await expect(dialogOf(page)).toBeVisible();
    await expectNoA11yViolations(page, "detail-forgotten-request", test.info().project.name);
    await page.keyboard.press("Escape");
    await expect(dialogOf(page)).toHaveCount(0);
    await expect(plot).toBeFocused();
  });

  test("the uuid package opens and passes axe", async ({ page }) => {
    const plot = page.locator("button.gk-plot", { hasText: /^uuid$/ }).first();
    await plot.click();
    await expect(page.getByRole("dialog", { name: /uuid/ })).toBeVisible();
    await expectNoA11yViolations(page, "detail-uuid", test.info().project.name);
  });
});
