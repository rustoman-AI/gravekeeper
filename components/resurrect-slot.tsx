"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ExternalLink } from "@/components/external-link";
import { COPY_STATUS_RESET_MS } from "@/view-model/constants";
import type {
  ResurrectBlock,
  ResurrectLink,
  ResurrectModel,
  ResurrectSegment,
} from "@/view-model";

export interface ResurrectSlotProps {
  model: ResurrectModel;
}

const COPY_FAILED = "Copying failed. Select the commands and copy them by hand.";

function Lead({ segments }: { segments: readonly ResurrectSegment[] }) {
  return (
    <p className="gk-resurrect-lead">
      {segments.map((s, i) =>
        s.kind === "code" ? (
          <code key={i}>{s.text}</code>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </p>
  );
}

function Link({ link }: { link: ResurrectLink }) {
  return (
    <p className="gk-resurrect-link">
      <ExternalLink href={link.href}>{link.label}</ExternalLink>
    </p>
  );
}

/**
 * Resurrect Requirements 9.12, 10.12, 11.1 to 11.6, 11.8, 12.1, 12.3: renders the model of the view-model.
 * Hint text is one text node; every link goes through ExternalLink; no request is sent.
 */
export function ResurrectSlot({ model }: ResurrectSlotProps) {
  const id = useId();
  const [status, setStatus] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  // Requirement 11.2, 11.3, 11.5: result text, cleared after COPY_STATUS_RESET_MS.
  const report = (text: string) => {
    if (timer.current !== null) clearTimeout(timer.current);
    setStatus(text);
    timer.current = setTimeout(() => {
      timer.current = null;
      setStatus("");
    }, COPY_STATUS_RESET_MS);
  };

  const copy = (block: ResurrectBlock, to: string) => {
    let pending: Promise<void>;
    try {
      pending = navigator.clipboard.writeText(block.copyText);
    } catch {
      report(COPY_FAILED);
      return;
    }
    pending.then(
      () => report(`Copied the commands for ${to}`),
      () => report(COPY_FAILED),
    );
  };

  return (
    <section
      data-slot="resurrect"
      aria-labelledby={`${id}-heading`}
      className="gk-resurrect"
    >
      <h3 id={`${id}-heading`}>{model.heading}</h3>

      {model.urgent === null ? null : (
        <p className="gk-resurrect-urgent">{model.urgent}</p>
      )}

      {model.hints.map((h, i) => (
        <div key={i} className="gk-resurrect-hint">
          <p className="gk-resurrect-label">{h.label}</p>
          <p className="gk-resurrect-text">{h.text}</p>
          {h.link === null ? null : <Link link={h.link} />}
        </div>
      ))}

      {model.suggestions.map((s, si) => (
        <div key={si} className="gk-resurrect-suggestion">
          <p className="gk-resurrect-label">{s.label}</p>
          <p className="gk-resurrect-why">{s.why}</p>
          <Link link={s.source} />
          {s.alternatives.map((a) => (
            <div key={a.name} className="gk-resurrect-alternative">
              <p className="gk-resurrect-name">
                <code>{a.name}</code>
              </p>
              {a.blocks.map((b, bi) => (
                <div key={bi} className="gk-resurrect-block">
                  {b.heading === null ? null : (
                    <p className="gk-resurrect-block-heading">{b.heading}</p>
                  )}
                  {b.lead === null ? null : <Lead segments={b.lead} />}
                  <pre className="gk-resurrect-commands">
                    <code>{b.lines.join("\n")}</code>
                  </pre>
                  {b.note === null ? null : (
                    <p className="gk-resurrect-note">{b.note}</p>
                  )}
                  <button
                    type="button"
                    className="gk-resurrect-copy"
                    aria-label={b.copyLabel}
                    onClick={() => {
                      copy(b, a.name);
                    }}
                  >
                    Copy
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}

      {model.fallback === null ? null : (
        <div className="gk-resurrect-fallback">
          <p className="gk-resurrect-text">{model.fallback.paragraph}</p>
          {model.fallback.links.length === 0 ? null : (
            <ul className="gk-resurrect-links">
              {model.fallback.links.map((l, i) => (
                <li key={i}>
                  <ExternalLink href={l.href}>{l.label}</ExternalLink>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p role="status" className="gk-resurrect-status">
        {status}
      </p>
    </section>
  );
}
