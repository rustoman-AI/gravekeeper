import { it } from 'vitest';

// Run only by tests/support/support.test.ts through a child vitest run.
it('swallows the offline fetch error', async () => {
  try {
    await fetch('https://swallowed.example.com/x');
  } catch {
    // swallowed on purpose
  }
});
