'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { buildErrorModel } from '@/view-model';
import type { ErrorActionId } from '@/view-model';
import { ErrorScreen } from './error-screen';
import { LandingPage } from './landing-page';
import { ResultsPage } from './results-page';
import type { ViewName } from './view-toggle';
import { markModelReady } from './scene-perf';
import { SceneSprites } from './scene-sprites';
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
function GraveyardAppBody({
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
      // Runs right after the result dispatch, before React renders the scene.
      markModelReady();
      setArrivalMs(nowFn());
      replaceInPlace({ repo: url, manifests: urlState.manifests, view: urlState.view });
    },
    [replaceInPlace, urlState.manifests, urlState.view, nowFn],
  );
  const { session, rescan } = useScan(urlState, { client, onCanonical });

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

  // The picker model already built the URL: one history entry, a new scan for the chosen manifests.
  const onScanManifests = useCallback((url: string) => router.push(url), [router]);

  const onErrorAction = useCallback(
    (actionId: ErrorActionId, payload?: string) => {
      switch (actionId) {
        case 'edit-url':
          if (payload !== undefined) push({ repo: payload, manifests: [], view: urlState.view });
          return;
        case 'retry':
          rescan();
          return;
        case 'scan-default-branch':
        case 'scan-root':
        case 'scan-selected':
          if (payload !== undefined) router.push(payload);
          return;
        case 'back-to-gate':
          return; // the BackToGate link navigates to `/`, which makes the session idle
      }
    },
    [push, rescan, router, urlState.view],
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
        onScanManifests={onScanManifests}
      />
    );
  }
  const repoValue = urlState.repo ?? '';
  const { outcome } = session;
  const model = buildErrorModel(
    outcome.kind === 'error'
      ? {
          kind: 'api',
          status: outcome.status,
          error: outcome.error,
          retryAfterSeconds: outcome.retryAfterSeconds,
          submittedValue: repoValue,
          repoValue,
          selectedManifests: urlState.manifests,
        }
      : { kind: 'client', failure: outcome.failure.kind, submittedValue: repoValue },
  );
  return (
    <ErrorScreen
      key={`${session.requestKey}@${String(session.arrivedAtMs)}`}
      model={model}
      arrivedAtMs={session.arrivedAtMs}
      initialRepoValue={repoValue}
      onAction={onErrorAction}
    />
  );
}

/** The app shell. The sprite sheet mounts once here, so pages never re-render its SVG nodes. */
export function GraveyardAppView(props: GraveyardAppViewProps) {
  return (
    <>
      <SceneSprites />
      <GraveyardAppBody {...props} />
    </>
  );
}

/** Production shell: `next/navigation` router and query string. Needs a Suspense boundary above. */
export function GraveyardApp() {
  const router = useRouter();
  const params = useSearchParams();
  return <GraveyardAppView router={router} search={params.toString()} />;
}
