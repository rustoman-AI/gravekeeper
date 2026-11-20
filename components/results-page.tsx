'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildDetailModel,
  buildHeaderModel,
  buildPackageRows,
  buildSceneModel,
  columnsFor,
  sceneHeight,
} from '../view-model/index';
import dynamic from 'next/dynamic';
import type { CacheStatus, PackageKeyString, ParsedScanResult } from '../view-model/index';
import { useContainerWidth } from './hooks/use-container-width';
import { LazyDetailPanel } from './lazy-detail-panel';
import { ResultsHeader } from './results-header';
import { Scene } from './scene';
import { SceneSprites } from './scene-sprites';
import { VIEW_TOGGLE_ID, ViewToggle } from './view-toggle';
import type { ViewName } from './view-toggle';

export interface ResultsPageProps {
  result: ParsedScanResult;
  cache: CacheStatus;
  /** Browser clock in ms, taken once when the result arrived. */
  nowMs: number;
  view: ViewName;
  onViewChange: (view: ViewName) => void;
}

// Loaded only when the list view is chosen (Requirements 16.7, 17.7).
const ListView = dynamic(() => import('./list-view').then((mod) => mod.ListView), {
  loading: () => <p className="text-bone">Loading...</p>,
});

/** Requirements 3.4, 3.5, 8.3, 17.3, 17.5, 18.1: header, view toggle and the Scene. */
export function ResultsPage({ result, cache, nowMs, view, onViewChange }: ResultsPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useContainerWidth(containerRef);
  const columns = columnsFor(width);

  const rows = useMemo(() => buildPackageRows(result), [result]);
  const header = useMemo(() => buildHeaderModel(result, rows), [result, rows]);
  const scene = useMemo(() => buildSceneModel(rows, columns), [rows, columns]);
  // Reserved before any plot renders, so the page does not shift (Requirement 17.3).
  const reserved = sceneHeight(rows.length, columns);

  // The open package, paired with the result it was opened on so a new result closes the panel.
  const [open, setOpen] = useState<{ readonly result: ParsedScanResult; readonly key: PackageKeyString } | null>(
    null,
  );
  const openKey = open !== null && open.result === result ? open.key : null;
  const detail = useMemo(
    () => (openKey === null ? null : buildDetailModel(result, rows, openKey)),
    [result, rows, openKey],
  );

  // Stable identity: opening the panel must not re-render the memoized Scene plots (Requirement 17.5).
  // Rows are in scene order, so the plot index is the row index. Refs avoid changing dependencies.
  const rowsRef = useRef(rows);
  const resultRef = useRef(result);
  useEffect(() => {
    rowsRef.current = rows;
    resultRef.current = result;
  });
  const onOpenIndex = useCallback((index: number) => {
    const row = rowsRef.current[index];
    if (row !== undefined) setOpen({ result: resultRef.current, key: row.key });
  }, []);
  const onOpenKey = useCallback((key: PackageKeyString) => setOpen({ result: resultRef.current, key }), []);
  const onClose = useCallback(() => setOpen(null), []);

  // Focus moves to the page heading when results appear.
  useEffect(() => {
    document.getElementById('results-heading')?.focus();
  }, [result]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <SceneSprites />
      <ResultsHeader header={header} cache={cache} nowMs={nowMs} />
      <ViewToggle view={view} onChange={onViewChange} />
      <div ref={containerRef} style={{ minHeight: reserved }}>
        {view === 'scene' ? (
          <Scene scene={scene} onOpen={onOpenIndex} skipTargetId={VIEW_TOGGLE_ID} />
        ) : (
          <ListView rows={rows} onOpen={onOpenKey} />
        )}
      </div>
      {detail !== null ? <LazyDetailPanel model={detail} onClose={onClose} /> : null}
    </div>
  );
}
