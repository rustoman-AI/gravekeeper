import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    testTimeout: 30000,
    environment: "node",
    setupFiles: ["tests/support/offline-fetch.ts", "tests/support/ui/dom-setup.ts"],
  },
});
