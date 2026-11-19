import { describe } from "vitest";
import { readGithubToken } from "../../adapters/runtime/token-reader";
import { assertRowPaths, liveRowIt, type LiveResponse } from "./live-support";

// Requirement 23.8, 23.9, 23.14, 23.15
// Live contract tests for the verified GitHub rows EF-12 to EF-19. Skipped
// unless GRAVEKEEPER_LIVE_TESTS=1; EF-17 to EF-19 also need a token. The token
// is only used in the Authorization header and is never printed.

const OWNER = "request";
const REPO = "request";
const BRANCH = "master";
const TIMEOUT = 30_000;
const REST = "https://api.github.com";
const HEADERS: Record<string, string> = {
  "User-Agent": "gravekeeper-live-contract-tests",
  Accept: "application/vnd.github+json",
};

async function rest(url: string): Promise<LiveResponse> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`live request failed with HTTP ${res.status}`);
  const bodyText = await res.text();
  let body: unknown = bodyText;
  try {
    body = JSON.parse(bodyText);
  } catch {
    // non-JSON body (raw file)
  }
  return { body, bodyText, headers: res.headers };
}

async function graphql(query: string): Promise<LiveResponse> {
  const token = readGithubToken();
  if (token === null) throw new Error("GITHUB_TOKEN not set");
  const res = await fetch(`${REST}/graphql`, {
    method: "POST",
    headers: { ...HEADERS, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const bodyText = await res.text();
  return { body: JSON.parse(bodyText) as unknown, bodyText, headers: res.headers };
}

describe("GitHub live contract (EF-12 to EF-19)", () => {
  liveRowIt("EF-12", "GET /repos/{o}/{r}", async () => {
    assertRowPaths("EF-12", await rest(`${REST}/repos/${OWNER}/${REPO}`));
  }, TIMEOUT);

  liveRowIt("EF-13", "GET /repos/{o}/{r}/branches/{b}", async () => {
    assertRowPaths("EF-13", await rest(`${REST}/repos/${OWNER}/${REPO}/branches/${BRANCH}`));
  }, TIMEOUT);

  liveRowIt("EF-14", "GET /repos/{o}/{r}/git/trees/{b}?recursive=1", async () => {
    assertRowPaths(
      "EF-14",
      await rest(`${REST}/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`),
    );
  }, TIMEOUT);

  liveRowIt("EF-15", "raw.githubusercontent.com file body", async () => {
    assertRowPaths(
      "EF-15",
      await rest(`https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/package.json`),
    );
  }, TIMEOUT);

  liveRowIt("EF-16", "REST rate limit headers", async () => {
    assertRowPaths("EF-16", await rest(`${REST}/repos/${OWNER}/${REPO}`));
  }, TIMEOUT);

  liveRowIt("EF-17", "GraphQL repository aliases", async () => {
    const q =
      `query { r0: repository(owner: "${OWNER}", name: "${REPO}") { nameWithOwner isArchived isDisabled pushedAt ` +
      `defaultBranchRef { name target { oid ... on Commit { committedDate } } } } }`;
    assertRowPaths("EF-17", await graphql(q));
  }, TIMEOUT);

  liveRowIt("EF-18", "GraphQL rateLimit and headers", async () => {
    const q =
      `query { r0: repository(owner: "${OWNER}", name: "${REPO}") { nameWithOwner } ` +
      `rateLimit { limit remaining used cost resetAt nodeCount } }`;
    assertRowPaths("EF-18", await graphql(q));
  }, TIMEOUT);

  liveRowIt("EF-19", "GraphQL NOT_FOUND error", async () => {
    const q = `query { r0: repository(owner: "gravekeeper-nonexistent-owner-0", name: "no-such-repo-0") { nameWithOwner } }`;
    assertRowPaths("EF-19", await graphql(q));
  }, TIMEOUT);
});
