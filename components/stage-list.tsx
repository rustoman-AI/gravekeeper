import type { StageState } from '../view-model/index';

export interface StageListProps {
  readonly stages: readonly StageState[];
}

/** Requirement 4.3: every stage carries its state as text, never by colour or shape alone. */
export function StageList({ stages }: StageListProps) {
  return (
    <ol className="space-y-2" aria-label="Scan stages">
      {stages.map((stage) => (
        <li
          key={stage.id}
          aria-current={stage.state === 'in progress' ? 'step' : undefined}
          className={
            stage.state === 'in progress'
              ? 'flex items-baseline justify-between gap-4 rounded bg-night-raised p-3 text-bone'
              : 'flex items-baseline justify-between gap-4 rounded p-3 text-bone-muted'
          }
        >
          <span>{stage.label}</span>
          <span>{stage.state}</span>
        </li>
      ))}
    </ol>
  );
}
