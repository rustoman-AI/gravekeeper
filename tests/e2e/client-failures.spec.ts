import type { Page } from "@playwright/test";
import { CLIENT_FETCH_TIMEOUT_MS } from "../../view-model";
import { expectNoA11yViolations } from "./support/a11y";
import { loadScan } from "./support/fixtures";
import {
  abortRequest,
  hang,
  mockScan,
  respondWithFixture,
  respondWithRaw,
  type ScanHandler,
} from "./support/mock-scan";
import { expect, test } from "./support/test";

// Requirements 13.8, 14.2, 20.4.

const REPO_URL = "https://github.com/request/request";

const NETWORK = { heading: "The road is washed out", sentence: "The server could not be reached." };
const TIMEOUT = { heading: "The night ran out", sentence: "The server did not answer in time." };
const MALFORMED = {
  heading: "The records are garbled",
  sentence: "The server sent an answer that Gravekeeper could not read.",
};

function missingAdvisories(): ScanHandler {
  const body = loadScan("request");
  const first = (body.dependencies as Array<Record<string, unknown>>)[0]!;
  delete first.advisories;
  return respondWithRaw(JSON.stringify(body));
}

async function submit(page: Page): Promise<void> {
  await page.getByLabel("GitHub repository URL").fill(REPO_URL);
  await page.getByRole("button", { name: "Dig up" }).click();
}

async function expectFailure(
  page: Page,
  failure: { heading: string; sentence: string },
): Promise<void> {
  await expect(page.getByRole("heading", { level: 1, name: failure.heading })).toBeVisible();
  await expect(page.getByText(failure.sentence, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
}

async function expectResults(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { level: 1, name: "request/request" })).toBeVisible();
}

/** Starts a scan under a fake clock and lets the client timer expire. */
async function startAndTimeOut(page: Page): Promise<void> {
  await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
  await page.goto("/");
  await page.clock.pauseAt(new Date("2030-01-01T00:01:00Z"));
  await submit(page);
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  await page.clock.runFor(CLIENT_FETCH_TIMEOUT_MS);
}

test.describe("client failures", () => {
  test("the timeout constant is 30 seconds", () => {
    expect(CLIENT_FETCH_TIMEOUT_MS).toBe(30000);
  });

  test("a failed request shows network-failure, and Retry shows the results", async ({ page }) => {
    await mockScan(page, abortRequest("failed"));
    await page.goto("/");
    await submit(page);
    await expectFailure(page, NETWORK);

    await mockScan(page, respondWithFixture("request"));
    await page.getByRole("button", { name: "Try again" }).click();
    await expectResults(page);
  });

  test("an unanswered request shows timeout after 30 s, and Retry shows the results", async ({
    page,
  }) => {
    await mockScan(page, hang());
    await startAndTimeOut(page);
    await expectFailure(page, TIMEOUT);

    await mockScan(page, respondWithFixture("request"));
    await page.getByRole("button", { name: "Try again" }).click();
    await expectResults(page);
  });

  test("the timeout does not fire before 30 s", async ({ page }) => {
    await mockScan(page, hang());
    await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
    await page.goto("/");
    await page.clock.pauseAt(new Date("2030-01-01T00:01:00Z"));
    await submit(page);
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    await page.clock.runFor(CLIENT_FETCH_TIMEOUT_MS - 1000);
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: TIMEOUT.heading })).toHaveCount(0);
  });

  test("a body that is not JSON shows malformed-response, and Retry shows the results", async ({
    page,
  }) => {
    await mockScan(page, respondWithRaw("<html>not json</html>", { contentType: "text/html" }));
    await page.goto("/");
    await submit(page);
    await expectFailure(page, MALFORMED);

    await mockScan(page, respondWithFixture("request"));
    await page.getByRole("button", { name: "Try again" }).click();
    await expectResults(page);
  });

  test("a result without advisories shows malformed-response", async ({ page }) => {
    await mockScan(page, missingAdvisories());
    await page.goto("/");
    await submit(page);
    await expectFailure(page, MALFORMED);
  });

  test("has no axe violations on each client failure screen", async ({ page }) => {
    const project = test.info().project.name;

    await mockScan(page, abortRequest("failed"));
    await page.goto("/");
    await submit(page);
    await expectFailure(page, NETWORK);
    await expectNoA11yViolations(page, "client-network-failure", project);

    await mockScan(page, respondWithRaw("not json"));
    await page.getByRole("button", { name: "Try again" }).click();
    await expectFailure(page, MALFORMED);
    await expectNoA11yViolations(page, "client-malformed-response", project);
  });

  test("has no axe violations on the timeout screen", async ({ page }) => {
    await mockScan(page, hang());
    await startAndTimeOut(page);
    await expectFailure(page, TIMEOUT);
    // axe schedules its own timers, so let the fake clock run in real time again.
    await page.clock.resume();
    await expectNoA11yViolations(page, "client-timeout", test.info().project.name);
  });
});
