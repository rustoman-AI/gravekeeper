import { loadScan, type FixtureName } from "./support/fixtures";
import { expectNoA11yViolations } from "./support/a11y";
import { hang, mockScan, respondWithFixture } from "./support/mock-scan";
import { expect, test } from "./support/test";

// Requirements 1.2, 1.3, 1.5, 2.3, 16.10, 20.2, 20.5; graveyard-art 13.6, 18.5.
// graveyard-art R8, R10, R11: nothing here asserts the removed lantern dot, "NO GRADE" or a visible "(rule ...)".

const FEATURED: ReadonlyArray<{ repo: string; ecosystem: string; fixture: FixtureName }> = [
  { repo: "request/request", ecosystem: "npm", fixture: "request" },
  { repo: "revmic/canopy", ecosystem: "pypi", fixture: "canopy" },
  { repo: "ajeetdsouza/zoxide", ecosystem: "cargo", fixture: "zoxide" },
];

test.describe("landing page", () => {
  test("shows the title, the labelled input, the button and the featured links", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Gravekeeper" })).toBeVisible();
    await expect(page.getByLabel("GitHub repository URL")).toBeVisible();
    await expect(page.getByRole("button", { name: "Dig up" })).toBeVisible();
    for (const { repo, ecosystem } of FEATURED) {
      const link = page.getByRole("link", { name: new RegExp(`${repo}\\s*${ecosystem}`) });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", /^\/\?/);
    }
  });

  test("typing a URL and activating Dig up starts a scan", async ({ page }) => {
    const seen = await mockScan(page, hang());
    await page.goto("/");
    await page.getByLabel("GitHub repository URL").fill("https://github.com/request/request");
    await page.getByRole("button", { name: "Dig up" }).click();
    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0]).toMatchObject({ repoUrl: "https://github.com/request/request" });
    await expect(page.getByRole("button", { name: "Dig up" })).toHaveCount(0);
  });

  test("the Enter key in the input starts a scan", async ({ page }) => {
    const seen = await mockScan(page, hang());
    await page.goto("/");
    await page.getByLabel("GitHub repository URL").fill("https://github.com/revmic/canopy");
    await page.getByLabel("GitHub repository URL").press("Enter");
    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0]).toMatchObject({ repoUrl: "https://github.com/revmic/canopy" });
  });

  for (const { repo, fixture } of FEATURED) {
    test(`featured link ${repo} starts a scan of the mocked result`, async ({ page }) => {
      const seen = await mockScan(page, respondWithFixture(fixture));
      await page.goto("/");
      await page.getByRole("link", { name: new RegExp(repo) }).click();
      await expect.poll(() => seen.length).toBeGreaterThanOrEqual(1);
      expect(seen[0]).toMatchObject({ repoUrl: `https://github.com/${repo}` });
      // The result replaces the landing page.
      await expect(page.getByRole("button", { name: "Dig up" })).toHaveCount(0);
      expect(loadScan(fixture).ok).toBe(true);
    });
  }

  test("an empty input shows the message and sends no request", async ({ page }) => {
    const seen = await mockScan(page, hang());
    await page.goto("/");
    const input = page.getByLabel("GitHub repository URL");
    await page.getByRole("button", { name: "Dig up" }).click();
    await expect(page.getByText("Enter a repository URL")).toBeVisible();
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute("aria-invalid", "true");

    await input.fill("   ");
    await page.getByRole("button", { name: "Dig up" }).click();
    await expect(page.getByText("Enter a repository URL")).toBeVisible();
    expect(seen).toHaveLength(0);
  });

  test("has no axe violations", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Gravekeeper" })).toBeVisible();
    await expectNoA11yViolations(page, "landing", test.info().project.name);
  });
});
