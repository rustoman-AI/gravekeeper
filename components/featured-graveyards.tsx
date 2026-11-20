import type { MouseEvent } from 'react';
import { FEATURED_GRAVEYARDS, buildUrl } from '../view-model';

export interface FeaturedGraveyardsProps {
  /** Called with the featured repository URL on a plain left click. The anchor stays a real link. */
  onSelect?: (url: string) => void;
}

// Requirement 2.2: ecosystem name shown next to owner/repo. The view-model constant holds URLs only.
const ECOSYSTEM_BY_URL: Readonly<Record<string, string>> = {
  'https://github.com/request/request': 'npm',
  'https://github.com/revmic/canopy': 'pypi',
  'https://github.com/ajeetdsouza/zoxide': 'cargo',
};

function ownerRepo(url: string): string {
  return url.replace(/^https:\/\/github\.com\//, '');
}

function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
  );
}

// Requirements 2.1 to 2.4: one real anchor per featured entry, in constant order.
export function FeaturedGraveyards({ onSelect }: FeaturedGraveyardsProps) {
  return (
    <ul className="flex flex-wrap gap-3">
      {FEATURED_GRAVEYARDS.map((url) => (
        <li key={url}>
          <a
            href={buildUrl({ repo: url, manifests: [], view: 'scene' })}
            onClick={(event) => {
              if (onSelect !== undefined && isPlainClick(event)) {
                event.preventDefault();
                onSelect(url);
              }
            }}
            className="gk-headstone"
          >
            {/* Requirement 9.6: headstone card labelled owner/repo. */}
            <span className="underline">{ownerRepo(url)}</span>
            <span className="text-sm text-bone-muted">{ECOSYSTEM_BY_URL[url] ?? ''}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
