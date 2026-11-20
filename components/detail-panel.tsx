"use client";

import { useId, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AdvisoryGroups } from "@/components/advisory-groups";
import { ExternalLink } from "@/components/external-link";
import { useFocusTrap } from "@/components/hooks/use-focus-trap";
import { ResurrectSlot } from "@/components/resurrect-slot";
import type { DetailModel } from "@/view-model";

export interface DetailPanelProps {
  model: DetailModel;
  onClose: () => void;
  /** Element that receives focus on close. Defaults to the element focused when the panel opened. */
  returnFocusTo?: RefObject<HTMLElement | null>;
}

function groupNotes(
  notes: DetailModel["notes"],
): { group: string; messages: string[] }[] {
  const out: { group: string; messages: string[] }[] = [];
  for (const n of notes) {
    const last = out[out.length - 1];
    if (last !== undefined && last.group === n.group)
      last.messages.push(n.message);
    else out.push({ group: n.group, messages: [n.message] });
  }
  return out;
}

/**
 * Requirement 10: a custom modal (design D5), rendered in a portal on `document.body`. Every upstream
 * string is a React text node.
 */
export function DetailPanel({
  model,
  onClose,
  returnFocusTo,
}: DetailPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const options =
    returnFocusTo === undefined
      ? { onEscape: onClose }
      : { onEscape: onClose, returnFocusTo };
  useFocusTrap(ref, options);

  if (typeof document === "undefined") return null;

  const noteGroups = groupNotes(model.notes);
  return createPortal(
    <div className="gk-detail-backdrop">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="gk-detail"
      >
        <header className="gk-detail-head">
          <h2 id={titleId}>{model.title}</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>

        <p className="gk-detail-status">
          <strong>{model.statusWord}</strong>
          {model.unassessedLabel === null ? (
            <span>, score {model.scoreText}</span>
          ) : (
            <span>, {model.unassessedLabel}</span>
          )}
        </p>

        {model.reasons.length === 0 ? null : (
          <section aria-labelledby={`${titleId}-reasons`}>
            <h3 id={`${titleId}-reasons`}>Reasons</h3>
            <ul>
              {model.reasons.map((r, i) => (
                <li key={`${r.ruleId}-${String(i)}`}>
                  {r.isMain ? <strong>main reason: </strong> : null}
                  <span>{r.message}</span>{" "}
                  <span className="gk-detail-rule">(rule {r.ruleId})</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby={`${titleId}-facts`}>
          <h3 id={`${titleId}-facts`}>Facts</h3>
          <dl>
            {model.facts.map((f) => (
              <div key={f.field} className="gk-detail-fact">
                <dt title={f.field}>{f.label}</dt>
                <dd>{f.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby={`${titleId}-version`}>
          <h3 id={`${titleId}-version`}>Version checked</h3>
          <p>{model.versionLine}</p>
          {model.versionSpecText === "" ? null : (
            <p>Declared as {model.versionSpecText}</p>
          )}
          {model.versionNotes.map((m, i) => (
            <p key={i}>{m}</p>
          ))}
        </section>

        <section aria-labelledby={`${titleId}-where`}>
          <h3 id={`${titleId}-where`}>Where it is declared</h3>
          {model.scopes.length === 0 ? null : (
            <p>Scopes: {model.scopes.join(", ")}</p>
          )}
          {model.rawName === null ? null : (
            <p>Manifest spelling: {model.rawName}</p>
          )}
          {model.manifestPaths.length === 0 ? null : (
            <ul>
              {model.manifestPaths.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </section>

        {noteGroups.length === 0 ? null : (
          <section aria-labelledby={`${titleId}-notes`}>
            <h3 id={`${titleId}-notes`}>Notes</h3>
            {noteGroups.map((g) => (
              <div key={g.group}>
                <h4>{g.group}</h4>
                <ul>
                  {g.messages.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        <section aria-labelledby={`${titleId}-links`}>
          <h3 id={`${titleId}-links`}>Links</h3>
          <ul>
            <li>
              {model.links.registry === null ? (
                <span>registry page unavailable</span>
              ) : (
                <ExternalLink href={model.links.registry}>
                  registry page
                </ExternalLink>
              )}
            </li>
            {model.links.sourceRepo === null ? null : (
              <li>
                <ExternalLink href={model.links.sourceRepo}>
                  source repository (unverified)
                </ExternalLink>
              </li>
            )}
          </ul>
        </section>

        {model.advisoryEmptyText === null &&
        model.advisoryGroups.length === 0 ? null : (
          <section aria-labelledby={`${titleId}-advisories`}>
            <h3 id={`${titleId}-advisories`}>Advisories</h3>
            {model.advisoryEmptyText === null ? null : (
              <p>{model.advisoryEmptyText}</p>
            )}
            <AdvisoryGroups
              groups={model.advisoryGroups}
              idPrefix={`${titleId}-adv`}
            />
          </section>
        )}

        {/* Requirement 10.13, 12.1: the placeholder slot for every DEAD package. */}
        {model.resurrect ? (
          <ResurrectSlot packageKey={model.key} displayName={model.title} />
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
