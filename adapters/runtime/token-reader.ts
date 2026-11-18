// Requirement 2.7, 20.1, 20.10, 22.17
/**
 * The GitHub token from the environment, or null when it is unset or an empty string.
 * This is the only file in the repository that reads the token variable.
 */
export function readGithubToken(): string | null {
  const value = process.env.GITHUB_TOKEN;
  return typeof value === 'string' && value !== '' ? value : null;
}
