import { FeaturedGraveyards } from './featured-graveyards';
import { Hero } from './hero';
import { HowItDecides } from './how-it-decides';
import { Legend } from './legend';
import { RepoForm } from './repo-form';

export interface LandingPageProps {
  initialValue?: string;
  /** Focus the repository input on mount (used after Cancel). */
  focusOnMount?: boolean;
  onSubmit: (value: string) => void;
  /** Optional: lets the app shell push history on a featured link click. */
  onSelectFeatured?: (url: string) => void;
}

// Requirements 1 and 9: the hero (the one h1 and the pitch), the form directly below it (R9.2), the grade sentence,
// how the caretaker decides, the featured row (Requirement 2) and the legend. The layout provides header, main and footer.
export function LandingPage({
  initialValue,
  focusOnMount,
  onSubmit,
  onSelectFeatured,
}: LandingPageProps) {
  return (
    <div className="flex w-full flex-col pb-8">
      <Hero />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pt-8">
      <RepoForm initialValue={initialValue} focusOnMount={focusOnMount} onSubmit={onSubmit} />
      <p className="text-bone-muted">
        The grade is the worst single risk among the dependencies, not an average.
      </p>
      <HowItDecides />
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
    </div>
  );
}
