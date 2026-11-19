// Requirement 21.5, 21.6, 21.7, 21.9, 21.13, 3.7, 14.5
import { parseIsoInstant } from '../mapping/day-count';
import type { IsoInstant } from '../mapping';
import type { ScanErrorBody, ScanResult } from '../scan/types';

export type { ScanErrorBody } from '../scan/types';

/** `{ ok: true, ...Scan_Result }` or `{ ok: false, error }`. */
export type ScanResponseBody =
  | ({ readonly ok: true } & Omit<ScanResult, 'ok'>)
  | { readonly ok: false; readonly error: ScanErrorBody };

export type ApiStatus = 200 | 400 | 404 | 405 | 413 | 415 | 500 | 502 | 503 | 504;

export interface ApiResponse {
  readonly status: ApiStatus;
  /** Content-Type, Cache-Control: no-store, and Allow or Retry-After where R21.6 and R21.13 require them. */
  readonly headers: Readonly<Record<string, string>>;
  readonly body: ScanResponseBody;
}

/** HTTP status of a Scan_Error (R21.6). `asOf` decides 503 versus 502 for `upstream-unavailable`. */
export function scanErrorStatus(error: ScanErrorBody, asOf: IsoInstant): ApiStatus {
  switch (error.code) {
    case 'invalid-request':
      switch (error.details.reason) {
        case 'method-not-allowed':
          return 405;
        case 'unsupported-media-type':
          return 415;
        case 'body-too-large':
          return 413;
        default:
          return 400;
      }
    case 'invalid-url':
    case 'too-many-manifests':
      return 400;
    case 'manifest-not-found':
    case 'repo-not-found':
    case 'branch-not-found':
      return 404;
    case 'upstream-unavailable':
      return retryAfterSeconds(error, asOf) === null ? 502 : 503;
    case 'deadline-exceeded':
      return 504;
    case 'internal-error':
      return 500;
  }
}

/** `ceil((resetAt - asOf) / 1000)`, at least 1, when `resetAt` is present and later than `asOf`; else null. */
function retryAfterSeconds(error: ScanErrorBody, asOf: IsoInstant): number | null {
  if (error.code !== 'upstream-unavailable') return null;
  const resetAt = error.details.resetAt;
  if (resetAt === undefined) return null;
  const resetMs = parseIsoInstant(resetAt);
  const asOfMs = parseIsoInstant(asOf);
  if (resetMs === null || asOfMs === null || resetMs <= asOfMs) return null;
  return Math.max(1, Math.ceil((resetMs - asOfMs) / 1000));
}

/** The one place that builds an API response (R21.5, R21.6, R21.7, R21.9, R21.13). */
export function respond(body: ScanResponseBody, asOf: IsoInstant): ApiResponse {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };
  if (body.ok) return { status: 200, headers, body };
  const status = scanErrorStatus(body.error, asOf);
  if (status === 405) headers['Allow'] = 'POST';
  if (status === 503) {
    const seconds = retryAfterSeconds(body.error, asOf);
    if (seconds !== null) headers['Retry-After'] = String(seconds);
  }
  return { status, headers, body };
}
