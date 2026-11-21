// Requirement 20.5, 20.14, 20.15, 20.16, 21.5
// The message table of the requirements section "User-facing messages". Every Scan_Note and
// Scan_Error message is rendered here and nowhere else. Texts are fixed templates: the only
// interpolated values are the `details` of the note or error and, for `invalid-url` `host`,
// the Web_Host from validated configuration.
import { API_URL_MESSAGE, GRAPHQL_HOST_MESSAGE, GRAPHQL_URL_MESSAGE } from '../config/config-messages';
import type { JsonValue } from '../ports/cache';
import type { NoteCode, ScanErrorBody } from './types';

export type ErrorCode = ScanErrorBody['code'];
export type InvalidUrlPartKey = 'url' | 'host' | 'path' | 'owner' | 'repository' | 'branch';
export type InvalidRequestReason =
  | 'invalid-json'
  | 'invalid-type'
  | 'unknown-field'
  | 'missing-field'
  | 'too-many-items'
  | 'branch-conflict'
  | 'body-too-large'
  | 'unsupported-media-type'
  | 'method-not-allowed';

/** Placeholder in the `host` row of `invalid-url`. */
export const WEB_HOST_PLACEHOLDER = '<web host>';

/** One row per Scan_Note code. */
export const NOTE_MESSAGES: { readonly [C in NoteCode]: string } = {
  'tree-truncated':
    'GitHub returned a partial file tree for this repository, so the manifest list may be incomplete.',
  'no-manifests':
    'No package.json, requirements.txt, pyproject.toml or Cargo.toml was found in this repository.',
  'no-root-manifest':
    'No manifest was found at the repository root. Choose one of the manifests found in subfolders.',
  'manifest-too-large': 'The manifest {path} is too large to read and was skipped.',
  'manifest-fetch-failed': 'The manifest {path} could not be downloaded and was skipped.',
  'pin-not-found':
    '{name} is pinned to {pinned}, which the registry does not list. The latest release was checked instead.',
  'no-default-version':
    'The registry lists no current release for {name}, so its release facts are unknown.',
  'conflicting-pins':
    '{name} is pinned to different versions in different manifests ({pins}). The latest release was checked instead.',
  'package-not-found': '{name} was not found in the {ecosystem} registry.',
  'batch-fallback': 'The deps.dev batch lookup failed, so packages were looked up one at a time.',
  'source-repo-unverified':
    '{name} links to the repository {sourceRepo}. This link comes from package metadata and is not verified.',
  'informational-advisory-excluded':
    '{name} has informational advisories ({ids}) that are not counted as vulnerabilities.',
  'advisory-details-incomplete':
    'Details for some advisories of {name} could not be loaded, so its highest severity may be understated.',
  'osv-pagination-ignored':
    'OSV listed more advisories for {name} than could be loaded in time. Its vulnerability count may be incomplete.',
  'github-token-missing':
    "No GitHub token is configured. Archived status and last-commit dates are unknown, and repository lookups use GitHub's lower unauthenticated rate limit.",
  'github-budget-low':
    'The GitHub API rate limit was nearly used up, so some archived and last-commit facts are unknown.',
  'maintainers-lower-bound':
    '{name} is also owned by teams on crates.io, so its maintainer count is a lower bound.',
  'dependency-cap-exceeded':
    'This repository has {total} packages. Only the first {limit} were checked; the rest are listed as not checked.',
  'scan-deadline-reached': 'The scan ran out of time. Facts that were not loaded are unknown.',
  'source-partial': '{source} answered only some requests. Some facts that depend on it are unknown.',
  'source-failed': 'A source did not answer. Facts that depend on it are unknown.',
  'unmaintained-advisory':
    '{name} has a RustSec advisory ({ids}) saying it is unmaintained, so it is treated as deprecated.',
  'range-unresolved':
    'The version range declared for {name} could not be matched to a published release, so the latest release was checked instead.',
};

/** One row per `invalid-url` part. */
export const INVALID_URL_MESSAGES: { readonly [P in InvalidUrlPartKey]: string } = {
  url: 'The URL must look like https://<host>/<owner>/<repo>, without user information, port or unsupported query parameters.',
  host: 'Only repositories on <web host> are accepted.',
  path: 'The path must be /<owner>/<repo> or /<owner>/<repo>/tree/<branch>, with at most one trailing slash.',
  owner: 'The owner is not a valid GitHub user or organization name.',
  repository: 'The repository is not a valid GitHub repository name.',
  branch: 'The branch is not a valid Git branch name.',
};

/** `invalid-url` `url` row used when the parser failed unexpectedly (R1.14). */
export const INVALID_URL_UNREADABLE_MESSAGE = 'The URL could not be read.';

/** One row per `invalid-request` reason. */
export const INVALID_REQUEST_MESSAGES: { readonly [R in InvalidRequestReason]: string } = {
  'invalid-json': 'The request is not valid: the body is not valid JSON.',
  'invalid-type': 'The request is not valid: a field has the wrong type.',
  'unknown-field': 'The request is not valid: the body contains a field that is not accepted.',
  'missing-field': 'The request is not valid: a required field is missing.',
  'too-many-items': 'The request is not valid: the manifests list has too many items.',
  'branch-conflict':
    'The request is not valid: the URL and the branch field name different branches.',
  'body-too-large': 'The request is not valid: the request body is too large.',
  'unsupported-media-type': 'The request is not valid: the content type must be application/json.',
  'method-not-allowed': 'The request is not valid: the method must be POST.',
};

/** The generic `internal-error` message (any cause other than the three configuration ones). */
export const INTERNAL_ERROR_MESSAGE = 'Something went wrong on our side. Try again in a minute.';

/** The three `internal-error` configuration messages, in table order. */
export const CONFIG_INTERNAL_ERROR_MESSAGES: readonly string[] = [
  API_URL_MESSAGE,
  GRAPHQL_URL_MESSAGE,
  GRAPHQL_HOST_MESSAGE,
];

/** Error codes whose message is a single row (no part or reason selects it). */
export const SIMPLE_ERROR_MESSAGES = {
  'repo-not-found': 'This repository does not exist or is not public.',
  'branch-not-found': 'The branch {branch} does not exist in this repository.',
  'too-many-manifests': 'Choose at most {limit} manifests per scan.',
  'manifest-not-found': 'The manifest {path} was not found in this repository.',
  'upstream-unavailable':
    'GitHub could not be reached, so the repository could not be read. Try again in a minute.',
  'deadline-exceeded': 'The repository could not be read in time. Try again in a minute.',
  'internal-error': INTERNAL_ERROR_MESSAGE,
} as const;

/** Every Scan_Note code, in the order of the Scan_Note codes table. */
export const NOTE_CODES: readonly NoteCode[] = Object.keys(NOTE_MESSAGES) as NoteCode[];

/** Every Scan_Error code. */
export const ERROR_CODES: readonly ErrorCode[] = [
  'invalid-request',
  'invalid-url',
  'repo-not-found',
  'branch-not-found',
  'too-many-manifests',
  'manifest-not-found',
  'upstream-unavailable',
  'deadline-exceeded',
  'internal-error',
];

export type MessageDetails = { readonly [key: string]: JsonValue | undefined };

const PLACEHOLDER = /\{([A-Za-z]+)\}/g;

/** Placeholder keys of a template, in order of appearance. */
export function placeholdersOf(template: string): readonly string[] {
  return [...template.matchAll(PLACEHOLDER)].map((m) => m[1] as string);
}

function renderValue(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map((v) => renderValue(v)).join(', ');
  if (typeof value === 'object') return '';
  return String(value);
}

/** Replaces each `{key}` with the value of that exact `details` key (lists joined by ", "). */
export function renderTemplate(template: string, details: MessageDetails | undefined): string {
  return template.replace(PLACEHOLDER, (_all, key: string) => renderValue(details?.[key]));
}

/** R20.14: the message of a Scan_Note. */
export function renderNoteMessage(code: NoteCode, details?: MessageDetails): string {
  return renderTemplate(NOTE_MESSAGES[code], details);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * R20.15: the message of a Scan_Error. Total: an unknown `part` or `reason` falls back to the
 * `url` row and to the `invalid-type` row. `webHost` comes from validated configuration.
 * `internal-error` always renders the generic message; the three configuration messages are
 * produced by `readGithubConfig` from the same constants.
 */
export function renderErrorMessage(
  code: ErrorCode,
  details: MessageDetails | undefined,
  webHost: string,
): string {
  switch (code) {
    case 'invalid-url': {
      const part = isRecord(details) ? details['part'] : undefined;
      const key: InvalidUrlPartKey =
        typeof part === 'string' && Object.hasOwn(INVALID_URL_MESSAGES, part)
          ? (part as InvalidUrlPartKey)
          : 'url';
      return INVALID_URL_MESSAGES[key].replace(WEB_HOST_PLACEHOLDER, () => webHost);
    }
    case 'invalid-request': {
      const reason = isRecord(details) ? details['reason'] : undefined;
      const key: InvalidRequestReason =
        typeof reason === 'string' && Object.hasOwn(INVALID_REQUEST_MESSAGES, reason)
          ? (reason as InvalidRequestReason)
          : 'invalid-type';
      return INVALID_REQUEST_MESSAGES[key];
    }
    default:
      return renderTemplate(SIMPLE_ERROR_MESSAGES[code], details);
  }
}
