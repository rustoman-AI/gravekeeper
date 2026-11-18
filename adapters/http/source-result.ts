import type { WorkUnitOutcome } from "../../pipeline/ports/http";
import type { SourceResult } from "../../pipeline/ports/github-source";

// Requirement 15.15, 17.6, 4.11, 3.10

/** Result for raw text endpoints (manifest text). The body is never parsed. */
export type TextResult = SourceResult<string>;

/**
 * Converts a Work_Unit outcome to a SourceResult. A 2xx body that is not JSON
 * gives `unparsable`. `JSON.parse` creates `__proto__` as an own data property,
 * so no prototype is touched; mappers read own keys only. Never throws.
 * Headers are passed through unchanged (the client already applied the allow-list).
 */
export function toSourceResult(outcome: WorkUnitOutcome): SourceResult {
  switch (outcome.kind) {
    case "ok": {
      let body: unknown;
      try {
        body = JSON.parse(outcome.bodyText);
      } catch {
        return { kind: "unparsable", status: outcome.status, headers: outcome.headers };
      }
      return {
        kind: "ok",
        status: outcome.status,
        body,
        headers: outcome.headers,
        fromCache: outcome.fromCache,
      };
    }
    case "absent":
      return { kind: "absent", headers: outcome.headers, fromCache: outcome.fromCache };
    case "failed":
      return failed(outcome);
  }
}

/** Same mapping for text bodies: `ok` carries the body text as is, never `unparsable`. */
export function toTextResult(outcome: WorkUnitOutcome): TextResult {
  switch (outcome.kind) {
    case "ok":
      return {
        kind: "ok",
        status: outcome.status,
        body: outcome.bodyText,
        headers: outcome.headers,
        fromCache: outcome.fromCache,
      };
    case "absent":
      return { kind: "absent", headers: outcome.headers, fromCache: outcome.fromCache };
    case "failed":
      return failed(outcome);
  }
}

function failed(outcome: Extract<WorkUnitOutcome, { kind: "failed" }>): {
  readonly kind: "failed";
  readonly reason: typeof outcome.reason;
  readonly status: number | null;
  readonly headers: typeof outcome.headers;
} {
  return {
    kind: "failed",
    reason: outcome.reason,
    status: outcome.status,
    headers: outcome.headers,
  };
}
