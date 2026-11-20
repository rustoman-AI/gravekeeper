import { defineConfig } from "@playwright/test";

const PORT = 3100;
const PERF_SPEC = /scene-perf\.spec\.ts/;
// Targets production: only the `deployed` project runs it, and only with E2E_BASE_URL set.
const DEPLOYED_SPEC = /deployed\.spec\.ts/;
const externalBaseUrl = process.env.E2E_BASE_URL;
const baseURL = externalBaseUrl ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  // Viewports are set per project; a test may override with test.use({ viewport }).
  projects: [
    {
      name: "desktop",
      testIgnore: [PERF_SPEC, DEPLOYED_SPEC],
      use: { viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile",
      testIgnore: [PERF_SPEC, DEPLOYED_SPEC],
      use: { viewport: { width: 390, height: 844 } },
    },
    // The render-budget measurement runs alone, after the other projects finish,
    // so parallel workers do not compete for CPU while it measures.
    {
      name: "perf",
      testMatch: PERF_SPEC,
      fullyParallel: false,
      dependencies: ["desktop", "mobile"],
      use: { viewport: { width: 1280, height: 800 } },
    },
    ...(externalBaseUrl
      ? [
          {
            name: "deployed",
            testMatch: DEPLOYED_SPEC,
            use: { viewport: { width: 1280, height: 800 } },
          },
        ]
      : []),
  ],
  // With E2E_BASE_URL set, tests run against an external deployment: no local server.
  // The tests mock /api/scan in the browser, so this server never calls GitHub.
  ...(externalBaseUrl
    ? {}
    : {
        webServer: {
          command: `npm run build && npm run start -- -p ${PORT}`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 300_000,
        },
      }),
});
