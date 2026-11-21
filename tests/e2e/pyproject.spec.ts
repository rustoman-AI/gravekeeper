import type { Page } from "@playwright/test";
import { buildPackageRows, parseScanResponse } from "../../view-model";
import { expectNoA11yViolations } from "./support/a11y";
import { loadScan } from "./support/fixtures";
import { mockScan, respondWithFixture } from "./support/mock-scan";
import { expect, test } from "./support/test";

// pyproject requirement 12.7: a pyproject.toml scan shows its dependencies, its manifest path and its manifest warnings.

const EXPECTED_UNIQUE_PACKAGES = 17;
const SELF_REFERENCE_WARNING =
  'pyproject.toml table [dependency-groups.test]: "requests" refers to this project itself and was skipped.';

function parsed() {
  const outcome = parseScanResponse(200, { get: () => null }, loadScan("psf-requests"));
  if (outcome.kind !== "result") throw new Error("fixture psf-requests did not parse");
  return { result: outcome.result, rows: buildPackageRows(outcome.result) };
}

function resultPath(): string {
  const { repo } = parsed().result;
  return `/?repo=${encodeURIComponent(`https://github.com/${repo.owner}/${repo.repo}`)}`;
}

async function openList(page: Page): Promise<void> {
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
}

test.describe("pyproject results", () => {
  test("shows one row per unique package", async ({ page }) => {
    await mockScan(page, respondWithFixture("psf-requests"));
    expect(parsed().rows).toHaveLength(EXPECTED_UNIQUE_PACKAGES);
    await page.goto(resultPath());
    await expect(page.locator("button.gk-plot")).toHaveCount(EXPECTED_UNIQUE_PACKAGES);
    await openList(page);
    await expect(page.locator("tbody tr")).toHaveCount(EXPECTED_UNIQUE_PACKAGES);
  });

  test("a dependency lists pyproject.toml under where it is declared", async ({ page }) => {
    await mockScan(page, respondWithFixture("psf-requests"));
    await page.goto(resultPath());
    await page.locator("button.gk-plot").first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const where = dialog.locator("section", { has: page.getByRole("heading", { name: "Where it is declared" }) });
    await expect(where.getByRole("listitem").filter({ hasText: /^pyproject\.toml$/ })).toHaveCount(1);
  });

  test("the Manifest warnings section shows the self-reference warning", async ({ page }) => {
    await mockScan(page, respondWithFixture("psf-requests"));
    await page.goto(resultPath());
    const section = page.getByRole("region", { name: "Manifest warnings" });
    await expect(section).toBeVisible();
    await expect(section.getByText("pyproject.toml", { exact: true })).toBeVisible();
    await expect(section.getByText(SELF_REFERENCE_WARNING, { exact: true })).toBeVisible();
  });

  test("has no axe violations in Scene and List", async ({ page }) => {
    await mockScan(page, respondWithFixture("psf-requests"));
    await page.goto(resultPath());
    await expect(page.locator("button.gk-plot").first()).toBeVisible();
    await expectNoA11yViolations(page, "pyproject-scene", test.info().project.name);
    await openList(page);
    await expectNoA11yViolations(page, "pyproject-list", test.info().project.name);
  });
});
