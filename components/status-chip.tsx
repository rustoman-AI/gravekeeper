import type { StatusChipModel } from '../view-model/types';

export interface StatusChipProps {
  chip: StatusChipModel;
}

/**
 * Graveyard-art Requirements 5.4, 5.5: one status chip. The icon is decorative; the text carries
 * the status, so it is never conveyed by the icon alone.
 */
export function StatusChip({ chip }: StatusChipProps) {
  return (
    <li className="gk-chip" data-status={chip.status}>
      <svg aria-hidden="true" focusable="false" className="gk-chip-icon" viewBox="0 0 80 104">
        <use href={`#${chip.iconSymbolId}`} />
      </svg>
      <span>{chip.text}</span>
    </li>
  );
}
