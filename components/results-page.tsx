'use client';

import { useEffect, useMemo, useRef } from 'react';
import {
  buildHeaderModel,
  buildPackageRows,
  buildSceneModel,
  columnsFor,
  sceneHeight,
} from '../view-model/index';
import type { CacheStatus, ParsedScanResult } from '../view-model/index';
import { useContainerWidth } from './hooks/use-container-width';
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
  /** Called with the plot index. The detail panel is wired in task 19.7. */
  onOpen?: (index: number) => void;
}

const NOOP = () => undefined;

/** Requirements 3.4, 3.5, 8.3, 17.3, 17.5, 18.1: header, view toggle and the Scene. */
export function ResultsPage({ result, cache, nowMs, view, onViewChange, onOpen = NOOP }: ResultsPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useContainerWidth(containerRef);
  const columns = columnsFor(width);

  const rows = useMemo(() => buildPackageRows(result), [result]);
  const header = useMemo(() => buildHeaderModel(result, rows), [result, rows]);
  const scene = useMemo(() => buildSceneModel(rows, columns), [rows, columns]);
  // Reserved before any plot renders, so the page does not shift (Requirement 17.3).
  const reserved = sceneHeight(rows.length, columns);

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
          <Scene scene={scene} onOpen={onOpen} skipTargetId={VIEW_TOGGLE_ID} />
        ) : (
          <p className="text-bone">The list view is not available yet.</p>
        )}
      </div>
    </div>
  );
}
