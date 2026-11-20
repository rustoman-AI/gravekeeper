import type { HeaderModel } from '../view-model';

export interface GradePlaqueProps {
  grade: HeaderModel['grade'];
}

/**
 * Graveyard-art Requirements 5.2, 5.8: the grade as a carved plaque (letter and caption), then the
 * explanation and the closed "Grade scale" disclosure below the figure (content of the former GradeLine).
 */
export function GradePlaque({ grade }: GradePlaqueProps) {
  return (
    <div className="flex flex-col gap-1">
      <figure className="gk-plaque">
        <strong className="gk-plaque-letter">{grade.letter ?? 'no grade'}</strong>
        <figcaption>{grade.label}</figcaption>
      </figure>
      <p className="text-bone-muted">{grade.explanation}</p>
      <details>
        <summary className="min-h-6 cursor-pointer text-bone">Grade scale</summary>
        <ul className="mt-1 flex flex-col gap-1">
          {grade.scale.map((entry) => (
            <li key={entry.letter} className="text-bone-muted">
              <strong className="text-bone">{entry.letter}</strong>: {entry.range}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
