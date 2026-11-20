import { Hero } from './hero';

// Static markup shown before the client takes over (graveyard-art R9.8): the same Hero as the
// landing page (so the h1 and the height match, no layout shift) and a block reserved at the
// height of the form. The layout already provides the `main` landmark.
export function GateFallback() {
  return (
    <div className="flex w-full flex-col pb-8">
      <Hero />
      <div aria-hidden="true" className="mx-auto min-h-28 w-full max-w-3xl px-4 pt-8" />
    </div>
  );
}
