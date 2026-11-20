import type { Page } from "@playwright/test";
import { expectNoA11yViolations } from "./support/a11y";
import { hang, mockScan } from "./support/mock-scan";
import { expect, test } from "./support/test";

// Requirements 4.1, 4.6, 4.9, 16.10, 20.2, 20.5; graveyard-art 9.1, 18.5.

const REPO_URL = "https://github.com/request/request";
const STAGES = [
  "Reading the repository",
  "Checking the registries",
  "Consulting the vulnerability records",
  "Asking GitHub about the living",
] as const;
const SLOW_NOTICE = "Large repositories can take up to 25 seconds.";

/** Installs the fake clock, loads the landing page, freezes time, and starts a scan that never answers. */
async function startHangingScan(page: Page): Promise<unknown[]> {
  const seen = await mockScan(page, hang());
  await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
  await page.goto("/");
  await page.clock.pauseAt(new Date("2030-01-01T00:01:00Z"));
  const input = page.getByLabel("GitHub repository URL");
  await input.fill(REPO_URL);
  await page.getByRole("button", { name: "Dig up" }).click();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  return seen;
}

/** Asserts which stage is "in progress"; earlier ones are "done", later ones "waiting". */
async function expectStage(page: Page, current: number): Promise<void> {
  const items = page.getByRole("list", { name: "Scan stages" }).getByRole("listitem");
  await expect(items).toHaveCount(STAGES.length);
  for (let i = 0; i < STAGES.length; i++) {
    const state = i < current ? "done" : i === current ? "in progress" : "waiting";
    await expect(items.nth(i)).toHaveText(`${STAGES[i]}${state}`);
  }
  await expect(page.getByRole("status")).toHaveText(STAGES[current]!);
}

test.describe("scanning screen", () => {
  test("the stage changes at 2000, 6000 and 10000 ms and the slow notice appears at 15000 ms", async ({
    page,
  }) => {
    await startHangingScan(page);
    await expectStage(page, 0);
    await expect(page.getByText(SLOW_NOTICE)).toHaveCount(0);

    await page.clock.runFor(1500);
    await expectStage(page, 0);
    await page.clock.runFor(500);
    await expectStage(page, 1);

    await page.clock.runFor(3500);
    await expectStage(page, 1);
    await page.clock.runFor(500);
    await expectStage(page, 2);

    await page.clock.runFor(3500);
    await expectStage(page, 2);
    await page.clock.runFor(500);
    await expectStage(page, 3);
    await expect(page.getByText(SLOW_NOTICE)).toHaveCount(0);

    await page.clock.runFor(4500);
    await expect(page.getByText(SLOW_NOTICE)).toHaveCount(0);
    await page.clock.runFor(500);
    await expect(page.getByText(SLOW_NOTICE)).toBeVisible();
    await expectStage(page, 3);
  });

  test("Cancel returns to the landing page with the input value and focus", async ({ page }) => {
    await startHangingScan(page);
    await page.clock.runFor(3000);
    await page.getByRole("button", { name: "Cancel" }).click();
    const input = page.getByLabel("GitHub repository URL");
    await expect(input).toBeVisible();
    await expect(input).toHaveValue(REPO_URL);
    await expect(input).toBeFocused();
    await expect(page.getByRole("button", { name: "Dig up" })).toBeVisible();
    expect(new URL(page.url()).search).toBe("");
  });

  // graveyard-art R9.1, R18.5: the scanning screen now carries the caretaker scene, so every stage is checked.
  // Elapsed time (ms) that lands 100 ms into each stage, leaving the rest of the stage for axe's real-time run.
  const STAGE_ELAPSED = [100, 2100, 6100, 10100] as const;
  for (let stage = 0; stage < STAGES.length; stage++) {
    test(`has no axe violations in stage ${String(stage + 1)} (${STAGES[stage]})`, async ({ page }) => {
      await startHangingScan(page);
      await page.clock.runFor(STAGE_ELAPSED[stage]!);
      await expectStage(page, stage);
      // axe schedules its own timers, so let the fake clock run in real time again.
      await page.clock.resume();
      await expectNoA11yViolations(page, `scanning-stage-${String(stage + 1)}`, test.info().project.name);
    });
  }
});
