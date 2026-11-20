import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="bg-night px-4 py-3">
      <Link
        href="/"
        className="font-display text-xl text-bone hover:text-amber focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        Gravekeeper
      </Link>
    </header>
  );
}
