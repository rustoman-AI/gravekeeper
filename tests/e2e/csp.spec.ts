import type { Page } from "@playwright/test";
import { contentSecurityPolicy } from "../../security-headers";
import { hang, mockScan, respondWithError, respondWithFixture } from "./support/mock-scan";
import { expect, test } from "./support/test";

// Requirements 21.6, 15.3.

const REPO = "https://github.com/request/request";
const HEADER = "content-security-policy";

interface Watch {
  consoleCsp: string[];
  fontUrls: string[];
}

/** Records console CSP reports, font responses and `securitypolicyviolation` events (on window). */
async function watch(page: Page): Promise<Watch> {
  const state: Watch = { consoleCsp: [], fontUrls: [] };
  await page.addInitScript(() => {
    const w = window as unknown as { __cspViolations: string[] };
    w.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      w.__cspViolations.push(`${event.violatedDirective} blocked ${event.blockedURI}`);
    });
  });
  page.on("console", (message) => {
    const text = message.text();
    if (/Content Security Policy|Refused to/i.test(text)) state.consoleCsp.push(text);
  });
  page.on("response", (response) => {
    if (response.request().resourceType() === "font") state.fontUrls.push(response.url());
  });
  return state;
}

async function expectNoViolations(page: Page, state: Watch): Promise<void> {
  const events = await page.evaluate(
    () => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
  );
  expect(events, "securitypolicyviolation events").toEqual([]);
  expect(state.consoleCsp, "console CSP messages").toEqual([]);
}

async function submit(page: Page): Promise<void> {
  await page.getByLabel("GitHub repository URL").fill(REPO);
  await page.getByRole("button", { name: "Dig up" }).click();
}

test.describe("content security policy", () => {
  test("the header is on the landing page and the results page", async ({ page }) => {
    await mockScan(page, respondWithFixture("request"));
    const expected = contentSecurityPolicy(false);

    const landing = await page.goto("/");
    expect(landing?.headers()[HEADER]).toBe(expected);

    const results = await page.goto(`/?repo=${encodeURIComponent(REPO)}`);
    expect(results?.headers()[HEADER]).toBe(expected);
    await expect(page.locator("button.gk-plot").first()).toBeVisible();
  });

  test("the header is on /api/scan (400 for an invalid repository URL)", async ({ request, baseURL }) => {
    const response = await request.post(`${baseURL}/api/scan`, { data: { repoUrl: "not-a-repo" } });
    expect(response.status()).toBe(400);
    expect(response.headers()[HEADER]).toBe(contentSecurityPolicy(false));
    // Rejected by URL parsing, before any upstream source is called.
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("invalid-url");
  });

  test("no violation on the landing screen; fonts load from the same origin", async ({ page, baseURL }) => {
    const state = await watch(page);
    await page.goto("/");
    await expect(page.getByLabel("GitHub repository URL")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expectNoViolations(page, state);
    await expect.poll(() => state.fontUrls.length, "font responses").toBeGreaterThan(0);
    const origin = new URL(baseURL!).origin;
    for (const url of state.fontUrls) expect(new URL(url).origin).toBe(origin);
  });

  test("no violation on the scanning screen", async ({ page }) => {
    const state = await watch(page);
    await mockScan(page, hang());
    await page.goto("/");
    await submit(page);
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    await expectNoViolations(page, state);
  });

  test("no violation on the results, list and detail screens", async ({ page, baseURL }) => {
    const state = await watch(page);
    await mockScan(page, respondWithFixture("synthetic-restless"));
    await page.goto("/");
    await submit(page);
    await expect(page.locator("button.gk-plot").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expectNoViolations(page, state);

    await page.locator("button.gk-plot").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoViolations(page, state);
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

    await page.getByRole("button", { name: "List", exact: true }).click();
    await expect(page.getByRole("button", { name: "List", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expectNoViolations(page, state);

    const origin = new URL(baseURL!).origin;
    for (const url of state.fontUrls) expect(new URL(url).origin).toBe(origin);
  });

  test("no violation on the error screen", async ({ page }) => {
    const state = await watch(page);
    await mockScan(
      page,
      respondWithError(400, { code: "invalid-url", message: "Bad host.", details: { part: "host" } }),
    );
    await page.goto(`/?repo=${encodeURIComponent("https://example.com/nope")}`);
    await expect(page.getByText("Error code: invalid-url")).toBeVisible();
    await expectNoViolations(page, state);
  });
});
