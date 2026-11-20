interface SkipLinkProps {
  href?: string;
  label?: string;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}

export function SkipLink({ href = "#main", label = "Skip to main content", onClick }: SkipLinkProps = {}) {
  return (
    <a
      href={href}
      onClick={onClick}
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-night-raised focus:px-4 focus:py-2 focus:text-bone focus:outline-2 focus:outline-offset-2 focus:outline-focus"
    >
      {label}
    </a>
  );
}
