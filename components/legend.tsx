// Requirement 1.7: six legend entries, each a drawing and a visible text label.
const LEGEND_ENTRIES = [
  {
    symbol: 'plot-tombstone',
    text: 'Tombstone: DEAD and buried, archived or deprecated',
  },
  {
    symbol: 'plot-overgrown',
    text: 'Overgrown grave: DEAD and forgotten, no recent release or commit, may be finished or abandoned',
  },
  {
    symbol: 'plot-ghost',
    text: 'Ghost: HAUNTED, has open vulnerabilities',
  },
  {
    symbol: 'plot-restless',
    text: 'Restless ghost: HAUNTED and buried, has open vulnerabilities and is also archived or deprecated',
  },
  {
    symbol: 'plot-lantern',
    text: 'Lantern: ALIVE, no risk signal strong enough to matter',
  },
  {
    symbol: 'plot-unmarked',
    text: 'Unmarked grave: not assessed',
  },
] as const;

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
