import { noteGroupId } from "@/components/note-group-section";
import type { NotesModel } from "@/view-model";

export interface SourceStatusListProps {
  sources: NotesModel["sources"];
  /** Codes of the note groups that exist, so an alert links only to a group that is on the page. */
  groupCodes: readonly string[];
}

/** Requirements 11.1 to 11.3: status word plus symbol; alert lines link to the matching note group. */
export function SourceStatusList({ sources, groupCodes }: SourceStatusListProps) {
  return (
    <ul className="flex flex-col gap-2">
      {sources.map((source) => {
        const code = source.status === "failed" ? "source-failed" : "source-partial";
        const linked = source.alert !== null && groupCodes.includes(code);
        return (
          <li key={source.name} className="flex flex-col">
            <span className="text-bone">
              {source.label}: {source.status}{" "}
              <span aria-hidden="true">{source.symbol}</span>
            </span>
            {source.alert === null ? null : linked ? (
              <a href={`#${noteGroupId(code)}`} className="text-amber underline">
                {source.alert}
              </a>
            ) : (
              <span className="text-bone-muted">{source.alert}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
