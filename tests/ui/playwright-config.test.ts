import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Requirements 15.1, 15.2, 15.3: the Playwright worker setting depends on E2E_BASE_URL.
describe("playwright.config.ts", () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env.E2E_BASE_URL;
    vi.resetModules();
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.E2E_BASE_URL;
    else process.env.E2E_BASE_URL = saved;
    vi.resetModules();
  });

  it("uses one worker and a deployed project when E2E_BASE_URL is set", async () => {
    process.env.E2E_BASE_URL = "https://example.test";
    const config = (await import("../../playwright.config")).default;
    expect(config.workers).toBe(1);
    expect(config.projects?.some((p) => p.name === "deployed")).toBe(true);
  });

  it("leaves workers undefined and has no deployed project when E2E_BASE_URL is unset", async () => {
    delete process.env.E2E_BASE_URL;
    const config = (await import("../../playwright.config")).default;
    expect(config.workers).toBeUndefined();
    expect(config.projects?.some((p) => p.name === "deployed")).toBe(false);
  });
});
