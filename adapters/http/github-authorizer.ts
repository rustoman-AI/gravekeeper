import type { GithubConfig } from "../../pipeline/ports/http";

// Requirement 20.2, 20.3, 20.7
const hostOf = (raw: string): string | null => {
  try {
    return new URL(raw).host.toLowerCase();
  } catch {
    return null;
  }
};

/**
 * Returns the Authorization header value for a URL, or null. The value is
 * `Bearer <token>` only when the scheme is https, the host (with its port,
 * compared case-insensitively) equals the host of the API URL or the GraphQL
 * URL, and a token is set. The token is read on every call, so it is never
 * held outside the reader.
 */
export function createGithubAuthorizer(
  readToken: () => string | null,
  config: GithubConfig,
): (url: URL) => string | null {
  const allowed = [hostOf(config.apiUrl), hostOf(config.graphqlUrl)].filter(
    (h): h is string => h !== null && h !== "",
  );
  return (url: URL): string | null => {
    if (url.protocol !== "https:") return null;
    if (!allowed.includes(url.host.toLowerCase())) return null;
    const token = readToken();
    if (token === null || token === "") return null;
    return "Bearer " + token;
  };
}
