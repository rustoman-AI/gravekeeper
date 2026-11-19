import type { CacheStore, JsonValue } from '../../pipeline/ports/cache';
import type {
  CachePolicy,
  HttpClient,
  HttpRequest,
  RequestContext,
  WorkUnitOutcome,
} from '../../pipeline/ports/http';
import {
  compactCratesOwners,
  compactDepsDevAdvisory,
  compactOsvAdvisory,
} from '../../pipeline/ports/l2-entries';
import { canonicalJson, requestKey } from '../../pipeline/ports/request-key';

// Requirements 19.1, 19.2, 19.3, 19.4, 19.14, 19.17, 19.18, 19.24, 19.27, 15.2

interface CachedResponse {
  readonly status: number;
  readonly bodyText: string;
}

/** Validates a stored value (L2 is outside the process). */
function isCachedResponse(value: unknown): value is CachedResponse {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const status = (value as Record<string, unknown>).status;
  const bodyText = (value as Record<string, unknown>).bodyText;
  if (typeof status !== 'number' || !Number.isInteger(status)) return false;
  if (typeof bodyText !== 'string') return false;
  return status === 404 || (status >= 200 && status <= 299);
}

/** Key of a cached request: the request key plus the policy's extra parts. No header, no token. */
function cacheKey(request: HttpRequest, policy: CachePolicy): string {
  const base = requestKey(request);
  if (policy.extraKey.length === 0) return base;
  return canonicalJson([base, ...policy.extraKey]);
}

/** True when a GraphQL body has no `errors[].type` other than NOT_FOUND. An unreadable body is not stored. */
function hasNoForeignErrors(bodyText: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText) as unknown;
  } catch {
    return false;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const errors = (parsed as Record<string, unknown>).errors;
  if (errors === undefined || errors === null) return true;
  if (!Array.isArray(errors)) return false;
  for (let i = 0; i < errors.length; i += 1) {
    const entry: unknown = errors[i];
    if (entry === null || typeof entry !== 'object') return false;
    if ((entry as Record<string, unknown>).type !== 'NOT_FOUND') return false;
  }
  return true;
}

function compact(kind: NonNullable<CachePolicy['l2Kind']>, bodyText: string): string {
  switch (kind) {
    case 'osv-advisory':
      return compactOsvAdvisory(bodyText);
    case 'depsdev-advisory':
      return compactDepsDevAdvisory(bodyText);
    case 'crates-owners':
      return compactCratesOwners(bodyText);
  }
}

/** Decorates an HttpClient with L1 (and, for l2Kind policies, L2) caching through an injected CacheStore. */
export class CachingHttpClient implements HttpClient {
  constructor(
    private readonly inner: HttpClient,
    private readonly store: CacheStore,
  ) {}

  async execute(request: HttpRequest, context: RequestContext): Promise<WorkUnitOutcome> {
    const policy = request.cache;
    if (policy === null) return this.inner.execute(request, context);

    const key = cacheKey(request, policy);

    const hit = await this.read(key, policy, context);
    if (hit !== null) return hit;

    const outcome = await this.inner.execute(request, context);
    await this.write(key, policy, outcome);
    return outcome;
  }

  private async read(
    key: string,
    policy: CachePolicy,
    context: RequestContext,
  ): Promise<WorkUnitOutcome | null> {
    try {
      const entry = await this.store.get(key, { signal: context.signal, l2Kind: policy.l2Kind });
      if (entry === null || !isCachedResponse(entry.value)) return null;
      const { status, bodyText } = entry.value;
      // An OSV advisory 404 is never stored; a stored 404 there is not trusted.
      if (status === 404) {
        if (policy.l2Kind === 'osv-advisory') return null;
        return { kind: 'absent', status: 404, headers: {}, attempts: 0, fromCache: true };
      }
      return { kind: 'ok', status, bodyText, headers: {}, attempts: 0, fromCache: true };
    } catch {
      return null;
    }
  }

  private async write(key: string, policy: CachePolicy, outcome: WorkUnitOutcome): Promise<void> {
    let value: CachedResponse;
    if (outcome.kind === 'ok') {
      if (outcome.status < 200 || outcome.status > 299) return;
      if (policy.storeWhen === 'graphql-no-foreign-errors' && !hasNoForeignErrors(outcome.bodyText)) {
        return;
      }
      const bodyText =
        policy.l2Kind === null ? outcome.bodyText : compact(policy.l2Kind, outcome.bodyText);
      value = { status: outcome.status, bodyText };
    } else if (outcome.kind === 'absent') {
      if (policy.l2Kind === 'osv-advisory') return;
      value = { status: 404, bodyText: '' };
    } else {
      return;
    }
    try {
      await this.store.set(key, value as unknown as JsonValue, policy.ttlSeconds, {
        l2Kind: policy.l2Kind,
      });
    } catch {
      // A failing store never fails the Work_Unit.
    }
  }
}
