import type { Page } from "@playwright/test";
import { buildHeaderModel, buildPackageRows, parseScanResponse } from "../../view-model";
import { expectNoA11yViolations } from "./support/a11y";
import { loadScan, type FixtureName } from "./support/fixtures";
import { mockScan, respondWithFixture } from "./support/mock-scan";
import { expect, test } from "./support/test";

// Requirements 20.2, 20.5, 3.5, 3.8, 5.2, 8.9, 18.1, 16.10.

const RECORDED: readonly FixtureName[] = ["request", "canopy", "zoxide", "synthetic-restless"];

function parsed(name: FixtureName) {
  const outcome = parseScanResponse(200, { get: () => null }, loadScan(name));
  if (outcome.kind !== "result") throw new Error(`fixture ${name} did not parse`);
  const rows = buildPackageRows(outcome.result);
  return { result: outcome.result, rows, header: buildHeaderModel(outcome.result, rows) };
}

function repoUrlOf(name: FixtureName): string {
  const { repo } = parsed(name).result;
  return `https://github.com/${repo.owner}/${repo.repo}`;
}

function resultPath(name: FixtureName): string {
  return `/?repo=${encodeURIComponent(repoUrlOf(name))}`;
}

function headlineOf(name: FixtureName): string {
  const { header } = parsed(name);
  return header.headline !== null ? header.headline.text : (header.emptyText ?? "");
}

async function openList(page: Page): Promise<void> {
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
}

test.describe("results", () => {
  test("the request fixture headline matches the expected text", () => {
    expect(headlineOf("request")).toBe(
      "31 of 40 dependencies are in the graveyard: 6 buried, 20 forgotten, 5 haunted.",
    );
  });

  for (const name of RECORDED) {
    test(`${name}: Scene and List show the headline computed from the file`, async ({ page }) => {
      await mockScan(page, respondWithFixture(name));
      const { header, rows } = parsed(name);
      await page.goto(resultPath(name));
      await expect(page.getByRole("heading", { level: 1, name: header.repoName })).toBeVisible();
      await expect(page.getByText(headlineOf(name), { exact: true })).toBeVisible();
      await expect(page.locator(".gk-scene")).toBeVisible();
      await expect(page.locator("button.gk-plot")).toHaveCount(rows.length);

      await openList(page);
      await expect(page.getByText(headlineOf(name), { exact: true })).toBeVisible();
      await expect(page.locator("tbody tr")).toHaveCount(rows.length);
    });

    test(`${name}: reload gives the same result`, async ({ page }) => {
      await mockScan(page, respondWithFixture(name));
      await page.goto(resultPath(name));
      await expect(page.getByText(headlineOf(name), { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByText(headlineOf(name), { exact: true })).toBeVisible();
      await expect(page.locator("button.gk-plot")).toHaveCount(parsed(name).rows.length);
    });

    test(`${name}: has no axe violations in Scene and List`, async ({ page }) => {
      await mockScan(page, respondWithFixture(name));
      await page.goto(resultPath(name));
      await expect(page.getByText(headlineOf(name), { exact: true })).toBeVisible();
      await expect(page.locator("button.gk-plot").first()).toBeVisible();
      await expectNoA11yViolations(page, `results-scene-${name}`, test.info().project.name);

      await openList(page);
      await expectNoA11yViolations(page, `results-list-${name}`, test.info().project.name);
    });
  }

  test("Back and Forward move between two results", async ({ page }) => {
    const byRepo = new Map<string, FixtureName>([
      [repoUrlOf("request"), "request"],
      [repoUrlOf("canopy"), "canopy"],
    ]);
    await mockScan(page, (route, request) => {
      const body = request.postDataJSON() as { repoUrl?: string } | null;
      const name = byRepo.get(body?.repoUrl ?? "") ?? "request";
      return respondWithFixture(name)(route, request);
    });

    await page.goto(resultPath("request"));
    await expect(page.getByText(headlineOf("request"), { exact: true })).toBeVisible();
    await page.goto(resultPath("canopy"));
    await expect(page.getByText(headlineOf("canopy"), { exact: true })).toBeVisible();

    await page.goBack();
    await expect(page.getByText(headlineOf("request"), { exact: true })).toBeVisible();
    await page.goForward();
    await expect(page.getByText(headlineOf("canopy"), { exact: true })).toBeVisible();
  });

  test("the synthetic 301-package result renders every plot", async ({ page }) => {
    await mockScan(page, respondWithFixture("synthetic-301"));
    const { rows } = parsed("synthetic-301");
    expect(rows).toHaveLength(301);
    await page.goto(resultPath("synthetic-301"));
    await expect(page.locator(".gk-scene[data-simplified]")).toBeVisible();
    await expect(page.locator("button.gk-plot")).toHaveCount(301);
  });

  test("the restless ghost is drawn and labelled haunted, buried", async ({ page }) => {
    await mockScan(page, respondWithFixture("synthetic-restless"));
    await page.goto(resultPath("synthetic-restless"));
    const restless = page.locator('button.gk-plot[data-kind="restless"]');
    await expect(restless).toHaveCount(1);
    await expect(restless).toBeVisible();
    await expect(restless).toHaveAttribute("aria-label", /haunted, buried/);
    await expect(restless.locator("svg use")).toHaveAttribute("href", /#plot-restless-(rounded|cross|obelisk|slab)$/);
  });
});
