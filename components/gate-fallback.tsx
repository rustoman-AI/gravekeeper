// Static markup shown before the client takes over: the same h1 as the landing page and a
// block reserved at the height of the form, so the page does not shift.
// The layout already provides the `main` landmark.
export function GateFallback() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <h1 className="text-4xl text-bone">Gravekeeper</h1>
      <div aria-hidden="true" className="min-h-28" />
    </div>
  );
}
