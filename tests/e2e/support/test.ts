import { test as base, expect } from "@playwright/test";

/**
 * Extended `test`: every request to an origin other than the test server's is
 * aborted and recorded, and the test fails in teardown if any was recorded.
 * The guard is a context route registered before the test body, so later
 * `page.route` handlers (mockScan) take precedence for their own URLs.
 */
export const test = base.extend<{ offOriginGuard: string[] }>({
  offOriginGuard: [
    async ({ context, baseURL }, use) => {
      const allowed = new URL(baseURL ?? "http://localhost").origin;
      const blocked: string[] = [];
      await context.route("**/*", (route) => {
        const url = route.request().url();
        let origin = "";
        try {
          origin = new URL(url).origin;
        } catch {
          origin = "";
        }
        if (origin === allowed) {
          return route.fallback();
        }
        blocked.push(url);
        return route.abort("blockedbyclient");
      });
      await use(blocked);
      expect(blocked, "requests to hosts other than the test server").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
