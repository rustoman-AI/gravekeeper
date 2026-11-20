import { afterEach } from "vitest";

// Component tests opt into jsdom with `// @vitest-environment jsdom`.
// In node-environment tests nothing is imported, so react-dom is not loaded.
if (typeof document !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => {
    cleanup();
  });
}
