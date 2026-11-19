// Requirement 21.2, 21.3, 21.4, 21.15
/**
 * Request validation of the Scan_Route: media type (R21.3 a), JSON parse (R21.3 c), the field
 * checks of R21.2 in the order of R21.3 (d) to (h), and the branch conflict (R21.4).
 *
 * The branch conflict needs the branch of the parsed `repoUrl`, which the caller only has after
 * the config and URL checks, so `findBranchConflict` is a separate step the handler runs then.
 * Every function is total and returns a `Scan_Error` body instead of throwing.
 */
import { DISCOVERY_MAX_MANIFESTS } from '../constants';
import { err, ok } from '../internal/result';
import type { Result } from '../internal/result';
import { readOwn } from '../mapping/read-own';
import { renderErrorMessage } from '../scan/messages';
import type { ScanErrorBody } from '../scan/types';

export type InvalidRequestError = Extract<ScanErrorBody, { readonly code: 'invalid-request' }>;
type Details = InvalidRequestError['details'];

/** A request body that passed R21.2. `branch` and `manifests` are `undefined` when absent. */
export interface ValidRequestBody {
  readonly repoUrl: string;
  readonly branch: string | undefined;
  readonly manifests: readonly string[] | undefined;
}

const ALLOWED_KEYS: ReadonlySet<string> = new Set(['repoUrl', 'branch', 'manifests']);

function invalid(details: Details): InvalidRequestError {
  // The invalid-request rows do not use the web host.
  return {
    code: 'invalid-request',
    message: renderErrorMessage('invalid-request', details, ''),
    details,
  };
}

/** R21.3 (a): the media type is the text before the first `;`, trimmed, compared case-insensitively. */
export function checkMediaType(contentType: string | null | undefined): Result<null, InvalidRequestError> {
  if (typeof contentType !== 'string') return err(invalid({ reason: 'unsupported-media-type' }));
  const semicolon = contentType.indexOf(';');
  const mediaType = (semicolon === -1 ? contentType : contentType.slice(0, semicolon)).trim();
  return mediaType.toLowerCase() === 'application/json'
    ? ok(null)
    : err(invalid({ reason: 'unsupported-media-type' }));
}

/** R21.3 (c) to (h): parses the body text and checks the fields. */
export function validateRequestBody(text: string): Result<ValidRequestBody, InvalidRequestError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return err(invalid({ reason: 'invalid-json' }));
  }

  // (d) / R21.2 (a): a JSON object.
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return err(invalid({ reason: 'invalid-type', field: 'body' }));
  }

  // (e) / R21.2 (b): own keys only. The key name is not echoed.
  for (const key of Object.keys(parsed)) {
    if (!ALLOWED_KEYS.has(key)) return err(invalid({ reason: 'unknown-field', field: 'body' }));
  }

  const repoUrl = readOwn(parsed, 'repoUrl');
  const branch = readOwn(parsed, 'branch');
  const manifests = readOwn(parsed, 'manifests');
  const hasBranch = Object.hasOwn(parsed, 'branch');
  const hasManifests = Object.hasOwn(parsed, 'manifests');

  // (f) repoUrl absent.
  if (!Object.hasOwn(parsed, 'repoUrl')) {
    return err(invalid({ reason: 'missing-field', field: 'repoUrl' }));
  }

  // (g) wrong types, first offending field in the order repoUrl, branch, manifests.
  if (typeof repoUrl !== 'string') return err(invalid({ reason: 'invalid-type', field: 'repoUrl' }));
  if (hasBranch && typeof branch !== 'string') {
    return err(invalid({ reason: 'invalid-type', field: 'branch' }));
  }
  if (hasManifests) {
    if (!Array.isArray(manifests) || !manifests.every((item: unknown) => typeof item === 'string')) {
      return err(invalid({ reason: 'invalid-type', field: 'manifests' }));
    }
  }

  // (h) too many manifests (duplicates count).
  if (hasManifests && (manifests as readonly string[]).length > DISCOVERY_MAX_MANIFESTS) {
    return err(invalid({ reason: 'too-many-items', field: 'manifests' }));
  }

  return ok({
    repoUrl,
    branch: hasBranch ? (branch as string) : undefined,
    manifests: hasManifests ? [...(manifests as readonly string[])] : undefined,
  });
}

/**
 * R21.4, R21.15: when the body `branch` and the percent-decoded URL branch are both present and
 * differ as strings (case-sensitive), the `branch-conflict` error; else `null`. The message
 * names neither branch.
 */
export function findBranchConflict(
  bodyBranch: string | undefined,
  urlBranch: string | null,
): InvalidRequestError | null {
  if (bodyBranch === undefined || urlBranch === null) return null;
  return bodyBranch === urlBranch ? null : invalid({ reason: 'branch-conflict', field: 'branch' });
}
