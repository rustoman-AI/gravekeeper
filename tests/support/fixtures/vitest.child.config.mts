import { defineConfig } from 'vitest/config';

// Config for the child run in tests/support/support.test.ts.
export default defineConfig({
  root: process.cwd(),
  test: {
    include: ['tests/support/fixtures/*.fixture.ts'],
    environment: 'node',
    setupFiles: ['tests/support/offline-fetch.ts'],
  },
});
