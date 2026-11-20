// graveyard-art Requirement 9.3 to 9.5: an h2 and three paragraphs in plain words, naming the
// sources (deps.dev, npm, PyPI, crates.io, OSV, GitHub), the three states and the unmarked graves,
// with an inline link to the Legend heading of the same page. Server Component-safe.
export function HowItDecides() {
  return (
    <section aria-labelledby="how-heading" className="flex flex-col gap-3">
      <h2 id="how-heading" className="text-2xl text-bone">
        How the caretaker decides
      </h2>
      <p className="text-bone">
        The caretaker reads your manifests, then asks deps.dev, the npm, PyPI and crates.io
        registries, OSV and GitHub about every dependency.
      </p>
      <p className="text-bone">
        A package is dead when it is archived, deprecated or untouched for years, haunted when it
        has open security advisories, and alive when neither applies.
      </p>
      <p className="text-bone">
        A package the caretaker cannot look up stays an unmarked grave, and the grade is the worst
        single risk, not an average, as the{' '}
        <a href="#legend-heading" className="text-amber underline hover:text-bone">
          legend
        </a>{' '}
        explains.
      </p>
    </section>
  );
}
