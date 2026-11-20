export type ViewName = 'scene' | 'list';

/** Id of the toggle group; the scene skip link targets it. */
export const VIEW_TOGGLE_ID = 'view-toggle';

export interface ViewToggleProps {
  view: ViewName;
  onChange: (view: ViewName) => void;
  id?: string;
}

const OPTIONS: readonly { value: ViewName; label: string }[] = [
  { value: 'scene', label: 'Scene' },
  { value: 'list', label: 'List' },
];

/** Requirement 18.1: two buttons with `aria-pressed`. The caller stores the choice in the `view` query value. */
export function ViewToggle({ view, onChange, id = VIEW_TOGGLE_ID }: ViewToggleProps) {
  return (
    <div id={id} role="group" aria-label="View" tabIndex={-1} className="inline-flex gap-2">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={view === option.value}
          onClick={() => onChange(option.value)}
          className={
            view === option.value
              ? 'min-h-11 rounded bg-amber px-4 font-semibold text-night'
              : 'min-h-11 rounded border border-bone-muted bg-night-raised px-4 text-bone hover:bg-night'
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
