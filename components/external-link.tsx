import type { ReactNode } from "react";

export interface ExternalLinkProps {
  /** Already validated by the view-model (Requirement 21). `null` renders plain text. */
  href: string | null;
  children: ReactNode;
}

function hostOf(href: string): string | null {
  try {
    return new URL(href).host;
  } catch {
    return null;
  }
}

/** Requirement 10.11: new browsing context, `noopener noreferrer`, destination host shown as text. */
export function ExternalLink({ href, children }: ExternalLinkProps) {
  if (href === null) return <span>{children}</span>;
  const host = hostOf(href);
  return (
    <>
      <a href={href} target="_blank" rel="noopener noreferrer" className="gk-link">
        {children}
      </a>
      {host === null ? null : <span className="gk-link-host"> ({host})</span>}
    </>
  );
}
