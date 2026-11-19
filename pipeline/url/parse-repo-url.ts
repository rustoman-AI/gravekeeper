import {
  BRANCH_MAX_LENGTH,
  OWNER_MAX_LENGTH,
  REPO_NAME_MAX_LENGTH,
  REPO_URL_MAX_LENGTH,
  URL_IGNORED_QUERY_PARAMS,
} from '../constants';
import { err, ok } from '../internal/result';
import type { Result } from '../internal/result';
import { guard } from '../internal/safe';

// Requirement 1.1
export interface RepoRef {
  readonly host: string;
  readonly owner: string;
  readonly repo: string;
  readonly branch: string | null;
}

// Requirement 1.5 to 1.10
export type InvalidUrlPart = 'url' | 'host' | 'path' | 'owner' | 'repository' | 'branch';

export interface InvalidUrlError {
  readonly code: 'invalid-url';
  readonly message: string;
  readonly details: { readonly part: InvalidUrlPart };
}

const WHITE_SPACE = /\p{White_Space}/u;
const CONTROL = /[\u0000-\u001f\u007f]/;
const SCHEME = /^([A-Za-z][A-Za-z0-9+.-]*):\/\//;
const OWNER = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
const REPO = /^[A-Za-z0-9._-]+$/;
const BAD_PERCENT = /%(?![0-9A-Fa-f]{2})/;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const BRANCH_FORBIDDEN = /[\u0000-\u001f\u007f ~^:?*[\\]/;

const codePointLength = (text: string): number => Array.from(text).length;

function fail(part: InvalidUrlPart, message: string): Result<never, InvalidUrlError> {
  return err({ code: 'invalid-url', message, details: { part } });
}

// Requirement 1.7
function urlPartInvalid(trimmed: string, rest: string, scheme: string | null): boolean {
  if (trimmed.length === 0 || codePointLength(trimmed) > REPO_URL_MAX_LENGTH) return true;
  if (WHITE_SPACE.test(trimmed) || CONTROL.test(trimmed)) return true;
  if (scheme !== null && scheme !== 'http' && scheme !== 'https') return true;
  const end = rest.search(/[/?#]/);
  const authority = end < 0 ? rest : rest.slice(0, end);
  if (authority.includes('@') || authority.includes(':')) return true;
  return false;
}

// Requirement 1.4, 1.7
function queryInvalid(query: string): boolean {
  if (query.length === 0) return false;
  return query.split('&').some((item) => {
    const eq = item.indexOf('=');
    const name = eq < 0 ? item : item.slice(0, eq);
    return !URL_IGNORED_QUERY_PARAMS.includes(name);
  });
}

// Requirement 1.2, 1.10
function decodeBranch(raw: string): string | null {
  if (BAD_PERCENT.test(raw)) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

// Requirement 1.10
function branchValid(branch: string): boolean {
  if (LONE_SURROGATE.test(branch)) return false;
  if (codePointLength(branch) > BRANCH_MAX_LENGTH) return false;
  if (BRANCH_FORBIDDEN.test(branch)) return false;
  if (branch.includes('..') || branch.includes('@{') || branch.includes('//')) return false;
  if (branch.startsWith('-') || branch.startsWith('/')) return false;
  if (branch.endsWith('/') || branch.endsWith('.') || branch.endsWith('.lock')) return false;
  return true;
}

// Requirement 1.10, 21.14 (c)
/** The branch rules applied to a branch as given (no percent-decoding), at least 1 code point. */
export function isValidBranchName(branch: string): boolean {
  return typeof branch === 'string' && branch.length > 0 && branchValid(branch);
}

function parse(input: unknown, webHost: string): Result<RepoRef, InvalidUrlError> {
  const urlMessage =
    'The URL must look like https://<host>/<owner>/<repo>, without user information, port or unsupported query parameters.';
  if (typeof input !== 'string') return fail('url', urlMessage);
  // Requirement 1.1
  const trimmed = input.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, '');
  const schemeMatch = SCHEME.exec(trimmed);
  const scheme = schemeMatch === null ? null : (schemeMatch[1] as string).toLowerCase();
  const rest = schemeMatch === null ? trimmed : trimmed.slice(schemeMatch[0].length);
  if (urlPartInvalid(trimmed, rest, scheme)) return fail('url', urlMessage);

  const hashAt = rest.indexOf('#');
  const noFragment = hashAt < 0 ? rest : rest.slice(0, hashAt);
  const queryAt = noFragment.indexOf('?');
  const query = queryAt < 0 ? '' : noFragment.slice(queryAt + 1);
  const beforeQuery = queryAt < 0 ? noFragment : noFragment.slice(0, queryAt);
  if (queryInvalid(query)) return fail('url', urlMessage);

  // Requirement 1.3, 1.5
  const slashAt = beforeQuery.indexOf('/');
  const authority = (slashAt < 0 ? beforeQuery : beforeQuery.slice(0, slashAt)).toLowerCase();
  const path = slashAt < 0 ? '' : beforeQuery.slice(slashAt);
  const host = authority.startsWith('www.') ? authority.slice(4) : authority;
  if (host !== webHost.toLowerCase()) {
    return fail('host', `Only repositories on ${webHost} are accepted.`);
  }

  // Requirement 1.6
  const pathMessage =
    'The path must be /<owner>/<repo> or /<owner>/<repo>/tree/<branch>, with at most one trailing slash.';
  if (!path.startsWith('/')) return fail('path', pathMessage);
  const segments = path.slice(1).split('/');
  if (segments.length > 0 && segments[segments.length - 1] === '') segments.pop();
  const shapeOk =
    segments.every((s) => s.length > 0) &&
    (segments.length === 2 || (segments.length >= 4 && segments[2] === 'tree'));
  if (!shapeOk) return fail('path', pathMessage);

  // Requirement 1.8
  const owner = segments[0] as string;
  if (owner.length > OWNER_MAX_LENGTH || !OWNER.test(owner)) {
    return fail('owner', 'The owner is not a valid GitHub user or organization name.');
  }

  // Requirement 1.9
  const rawRepo = segments[1] as string;
  const repo = rawRepo.endsWith('.git') ? rawRepo.slice(0, -4) : rawRepo;
  if (
    repo.length === 0 ||
    repo.length > REPO_NAME_MAX_LENGTH ||
    !REPO.test(repo) ||
    repo === '.' ||
    repo === '..' ||
    repo.endsWith('.git')
  ) {
    return fail('repository', 'The repository is not a valid GitHub repository name.');
  }

  if (segments.length === 2) return ok({ host: webHost.toLowerCase(), owner, repo, branch: null });

  // Requirement 1.2, 1.10
  const branch = decodeBranch(segments.slice(3).join('/'));
  if (branch === null || !branchValid(branch)) {
    return fail('branch', 'The branch is not a valid Git branch name.');
  }
  return ok({ host: webHost.toLowerCase(), owner, repo, branch });
}

// Requirement 1.1 to 1.10, 1.14, 1.16, 2.5
/** Total: never throws, never puts the input in a message. Error order: 7, 5, 6, 8, 9, 10. */
export function parseRepoUrl(input: string, webHost: string): Result<RepoRef, InvalidUrlError> {
  return guard(
    () => parse(input, webHost),
    () => fail('url', 'The URL could not be read.'),
  );
}
