'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { LandingPage } from './landing-page';
import { ResultsPage } from './results-page';
import type { ViewName } from './view-toggle';
import { ScanningScreen } from './scanning-screen';
import type { ScanningScreenProps } from './scanning-screen';
import { useScan } from './hooks/use-scan';
import type { ScanRunner } from './hooks/use-scan';
import { useUrlStateFrom } from './hooks/use-url-state';
import type { UrlHistory, UrlRouter } from './hooks/use-url-state';

export interface GraveyardAppViewProps {
  readonly router: UrlRouter;
  /** The query string without a leading `?`. */
  readonly search: string;
  readonly history?: UrlHistory;
  readonly client?: ScanRunner;
  /** Clock for the cache note, read once per result. Defaults to `Date.now`. */
  readonly now?: () => number;
  /** Clock and timer injection forwarded to `ScanningScreen`, for tests. */
  readonly scanningClock?: Pick<
    ScanningScreenProps,
    'now' | 'setInterval' | 'clearInterval' | 'reducedMotion'
  >;
}

/**
 * The app shell over explicit router, query string, history and scan client, so tests inject fakes.
 * Hooks are called unconditionally; `GraveyardApp` supplies the production values.
 * Placeholders for `scanning`, `result` and `failed` stay until groups 13, 15 and 33 replace them.
 */
export function GraveyardAppView({
  router,
  search,
  history,
  client,
  scanningClock,
  now: nowFn = Date.now,
}: GraveyardAppViewProps) {
  const { urlState, push, replace, replaceInPlace } = useUrlStateFrom(router, search, history);
  // The browser clock, read once when a result arrives (components below the shell never read it).
  const [arrivalMs, setArrivalMs] = useState(0);
  const onCanonical = useCallback(
    (url: string) => {
      setArrivalMs(nowFn());
      replaceInPlace({ repo: url, manifests: urlState.manifests, view: urlState.view });
    },
    [replaceInPlace, urlState.manifests, urlState.view, nowFn],
  );
  const { session } = useScan(urlState, { client, onCanonical });

  // The browser clock, taken once per arriving result (components below the shell never read it).

  // The view toggle writes `view` in place (D2). The override covers a query string that has not caught up.
  const [viewOverride, setViewOverride] = useState<{ readonly base: ViewName; readonly value: ViewName } | null>(
    null,
  );
  const view = viewOverride !== null && viewOverride.base === urlState.view ? viewOverride.value : urlState.view;
  const onViewChange = useCallback(
    (next: ViewName) => {
      setViewOverride({ base: urlState.view, value: next });
      replaceInPlace({ repo: urlState.repo, manifests: urlState.manifests, view: next });
    },
    [replaceInPlace, urlState.repo, urlState.manifests, urlState.view],
  );

  // Set by Cancel: the landing page then shows the last value and focuses the input.
  const [cancelled, setCancelled] = useState<{ readonly repo: string | null } | null>(null);
  const onCancel = useCallback(() => {
    setCancelled({ repo: urlState.repo });
    // repo becomes null, so use-scan's effect cleanup aborts the in-flight request.
    replace({ repo: null, manifests: [], view: urlState.view });
  }, [replace, urlState.repo, urlState.view]);

  const onSubmit = useCallback(
    (value: string) => push({ repo: value, manifests: [], view: 'scene' }),
    [push],
  );
  const onSelectFeatured = useCallback(
    (repoUrl: string) => push({ repo: repoUrl, manifests: [], view: 'scene' }),
    [push],
  );

  if (session.phase === 'idle') {
    return (
      <LandingPage
        initialValue={urlState.repo ?? cancelled?.repo ?? undefined}
        focusOnMount={cancelled !== null}
        onSubmit={onSubmit}
        onSelectFeatured={onSelectFeatured}
      />
    );
  }
  if (session.phase === 'scanning') {
    return (
      <ScanningScreen
        startedAtMs={session.startedAtMs}
        repoLabel={urlState.repo ?? undefined}
        onCancel={onCancel}
        {...scanningClock}
      />
    );
  }
  if (session.phase === 'result') {
    return (
      <ResultsPage
        result={session.result}
        cache={session.cache}
        nowMs={arrivalMs}
        view={view}
        onViewChange={onViewChange}
      />
    );
  }
  return <p className="px-4 py-8 text-bone">Scanning</p>;
}

/** Production shell: `next/navigation` router and query string. Needs a Suspense boundary above. */
export function GraveyardApp() {
  const router = useRouter();
  const params = useSearchParams();
  return <GraveyardAppView router={router} search={params.toString()} />;
}
