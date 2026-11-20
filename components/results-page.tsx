'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildDetailModel,
  buildHeaderModel,
  buildNotesModel,
  buildPackageRows,
  buildSceneModel,
  columnsFor,
  SCENE_PADDING_PX,
  sceneHeight,
} from '../view-model/index';
import dynamic from 'next/dynamic';
import type { CacheStatus, PackageKeyString, ParsedScanResult } from '../view-model/index';
import { useContainerWidth } from './hooks/use-container-width';
import { CapBanner } from './cap-banner';
import { EmptyGraveyard } from './empty-graveyard';
import { CaretakersNotes } from './caretakers-notes';
import { LazyManifestPicker } from './lazy-manifest-picker';
import { LazyDetailPanel } from './lazy-detail-panel';
import { ResultsHeader } from './results-header';
import { Scene } from './scene';
import { SceneStage } from './scene-stage';
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
  /** Called with the picker's scan URL (Requirement 11.11). */
  onScanManifests: (url: string) => void;
}

// Loaded only when the list view is chosen (Requirements 16.7, 17.7).
const ListView = dynamic(() => import('./list-view').then((mod) => mod.ListView), {
  loading: () => <p className="text-bone">Loading...</p>,
});

/** Height of the picker: legend, one row per candidate (label, detail line), gaps and the button. */
function pickerReservedHeight(count: number): number {
  return 28 + count * 76 + 12 + 44;
}

/** Requirements 3.4, 3.5, 8.3, 17.3, 17.5, 18.1: header, view toggle and the Scene. */
export function ResultsPage({ result, cache, nowMs, view, onViewChange, onScanManifests }: ResultsPageProps) {
  const rows = useMemo(() => buildPackageRows(result), [result]);
  const notes = useMemo(() => buildNotesModel(result), [result]);
  // The scene view measures the column inside the stage; the list and empty states measure their own div.
  const sceneRef = useRef<HTMLDivElement>(null);
  const otherRef = useRef<HTMLDivElement>(null);
  const containerRef = view === 'scene' && notes.empty === null ? sceneRef : otherRef;
  // -1 marks the unmeasured first pass (one column, one band per plot). The Scene waits for the layout
  // effect in the hook so its first commit already uses the real column count.
  const width = useContainerWidth(containerRef, -1);
  const measured = width >= 0;
  // The Scene adds SCENE_PADDING_PX on each side, so columns fit the content width (R8.1, R16.9).
  const columns = columnsFor(width - 2 * SCENE_PADDING_PX);

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

  // The picker loads lazily; its space is reserved so the notes below do not shift (Requirement 17.3).
  const picker =
    notes.picker === null ? null : (
      <div style={{ minHeight: pickerReservedHeight(notes.picker.candidates.length) }}>
        <LazyManifestPicker candidates={notes.picker.candidates} repoValue={header.canonicalUrl} onScan={onScanManifests} />
      </div>
    );
  const column = 'mx-auto flex w-full max-w-6xl flex-col gap-6 px-4';
  const showScene = notes.empty === null && view === 'scene';
  return (
    <div className="flex w-full flex-col">
      <div className={`${column} pt-8 pb-6`}>
        <SceneSprites />
        <ResultsHeader header={header} cache={cache} nowMs={nowMs} />
        {notes.capBanner === null ? null : <CapBanner banner={notes.capBanner} />}
        {notes.empty === null ? (
          <ViewToggle view={view} onChange={onViewChange} />
        ) : (
          <>
            <EmptyGraveyard message={notes.empty.message} />
            <div ref={otherRef} />
            {picker}
          </>
        )}
        {notes.empty === null && !showScene ? (
          <div ref={otherRef} style={{ minHeight: reserved, maxWidth: '100%', overflowX: 'auto' }}>
            <ListView rows={rows} onOpen={onOpenKey} />
          </div>
        ) : null}
      </div>
      {showScene ? (
        <SceneStage>
          <div ref={sceneRef} style={{ minHeight: reserved, maxWidth: '100%', overflowX: 'auto' }}>
            {measured ? <Scene scene={scene} onOpen={onOpenIndex} skipTargetId={VIEW_TOGGLE_ID} /> : null}
          </div>
        </SceneStage>
      ) : null}
      <div className={`${column} py-8`}>
        {notes.empty === null ? picker : null}
        <CaretakersNotes model={notes} />
        {detail !== null ? <LazyDetailPanel model={detail} onClose={onClose} /> : null}
      </div>
    </div>
  );
}
