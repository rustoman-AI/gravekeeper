import { useId } from "react";

/**
 * Props of the Resurrect_Slot (Requirement 12.4). The later Resurrect spec replaces the body of
 * this component without changing the Detail_Panel.
 */
export interface ResurrectSlotProps {
  /** Package key of the dead package, for example "npm:left-pad". */
  packageKey: string;
  /** Name shown to the visitor for the package. */
  displayName: string;
}

/**
 * Requirement 12: a marked placeholder. It sends no request and names no alternative package
 * (12.3). The button is natively disabled and carries aria-disabled (12.2).
 */
export function ResurrectSlot({ packageKey, displayName }: ResurrectSlotProps) {
  const id = useId();
  return (
    <section
      data-slot="resurrect"
      data-package-key={packageKey}
      data-display-name={displayName}
      data-placeholder="true"
      aria-labelledby={`${id}-heading`}
    >
      <h3 id={`${id}-heading`}>Resurrect</h3>
      <p>Coming soon: suggest a maintained alternative and a manifest patch</p>
      <button
        type="button"
        disabled
        aria-disabled="true"
        aria-describedby={`${id}-desc`}
      >
        Resurrect
      </button>
      <small id={`${id}-desc`}> Not available yet</small>
    </section>
  );
}
