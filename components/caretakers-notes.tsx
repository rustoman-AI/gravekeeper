import { LazyManifestPicker } from "@/components/lazy-manifest-picker";
import { NoteGroupSection } from "@/components/note-group-section";
import { SourceStatusList } from "@/components/source-status-list";
import type { NotesModel } from "@/view-model";

export interface CaretakersNotesProps {
  model: NotesModel;
  /** Repo value used by the picker's scan URL. */
  repoValue: string;
  /** Called with the scan URL when the picker's button is used. */
  onScan: (url: string) => void;
}

/** Requirement 11: the caretaker's notes, from source status to the manifest picker. */
export function CaretakersNotes({ model, repoValue, onScan }: CaretakersNotesProps) {
  const groupCodes = model.sections.flatMap((s) => s.groups.map((g) => g.code));
  return (
    <section aria-labelledby="caretakers-notes-heading" className="flex flex-col gap-4">
      <h2 id="caretakers-notes-heading" className="text-2xl text-bone">
        The caretaker&apos;s notes
      </h2>
      <SourceStatusList sources={model.sources} groupCodes={groupCodes} />
      {model.discoveryNote === null ? null : <p className="text-bone-muted">{model.discoveryNote}</p>}
      {model.sections.map((section) => (
        <section key={section.title} aria-label={section.title} className="flex flex-col gap-3">
          <h3 className="text-xl text-bone">{section.title}</h3>
          {section.groups.map((group) => (
            <NoteGroupSection key={group.code} group={group} />
          ))}
        </section>
      ))}
      {model.manifestWarnings.length === 0 ? null : (
        <section aria-label="Manifest warnings" className="flex flex-col gap-2">
          <h3 className="text-xl text-bone">Manifest warnings</h3>
          {model.manifestWarnings.map((m) => (
            <div key={m.path} className="flex flex-col">
              <p className="text-bone">{m.path}</p>
              <ul className="text-bone-muted">
                {m.warnings.map((w, i) => (
                  <li key={`${String(i)}-${w}`}>
                    <p>{w}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
      {model.picker === null ? null : (
        <LazyManifestPicker
          candidates={model.picker.candidates}
          repoValue={repoValue}
          onScan={onScan}
        />
      )}
    </section>
  );
}
