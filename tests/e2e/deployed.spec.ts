import { expectNoA11yViolations } from "./support/a11y";
import { expect, test } from "./support/test";

// Requirements 15.8, 1.1, 1.2, 1.7. Runs only in the `deployed` project (E2E_BASE_URL set),
// against production: no API mock and no /api/scan request.

test.describe("deployed landing page", () => {
  test("shows the landing page with the form, featured row and legend", async ({ page }) => {
    const scanRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/scan") scanRequests.push(request.url());
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Gravekeeper" })).toBeVisible();
    await expect(page.getByLabel("GitHub repository URL")).toBeVisible();
    await expect(page.getByRole("button", { name: "Dig up" })).toBeVisible();

    const featured = page
      .getByRole("heading", { level: 2, name: "Featured graveyards" })
      .locator("xpath=ancestor::section[1]");
    await expect(featured.getByRole("link")).toHaveCount(3);

    const legend = page
      .getByRole("heading", { level: 2, name: "Legend" })
      .locator("xpath=ancestor::section[1]");
    await expect(legend.getByRole("listitem")).toHaveCount(6);
    await expect(legend.getByText("Restless ghost")).toBeVisible();

    await expectNoA11yViolations(page, "deployed-landing", test.info().project.name);
    expect(scanRequests).toEqual([]);
  });
});
