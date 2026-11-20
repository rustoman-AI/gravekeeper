'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { LandingPage } from './landing-page';
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
}

/**
 * The app shell over explicit router, query string, history and scan client, so tests inject fakes.
 * Hooks are called unconditionally; `GraveyardApp` supplies the production values.
 * Placeholders for `scanning`, `result` and `failed` stay until groups 13, 15 and 33 replace them.
 */
export function GraveyardAppView({ router, search, history, client }: GraveyardAppViewProps) {
  const { urlState, push, replaceInPlace } = useUrlStateFrom(router, search, history);
  const onCanonical = useCallback(
    (url: string) => replaceInPlace({ repo: url, manifests: urlState.manifests, view: urlState.view }),
    [replaceInPlace, urlState.manifests, urlState.view],
  );
  const { session } = useScan(urlState, { client, onCanonical });

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
        initialValue={urlState.repo ?? undefined}
        onSubmit={onSubmit}
        onSelectFeatured={onSelectFeatured}
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
