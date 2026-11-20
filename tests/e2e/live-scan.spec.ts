import { SCAN_DEADLINE_MS, SCAN_RESPONSE_MARGIN_MS } from "../../pipeline/constants";
import { buildHeaderModel, buildPackageRows, parseScanResponse } from "../../view-model";
import { expectNoA11yViolations } from "./support/a11y";
import { expect, test } from "./support/test";

// Requirements 20.12, 20.5, 10.1. Runs only in the `deployed` project (E2E_BASE_URL set),
// against production, with no mock of POST /api/scan. Never part of CI: it makes a real scan.

const RESULTS_WAIT_MS = SCAN_DEADLINE_MS + SCAN_RESPONSE_MARGIN_MS + 15_000;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test.skip(!process.env.E2E_BASE_URL, "E2E_BASE_URL is not set");

test("live production scan of revmic/canopy", async ({ page }) => {
  test.setTimeout(RESULTS_WAIT_MS + 60_000);
  const startedAt = Date.now();

  await page.goto("/");
  const link = page.getByRole("link", { name: /revmic\/canopy/ });
  await expect(link).toBeVisible();

  let requestStartedAt = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/scan" && requestStartedAt === 0) {
      requestStartedAt = Date.now();
    }
  });
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/scan",
    { timeout: RESULTS_WAIT_MS },
  );
  await link.click();
  const response = await responsePromise;
  const body: unknown = await response.json();
  const scanResponseMs = Date.now() - (requestStartedAt === 0 ? startedAt : requestStartedAt);

  const headers = response.headers();
  const outcome = parseScanResponse(
    response.status(),
    { get: (name: string) => headers[name.toLowerCase()] ?? null },
    body,
  );
  expect(outcome.kind, `scan response status ${response.status()}`).toBe("result");
  if (outcome.kind !== "result") return;
  const rows = buildPackageRows(outcome.result);
  const header = buildHeaderModel(outcome.result, rows);
  const expectedHeadline =
    header.headline !== null ? header.headline.text : (header.emptyText ?? "");
  expect(expectedHeadline).not.toBe("");

  await expect(page.getByText(expectedHeadline, { exact: true })).toBeVisible({
    timeout: RESULTS_WAIT_MS,
  });

  // Windowed bands fill over time; wait until every unique package has a Plot.
  const plots = page.locator("button.gk-plot");
  await expect(plots).toHaveCount(rows.length, { timeout: 30_000 });

  // Detail panel: open by click, named by the package, Escape closes and returns focus.
  const first = plots.first();
  await first.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const label = (await first.getAttribute("aria-label")) ?? "";
  const named = rows
    .map((row) => row.displayName)
    .filter((name) => name.length > 0 && label.includes(name))
    .sort((a, b) => b.length - a.length)[0];
  expect(named, `a package name inside the plot label "${label}"`).toBeDefined();
  await expect(
    page.getByRole("dialog", { name: new RegExp(escapeRegExp(named ?? "")) }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(first).toBeFocused();

  await expectNoA11yViolations(page, "live-results", test.info().project.name);

  const totalMs = Date.now() - startedAt;
  test.info().annotations.push(
    { type: "scan-response-ms", description: String(scanResponseMs) },
    { type: "total-test-ms", description: String(totalMs) },
  );
  console.log(`live-scan: scan response ${scanResponseMs} ms, total test ${totalMs} ms`);
});
