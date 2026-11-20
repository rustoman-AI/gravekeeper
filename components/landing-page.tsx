import { FeaturedGraveyards } from './featured-graveyards';
import { Legend } from './legend';
import { RepoForm } from './repo-form';
import { SceneSprites } from './scene-sprites';

export interface LandingPageProps {
  initialValue?: string;
  /** Focus the repository input on mount (used after Cancel). */
  focusOnMount?: boolean;
  onSubmit: (value: string) => void;
  /** Optional: lets the app shell push history on a featured link click. */
  onSelectFeatured?: (url: string) => void;
}

// Requirement 1: one h1 with one adjacent paragraph, the grade sentence, the form,
// the featured row (Requirement 2) and the legend. The layout provides header, main and footer.
export function LandingPage({
  initialValue,
  focusOnMount,
  onSubmit,
  onSelectFeatured,
}: LandingPageProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <SceneSprites />
      <section className="flex flex-col gap-3">
        <h1 className="text-4xl text-bone">Gravekeeper</h1>
        <p className="text-lg text-bone">
          Paste a public GitHub repository and see which of its dependencies are dead, haunted or
          alive.
        </p>
        <p className="text-bone-muted">
          The grade is the worst single risk among the dependencies, not an average.
        </p>
      </section>
      <RepoForm initialValue={initialValue} focusOnMount={focusOnMount} onSubmit={onSubmit} />
      <section aria-labelledby="featured-heading" className="flex flex-col gap-3">
        <h2 id="featured-heading" className="text-2xl text-bone">
          Featured graveyards
        </h2>
        <FeaturedGraveyards onSelect={onSelectFeatured} />
      </section>
      <section aria-labelledby="legend-heading" className="flex flex-col gap-3">
        <h2 id="legend-heading" className="text-2xl text-bone">
          Legend
        </h2>
        <Legend />
      </section>
    </div>
  );
}
