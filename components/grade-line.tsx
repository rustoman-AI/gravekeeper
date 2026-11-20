import type { HeaderModel } from '../view-model';

export interface GradeLineProps {
  grade: HeaderModel['grade'];
}

/** Requirements 5.4 to 5.6: grade letter ("no grade" when null), explanation, closed scale disclosure. */
export function GradeLine({ grade }: GradeLineProps) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-bone">
        <span className="text-bone-muted">Grade ({grade.label}): </span>
        <strong className="font-display text-2xl">{grade.letter ?? 'no grade'}</strong>
      </p>
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
