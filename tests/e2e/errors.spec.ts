import type { Page } from "@playwright/test";
import { expectNoA11yViolations } from "./support/a11y";
import { mockScan, respondWithError, respondWithFixture, type ScanHandler } from "./support/mock-scan";
import { expect, test } from "./support/test";

// Requirements 13.2, 13.4, 13.15, 13.16, 16.10, 20.3, 20.5.

const REPO = "https://github.com/request/request";

function screenshotName(name: string): string {
  return `error-${name}`;
}

/** Runs the handlers in order; the last one answers every later request. */
function inOrder(...handlers: ScanHandler[]): ScanHandler {
  let index = 0;
  return (route, request) => {
    const handler = handlers[Math.min(index, handlers.length - 1)]!;
    index += 1;
    return handler(route, request);
  };
}

/** Installs the fake clock, loads the landing page, freezes time, then submits the form (as scanning.spec.ts does). */
async function openWithFrozenClock(page: Page): Promise<void> {
  await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
  await page.goto("/");
  await page.clock.pauseAt(new Date("2030-01-01T00:01:00Z"));
  await page.getByLabel("GitHub repository URL").fill(REPO);
  await page.getByRole("button", { name: "Dig up" }).click();
}

async function gotoScan(page: Page, repo: string = REPO, manifests: string[] = []): Promise<void> {
  const query = [`repo=${encodeURIComponent(repo)}`, ...manifests.map((m) => `manifest=${encodeURIComponent(m)}`)];
  await page.goto(`/?${query.join("&")}`);
}

async function expectErrorScreen(
  page: Page,
  expected: { heading: string; code: string; status: number; message: string },
): Promise<void> {
  await expect(page.getByRole("heading", { level: 1, name: expected.heading })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: expected.heading })).toBeFocused();
  await expect(page.getByText(expected.message, { exact: true })).toBeVisible();
  await expect(page.getByText(`Error code: ${expected.code}`)).toBeVisible();
  await expect(page.getByText(`HTTP status: ${String(expected.status)}`)).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to the gate" })).toHaveAttribute("href", "/");
}

function manifestsInUrl(page: Page): string[] {
  return new URL(page.url()).searchParams.getAll("manifest");
}

test.describe("invalid-url", () => {
  const PARTS = ["url", "host", "path", "owner", "repository", "branch"] as const;
  for (const part of PARTS) {
    test(`details.part ${part}: shows the part, the editable URL field and no Retry`, async ({ page }) => {
      const message = `The ${part} of the URL is not accepted.`;
      await mockScan(page, respondWithError(400, { code: "invalid-url", message, details: { part } }));
      await gotoScan(page, "https://example.com/nope");
      await expectErrorScreen(page, {
        heading: "That is not a grave we can find",
        code: "invalid-url",
        status: 400,
        message,
      });
      await expect(page.getByText(`The part that failed: ${part}`)).toBeVisible();
      await expect(page.getByLabel("GitHub repository URL")).toHaveValue("https://example.com/nope");
      await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
      await expectNoA11yViolations(page, screenshotName(`invalid-url-${part}`), test.info().project.name);
    });
  }

  test("submitting a corrected URL scans it", async ({ page }) => {
    const seen = await mockScan(
      page,
      inOrder(
        respondWithError(400, { code: "invalid-url", message: "Bad host.", details: { part: "host" } }),
        respondWithFixture("request"),
      ),
    );
    await gotoScan(page, "https://gitlab.com/a/b");
    const input = page.getByLabel("GitHub repository URL");
    await expect(input).toBeVisible();
    await input.fill(REPO);
    await input.press("Enter");
    await expect.poll(() => seen.length).toBe(2);
    expect(seen[1]).toEqual({ repoUrl: REPO });
    await expect(page.getByRole("heading", { level: 1, name: "That is not a grave we can find" })).toHaveCount(0);
  });
});

test.describe("invalid-request", () => {
  const REASONS = [
    "invalid-json",
    "invalid-type",
    "unknown-field",
    "missing-field",
    "too-many-items",
    "branch-conflict",
    "body-too-large",
    "unsupported-media-type",
    "method-not-allowed",
  ] as const;
  for (const reason of REASONS) {
    test(`details.reason ${reason}: shows the hint and Retry`, async ({ page }) => {
      const message = `The request is not valid: ${reason}.`;
      const status = reason === "body-too-large" ? 413 : reason === "method-not-allowed" ? 405 : 400;
      await mockScan(page, respondWithError(status, { code: "invalid-request", message, details: { reason } }));
      await gotoScan(page);
      await expectErrorScreen(page, {
        heading: "The request was not understood",
        code: "invalid-request",
        status,
        message,
      });
      await expect(page.getByText("This is a fault in Gravekeeper, not in your URL")).toBeVisible();
      await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
      await expectNoA11yViolations(page, screenshotName(`invalid-request-${reason}`), test.info().project.name);
    });
  }
});

test.describe("repo-not-found and branch-not-found", () => {
  test("repo-not-found: hint and Edit the URL", async ({ page }) => {
    const message = "This repository does not exist or is not public.";
    await mockScan(page, respondWithError(404, { code: "repo-not-found", message }));
    await gotoScan(page);
    await expectErrorScreen(page, { heading: "No such graveyard", code: "repo-not-found", status: 404, message });
    await expect(page.getByText("The repository must exist and be public")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
    await page.getByRole("button", { name: "Edit the URL" }).click();
    await expect(page.getByLabel("GitHub repository URL")).toHaveValue(REPO);
    await expectNoA11yViolations(page, screenshotName("repo-not-found"), test.info().project.name);
  });

  test("branch-not-found: Scan the default branch rescans without /tree/<branch>", async ({ page }) => {
    const message = "The branch nope does not exist in this repository.";
    const seen = await mockScan(
      page,
      inOrder(
        respondWithError(404, { code: "branch-not-found", message, details: { branch: "nope" } }),
        respondWithFixture("request"),
      ),
    );
    await gotoScan(page, `${REPO}/tree/nope`);
    await expectErrorScreen(page, {
      heading: "That branch has no graves",
      code: "branch-not-found",
      status: 404,
      message,
    });
    await expect(page.getByRole("button", { name: "Edit the URL" })).toBeVisible();
    await expectNoA11yViolations(page, screenshotName("branch-not-found"), test.info().project.name);

    await page.getByRole("button", { name: "Scan the default branch" }).click();
    await expect.poll(() => seen.length).toBe(2);
    expect(seen[1]).toEqual({ repoUrl: REPO });
    expect(new URL(page.url()).searchParams.get("repo")).toBe(REPO);
    await expect(page.getByRole("heading", { level: 1, name: "That branch has no graves" })).toHaveCount(0);
  });
});

test.describe("manifest errors", () => {
  const CANDIDATES = ["package.json", "apps/web/package.json", "apps/api/package.json"];
  const variants = [
    {
      code: "too-many-manifests",
      heading: "Too many plots at once",
      status: 400,
      message: "Choose at most 10 manifests per scan.",
      details: (candidates: string[]) => ({ limit: 10, candidates }),
      selected: ["a/package.json", "b/package.json"] as string[],
    },
    {
      code: "manifest-not-found",
      heading: "That manifest is not here",
      status: 404,
      message: "The manifest missing/package.json was not found in this repository.",
      details: (candidates: string[]) => ({ path: "missing/package.json", candidates }),
      selected: ["missing/package.json"],
    },
  ] as const;

  for (const v of variants) {
    test(`${v.code} with candidates: select paths and rescan with manifest values`, async ({ page }) => {
      const seen = await mockScan(
        page,
        inOrder(
          respondWithError(v.status, { code: v.code, message: v.message, details: v.details(CANDIDATES) }),
          respondWithFixture("request"),
        ),
      );
      await gotoScan(page, REPO, [...v.selected]);
      await expectErrorScreen(page, { heading: v.heading, code: v.code, status: v.status, message: v.message });
      await expect(page.getByRole("checkbox")).toHaveCount(CANDIDATES.length);
      const scanSelected = page.getByRole("button", { name: "Scan selected manifests" });
      await expect(scanSelected).toBeDisabled();
      await expect(page.getByRole("button", { name: "Scan the repository root" })).toBeVisible();
      await expectNoA11yViolations(page, screenshotName(`${v.code}-candidates`), test.info().project.name);

      await page.getByRole("checkbox", { name: "apps/web/package.json" }).check();
      await page.getByRole("checkbox", { name: "apps/api/package.json" }).check();
      await expect(scanSelected).toBeEnabled();
      await scanSelected.click();
      await expect.poll(() => seen.length).toBe(2);
      expect(seen[1]).toEqual({ repoUrl: REPO, manifests: ["apps/web/package.json", "apps/api/package.json"] });
      expect(manifestsInUrl(page)).toEqual(["apps/web/package.json", "apps/api/package.json"]);
    });

    test(`${v.code} with candidates: Scan the repository root rescans without manifests`, async ({ page }) => {
      const seen = await mockScan(
        page,
        inOrder(
          respondWithError(v.status, { code: v.code, message: v.message, details: v.details(CANDIDATES) }),
          respondWithFixture("request"),
        ),
      );
      await gotoScan(page, REPO, [...v.selected]);
      await expectErrorScreen(page, { heading: v.heading, code: v.code, status: v.status, message: v.message });
      await page.getByRole("button", { name: "Scan the repository root" }).click();
      await expect.poll(() => seen.length).toBe(2);
      expect(seen[1]).toEqual({ repoUrl: REPO });
      expect(manifestsInUrl(page)).toEqual([]);
      expect(new URL(page.url()).searchParams.get("repo")).toBe(REPO);
    });

    test(`${v.code} with an empty candidate list: no picker, only the root scan`, async ({ page }) => {
      const seen = await mockScan(
        page,
        inOrder(
          respondWithError(v.status, { code: v.code, message: v.message, details: v.details([]) }),
          respondWithFixture("request"),
        ),
      );
      await gotoScan(page, REPO, [...v.selected]);
      await expectErrorScreen(page, { heading: v.heading, code: v.code, status: v.status, message: v.message });
      await expect(page.getByRole("checkbox")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Scan selected manifests" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Scan the repository root" })).toBeVisible();
      await expectNoA11yViolations(page, screenshotName(`${v.code}-empty`), test.info().project.name);

      await page.getByRole("button", { name: "Scan the repository root" }).click();
      await expect.poll(() => seen.length).toBe(2);
      expect(seen[1]).toEqual({ repoUrl: REPO });
    });
  }
});

test.describe("upstream-unavailable", () => {
  const MESSAGE = "GitHub could not be reached, so the repository could not be read. Try again in a minute.";
  const DETAILS = { source: "github" };

  async function openWithClock(page: Page): Promise<void> {
    await openWithFrozenClock(page);
  }

  test("503 with Retry-After: countdown, Retry enabled when it ends", async ({ page }) => {
    const seen = await mockScan(
      page,
      inOrder(
        respondWithError(503, { code: "upstream-unavailable", message: MESSAGE, details: DETAILS }, { "Retry-After": "30" }),
        respondWithFixture("request"),
      ),
    );
    await openWithClock(page);
    await expectErrorScreen(page, {
      heading: "The gates are shut for now",
      code: "upstream-unavailable",
      status: 503,
      message: MESSAGE,
    });
    const retry = page.getByRole("button", { name: "Try again" });
    await expect(retry).toBeDisabled();
    await expect(page.getByText("You can try again in 30 seconds")).toBeVisible();

    await page.clock.runFor(10_000);
    await expect(page.getByText("You can try again in 20 seconds")).toBeVisible();
    await expect(retry).toBeDisabled();

    await page.clock.runFor(19_000);
    await expect(page.getByText("You can try again in 1 second")).toBeVisible();
    await expect(retry).toBeDisabled();

    await page.clock.runFor(1_000);
    await expect(retry).toBeEnabled();
    await expect(page.getByText(/You can try again in/)).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText("You can try again now");

    // axe schedules its own timers, so let the fake clock run in real time again.
    await page.clock.resume();
    await expectNoA11yViolations(page, screenshotName("upstream-503"), test.info().project.name);

    await retry.click();
    await expect.poll(() => seen.length).toBe(2);
  });

  test("502 without Retry-After: fallback cooldown of 10 seconds", async ({ page }) => {
    await mockScan(
      page,
      respondWithError(502, { code: "upstream-unavailable", message: MESSAGE, details: DETAILS }),
    );
    await openWithClock(page);
    await expectErrorScreen(page, {
      heading: "The gates are shut for now",
      code: "upstream-unavailable",
      status: 502,
      message: MESSAGE,
    });
    const retry = page.getByRole("button", { name: "Try again" });
    await expect(retry).toBeDisabled();
    await expect(page.getByText("You can try again in 10 seconds")).toBeVisible();
    await page.clock.runFor(9_000);
    await expect(retry).toBeDisabled();
    await page.clock.runFor(1_000);
    await expect(retry).toBeEnabled();

    await page.clock.resume();
    await expectNoA11yViolations(page, screenshotName("upstream-502"), test.info().project.name);
  });
});

test.describe("deadline-exceeded and internal-error", () => {
  const CASES = [
    {
      code: "deadline-exceeded",
      status: 504,
      heading: "The night ran out",
      message: "The repository could not be read in time. Try again in a minute.",
    },
    {
      code: "internal-error",
      status: 500,
      heading: "The gravedigger tripped",
      message: "Something went wrong on our side. Try again in a minute.",
    },
  ] as const;
  for (const c of CASES) {
    test(`${c.code}: Retry is offered after the fallback cooldown`, async ({ page }) => {
      const seen = await mockScan(
        page,
        inOrder(respondWithError(c.status, { code: c.code, message: c.message }), respondWithFixture("request")),
      );
      await openWithFrozenClock(page);
      await expectErrorScreen(page, { heading: c.heading, code: c.code, status: c.status, message: c.message });
      const retry = page.getByRole("button", { name: "Try again" });
      await expect(retry).toBeDisabled();
      await page.clock.runFor(10_000);
      await expect(retry).toBeEnabled();

      await page.clock.resume();
      await expectNoA11yViolations(page, screenshotName(c.code), test.info().project.name);

      await retry.click();
      await expect.poll(() => seen.length).toBe(2);
    });
  }
});
