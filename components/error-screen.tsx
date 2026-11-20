'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ErrorActionId, ErrorModel } from '@/view-model';
import type { UseCountdownOptions } from './hooks/use-countdown';
import { BackToGate } from './back-to-gate';
import { ManifestPicker } from './manifest-picker';
import { RepoForm } from './repo-form';
import { RetryButton } from './retry-button';

export interface ErrorScreenProps {
  model: ErrorModel;
  /** Arrival time of the error in milliseconds on the injected clock. */
  arrivedAtMs: number;
  /**
   * `edit-url`: payload is the submitted repository value. `scan-default-branch`, `scan-root`,
   * `scan-selected`: payload is the scan URL. `retry` and `back-to-gate`: no payload.
   */
  onAction: (actionId: ErrorActionId, payload?: string) => void;
  initialRepoValue: string;
  clock?: Pick<UseCountdownOptions, 'now' | 'setInterval' | 'clearInterval'>;
}

const BUTTON =
  'min-h-11 self-start rounded bg-amber px-5 font-semibold text-night hover:bg-bone';

/** Requirement 13: themed heading (focused h1), plain message, code, status and actions. */
export function ErrorScreen({ model, arrivedAtMs, onAction, initialRepoValue, clock }: ErrorScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const messageId = useId();
  const partId = useId();
  const isInvalidUrl = model.code === 'invalid-url';
  const [editing, setEditing] = useState(isInvalidUrl);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <h1 ref={headingRef} tabIndex={-1} className="text-3xl text-bone focus:outline-none">
        {model.heading}
      </h1>
      <p id={messageId} className="break-words text-bone">
        {model.plainMessage}
      </p>
      {model.invalidPart === null ? null : (
        <p id={partId} className="text-bone">
          The part that failed: {model.invalidPart}
        </p>
      )}
      {model.hint === null ? null : <p className="text-bone-muted">{model.hint}</p>}
      <p className="text-bone-muted">
        <span>Error code: {model.code}</span>
        {model.httpStatus === null ? null : <span>{' · '}HTTP status: {String(model.httpStatus)}</span>}
      </p>
      {editing ? (
        <RepoForm
          initialValue={initialRepoValue}
          focusOnMount={!isInvalidUrl}
          describedBy={
            isInvalidUrl ? (model.invalidPart === null ? messageId : `${messageId} ${partId}`) : undefined
          }
          onSubmit={(value) => {
            onAction('edit-url', value);
          }}
        />
      ) : null}
      {model.picker === null ? null : (
        <ManifestPicker
          candidates={model.picker.candidates.map((c) => ({ path: c.path }))}
          repoValue={initialRepoValue}
          onScan={(url) => {
            onAction('scan-selected', url);
          }}
        />
      )}
      <div className="flex flex-col gap-3">
        {model.actions.map((action) => {
          switch (action.id) {
            case 'edit-url':
              return editing ? null : (
                <button
                  key={action.id}
                  type="button"
                  className={BUTTON}
                  onClick={() => {
                    setEditing(true);
                  }}
                >
                  {action.label}
                </button>
              );
            case 'retry':
              return (
                <RetryButton
                  key={action.id}
                  label={action.label}
                  cooldownSeconds={model.retryCooldownSeconds ?? 0}
                  arrivedAtMs={arrivedAtMs}
                  clock={clock}
                  onRetry={() => {
                    onAction('retry');
                  }}
                />
              );
            case 'scan-default-branch':
            case 'scan-root': {
              const url = action.id === 'scan-root' ? model.rootScanUrl : model.defaultBranchUrl;
              return url === null ? null : (
                <button
                  key={action.id}
                  type="button"
                  className={BUTTON}
                  onClick={() => {
                    onAction(action.id, url);
                  }}
                >
                  {action.label}
                </button>
              );
            }
            case 'scan-selected':
              return null; // rendered by the ManifestPicker above
            case 'back-to-gate':
              return <BackToGate key={action.id} label={action.label} />;
          }
        })}
      </div>
    </section>
  );
}
