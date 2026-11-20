'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { LandingPage } from './landing-page';
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
}: GraveyardAppViewProps) {
  const { urlState, push, replace, replaceInPlace } = useUrlStateFrom(router, search, history);
  const onCanonical = useCallback(
    (url: string) => replaceInPlace({ repo: url, manifests: urlState.manifests, view: urlState.view }),
    [replaceInPlace, urlState.manifests, urlState.view],
  );
  const { session } = useScan(urlState, { client, onCanonical });

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
  return <p className="px-4 py-8 text-bone">Scanning</p>;
}

/** Production shell: `next/navigation` router and query string. Needs a Suspense boundary above. */
export function GraveyardApp() {
  const router = useRouter();
  const params = useSearchParams();
  return <GraveyardAppView router={router} search={params.toString()} />;
}
