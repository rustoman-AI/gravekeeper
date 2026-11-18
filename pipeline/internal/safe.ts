// Requirement 18.4, 18.5
/** Top-level safety net: runs `run`, and returns `fallback(error)` if it throws. */
export function guard<T>(run: () => T, fallback: (error: unknown) => T): T {
  try {
    return run();
  } catch (error) {
    return fallback(error);
  }
}
