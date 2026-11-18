import type { RepoRef } from './parse-repo-url';

const UNRESERVED = /^[A-Za-z0-9\-._/]$/;

// Requirement 1.11
function encodeBranch(branch: string): string {
  let out = '';
  for (const char of branch) {
    out += UNRESERVED.test(char) ? char : encodeURIComponent(char).replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  }
  return out;
}

// Requirement 1.11
/** Canonical_Repo_URL: https, no www, no .git, no trailing slash, branch percent-encoded as UTF-8. */
export function formatRepoUrl(ref: RepoRef): string {
  const base = `https://${ref.host}/${ref.owner}/${ref.repo}`;
  return ref.branch === null ? base : `${base}/tree/${encodeBranch(ref.branch)}`;
}

