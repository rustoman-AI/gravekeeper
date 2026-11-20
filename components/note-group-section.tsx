"use client";

import { useState } from "react";
import type { NotesModel } from "@/view-model";

export type NoteGroupModel = NotesModel["sections"][number]["groups"][number];

export interface NoteGroupSectionProps {
  group: NoteGroupModel;
}

/** Id of a note group section; the source alert lines link to it. */
export function noteGroupId(code: string): string {
  return `note-group-${code}`;
}

/**
 * Requirements 11.4, 11.5, 15.6: themed heading with the full count, the first previewCount
 * messages (the first note's plain message is always among them), the rest behind "Show all".
 * Every plain message is its own element.
 */
export function NoteGroupSection({ group }: NoteGroupSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const headingId = `${noteGroupId(group.code)}-heading`;
  const hidden = group.count > group.previewCount;
  const shown = expanded ? group.messages : group.messages.slice(0, group.previewCount);
  return (
    <section id={noteGroupId(group.code)} aria-labelledby={headingId} className="flex flex-col gap-2">
      <h4 id={headingId} className="text-bone">
        {group.heading} ({group.count})
      </h4>
      <ul className="flex flex-col gap-1 text-bone-muted">
        {shown.map((message, i) => (
          <li key={`${String(i)}-${message}`}>
            <p>{message}</p>
          </li>
        ))}
      </ul>
      {hidden && !expanded ? (
        <button
          type="button"
          onClick={() => {
            setExpanded(true);
          }}
          className="min-h-11 self-start rounded border border-bone-muted px-3 text-bone hover:bg-night-raised"
        >
          Show all {group.count}
        </button>
      ) : null}
    </section>
  );
}
