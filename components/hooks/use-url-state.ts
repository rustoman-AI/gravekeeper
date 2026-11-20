import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { buildUrl, parseUrlState } from '../../view-model/index';
import type { UrlState } from '../../view-model/index';

/** The two router methods the app uses. `next/navigation`'s router satisfies it. */
export interface UrlRouter {
  push(href: string, options?: { scroll?: boolean }): void;
  replace(href: string, options?: { scroll?: boolean }): void;
}

/** The one history method used for changes that must not rescan. */
export interface UrlHistory {
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
}

export interface UrlStateApi {
  /** Parsed from the current query string. Same object while the query string is unchanged. */
  readonly urlState: UrlState;
  /** New scan: adds a history entry (Requirement 3.7). */
  push(next: UrlState): void;
  /** Replaces the entry through the router (used by Cancel, with `{ repo: null, ... }`). */
  replace(next: UrlState): void;
  /** `view` and canonical `repo` changes: window.history.replaceState, no navigation, no history entry (D2). */
  replaceInPlace(next: UrlState): void;
}

/**
 * URL state over an explicit router and query string, so tests inject a fake router and a search
 * string without module mocking. Every URL passed on comes from buildUrl (same-origin path and query).
 */
export function useUrlStateFrom(
  router: UrlRouter,
  search: string,
  history?: UrlHistory,
): UrlStateApi {
  const urlState = useMemo(() => parseUrlState(search), [search]);
  const push = useCallback((next: UrlState) => router.push(buildUrl(next)), [router]);
  const replace = useCallback((next: UrlState) => router.replace(buildUrl(next)), [router]);
  const replaceInPlace = useCallback(
    (next: UrlState) => {
      const target = history ?? window.history;
      target.replaceState(null, '', buildUrl(next));
    },
    [history],
  );
  return useMemo(
    () => ({ urlState, push, replace, replaceInPlace }),
    [urlState, push, replace, replaceInPlace],
  );
}

/** Production wiring: `useRouter` and `useSearchParams` of `next/navigation`. Needs a Suspense boundary above. */
export function useUrlState(): UrlStateApi {
  const router = useRouter();
  const params = useSearchParams();
  return useUrlStateFrom(router, params.toString());
}
