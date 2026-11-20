import type { Page } from "@playwright/test";
import { parseScanResponse } from "../../view-model";
import { loadScan, type ScanOkBody } from "./support/fixtures";
import {
  abortRequest,
  mockScan,
  respondWithError,
  respondWithFixture,
  type ScanHandler,
} from "./support/mock-scan";
import { expect, test } from "./support/test";

// Requirements 16.6, 20.6. Companion of reduced-motion.spec.ts: error screens, notes, picker.

const REPO_URL = "https://github.com/request/request";

/** Number of running CSS animations anywhere in the document. */
function runningAnimations(page: Page): Promise<number> {
  return page.evaluate(
    () => document.getAnimations().filter((a) => a.playState === "running").length,
  );
}

/** Elements whose computed animation is not `none`. */
function animatedElements(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("*"))
      .filter((el) => getComputedStyle(el).animationName !== "none")
      .map((el) => `${el.tagName.toLowerCase()}.${el.getAttribute("class") ?? ""}`),
  );
}

async function expectStill(page: Page): Promise<void> {
  expect(await runningAnimations(page)).toBe(0);
  expect(await animatedElements(page)).toEqual([]);
}

async function submit(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("GitHub repository URL").fill(REPO_URL);
  await page.getByRole("button", { name: "Dig up" }).click();
}

/** A `no-root-manifest` body built from the request fixture, validated by the view-model. */
function noRootManifestBody(): ScanOkBody {
  const body = loadScan("request");
  const paths = ["packages/a/package.json", "packages/b/package.json"];
  body.notes = [
    {
      code: "no-root-manifest",
      message:
        "No manifest was found at the repository root. Choose one of the manifests found in subfolders.",
      details: { paths },
    },
  ];
  body.discovery = {
    ...(body.discovery as Record<string, unknown>),
    candidates: paths.map((p) => ({ path: p, format: "package.json", depth: 2, sizeBytes: 500 })),
  };
  body.manifests = [];
  body.dependencies = [];
  body.assessed = [];
  const outcome = parseScanResponse(200, { get: () => null }, body);
  if (outcome.kind !== "result") throw new Error("no-root-manifest body did not parse");
  return body;
}

test.describe("reduced motion: errors, notes and picker", () => {
  test.describe("with prefers-reduced-motion: reduce", () => {
    test.use({ reducedMotion: "reduce" });

    test("a 503 error screen with Retry-After runs without animation", async ({ page }) => {
      await mockScan(
        page,
        respondWithError(503, { code: "upstream-unavailable" }, { "Retry-After": "30" }),
      );
      await submit(page);
      await expect(page.getByText("Error code: upstream-unavailable")).toBeVisible();
      await expect(page.getByRole("button", { name: /Try again/ })).toBeVisible();
      await expectStill(page);
    });

    test("a client failure screen runs without animation", async ({ page }) => {
      await mockScan(page, abortRequest());
      await submit(page);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("button", { name: "Dig up" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
      await expectStill(page);
    });

    test("the caretaker's notes run without animation", async ({ page }) => {
      await mockScan(page, respondWithFixture("request"));
      await submit(page);
      const heading = page.locator("#caretakers-notes-heading");
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
      await expectStill(page);
    });

    test("the manifest picker flow runs without animation", async ({ page }) => {
      const body = noRootManifestBody();
      let calls = 0;
      const handler: ScanHandler = (route) => {
        calls += 1;
        return calls === 1
          ? route.fulfill({
              status: 200,
              headers: { "content-type": "application/json; charset=utf-8" },
              body: JSON.stringify(body),
            })
          : respondWithFixture("request")(route, route.request());
      };
      await mockScan(page, handler);
      await submit(page);
      const first = page.getByRole("checkbox").first();
      await expect(first).toBeVisible();
      await expectStill(page);

      await first.check();
      await expectStill(page);

      await page.getByRole("button", { name: "Scan selected manifests" }).click();
      await expect(page.locator(".gk-scene")).toBeVisible();
      await expectStill(page);
    });
  });

  test.describe("without a motion preference", () => {
    test.use({ reducedMotion: "no-preference" });

    test("the results scene has running animations", async ({ page }) => {
      await mockScan(page, respondWithFixture("synthetic-restless"));
      await submit(page);
      await expect(page.locator(".gk-scene")).toBeVisible();
      await expect.poll(() => runningAnimations(page)).toBeGreaterThan(0);
    });
  });
});
