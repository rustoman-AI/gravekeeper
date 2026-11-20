import Link from 'next/link';

/** Requirement 13.11: a link to / on every error. */
export function BackToGate({ label = 'Back to the gate' }: { label?: string }) {
  return (
    <Link href="/" className="inline-flex min-h-11 items-center text-amber underline hover:text-bone">
      {label}
    </Link>
  );
}
