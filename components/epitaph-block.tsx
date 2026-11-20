import type { EpitaphModel } from "@/view-model/epitaph";

export interface EpitaphBlockProps {
  epitaph: EpitaphModel;
}

/**
 * graveyard-art Requirements 7.1, 7.9: the engraved epitaph. One span per sentence so the sentences wrap
 * naturally; every string is a React text node. Styling lives in `.gk-epitaph` (tokens only).
 */
export function EpitaphBlock({ epitaph }: EpitaphBlockProps) {
  return (
    <section aria-label="Epitaph" className="gk-epitaph">
      <p>
        {epitaph.lines.map((line, i) => (
          <span key={i}>{line}</span>
        ))}
      </p>
    </section>
  );
}
