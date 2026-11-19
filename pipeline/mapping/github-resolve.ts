// Requirement 3.2, 3.3, 3.6, 3.9, 3.10, 3.12
import { BRANCH_MAX_LENGTH } from '../constants';
import { readOwn } from './read-own';
import { err, ok } from './result';
import type { Result } from './result';

export interface RepositoryInfo {
  readonly owner: string;
  readonly repo: string;
  readonly defaultBranch: string;
  readonly private: boolean;
}

const COMMIT_SHA = /^[0-9a-fA-F]{40}$/;

function isObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validBranch(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  // Length is counted in Unicode code points, as the URL parser counts branches.
  // A string of at most BRANCH_MAX_LENGTH UTF-16 units cannot exceed it in code points.
  if (value.length <= BRANCH_MAX_LENGTH) return true;
  return Array.from(value).length <= BRANCH_MAX_LENGTH;
}

/**
 * Reads the repository response (EF-12). A private repository gives
 * `private: true` with empty `owner` and `repo` (the caller maps it to
 * `repo-not-found`). Otherwise `owner` and `repo` are the two parts of
 * `full_name` in GitHub's spelling, and `default_branch` must be valid
 * (a non-empty string of at most BRANCH_MAX_LENGTH code points). Anything else is `invalid`. Never throws.
 */
export function readRepository(body: unknown): Result<RepositoryInfo, 'invalid'> {
  if (!isObject(body)) return err('invalid');
  if (readOwn(body, 'private') === true) {
    return ok({ owner: '', repo: '', defaultBranch: '', private: true });
  }
  const fullName = readOwn(body, 'full_name');
  if (typeof fullName !== 'string') return err('invalid');
  const parts = fullName.split('/');
  if (parts.length !== 2) return err('invalid');
  const [owner, repo] = parts as [string, string];
  if (owner.length === 0 || repo.length === 0) return err('invalid');
  const defaultBranchRaw = readOwn(body, 'default_branch');
  if (!validBranch(defaultBranchRaw)) return err('invalid');
  return ok({ owner, repo, defaultBranch: defaultBranchRaw, private: false });
}

/**
 * Reads `commit.sha` of the branch response (EF-13): exactly 40 hexadecimal
 * characters, otherwise null. Never throws.
 */
export function readCommitSha(body: unknown): string | null {
  if (!isObject(body)) return null;
  const sha = readOwn(readOwn(body, 'commit'), 'sha');
  return typeof sha === 'string' && COMMIT_SHA.test(sha) ? sha : null;
}
