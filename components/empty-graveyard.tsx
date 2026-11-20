export interface EmptyGraveyardProps {
  message: string;
}

/** Requirement 11.9: the message shown when no manifests were found. */
export function EmptyGraveyard({ message }: EmptyGraveyardProps) {
  return (
    <div className="rounded border border-bone-muted bg-night-raised p-4 text-bone">
      <p>{message}</p>
    </div>
  );
}
