import { SPRITE_VARIANTS, symbolIdOf } from '@/view-model/variants';

// Requirement 1.7: six legend entries, each a drawing and a visible text label.
const LEGEND_ENTRIES = [
  {
    symbol: symbolIdOf('tombstone', SPRITE_VARIANTS.tombstone[0], false),
    text: 'Tombstone: DEAD and buried, archived or deprecated',
  },
  {
    symbol: symbolIdOf('overgrown', SPRITE_VARIANTS.overgrown[0], false),
    text: 'Overgrown grave: DEAD and forgotten, no recent release or commit, may be finished or abandoned',
  },
  {
    symbol: symbolIdOf('ghost', 'wisp', false),
    text: 'Ghost: HAUNTED, has open vulnerabilities',
  },
  {
    symbol: symbolIdOf('restless', SPRITE_VARIANTS.restless[0], false),
    text: 'Restless ghost: HAUNTED and buried, has open vulnerabilities and is also archived or deprecated',
  },
  {
    symbol: symbolIdOf('lantern', 'iron', false),
    text: 'Lantern: ALIVE, no risk signal strong enough to matter',
  },
  {
    symbol: symbolIdOf('unmarked', 'mound', false),
    text: 'Unmarked grave: not assessed',
  },
];

export function Legend() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {LEGEND_ENTRIES.map((entry) => (
        <li key={entry.symbol} className="flex items-center gap-3 rounded bg-night-raised p-3">
          <svg
            viewBox="0 0 80 104"
            width="40"
            height="52"
            aria-hidden="true"
            focusable="false"
            className="shrink-0"
          >
            <use href={`#${entry.symbol}`} />
          </svg>
          <span className="text-bone">{entry.text}</span>
        </li>
      ))}
    </ul>
  );
}
