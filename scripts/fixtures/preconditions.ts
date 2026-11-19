// Requirement 23.10, 23.2

/**
 * Names of the variables that block a recording, or an empty list when it may run. The token is
 * passed as a value read by `readGithubToken`; it is never printed.
 */
export function missingPreconditions(
  liveFlag: string | undefined,
  token: string | null,
): readonly string[] {
  const missing: string[] = [];
  if (liveFlag !== '1') missing.push('GRAVEKEEPER_LIVE_TESTS (must be 1)');
  if (token === null) missing.push('GITHUB_TOKEN');
  return missing;
}
