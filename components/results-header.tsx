import type { HeaderModel } from '../view-model';
import { CacheNote } from './cache-note';
import { GradeLine } from './grade-line';

export interface ResultsHeaderProps {
  header: HeaderModel;
  cache: 'hit' | 'miss' | 'unknown';
  /** Browser clock in ms, passed by the caller. */
  nowMs: number;
}

/** Requirements 5.1 to 5.8 and 3.10. Renders HeaderModel fields only. The repo name is the page's h1. */
export function ResultsHeader({ header, cache, nowMs }: ResultsHeaderProps) {
  const { counts } = header;
  return (
    <section aria-label="Scan summary" className="flex flex-col gap-3">
      <h1 id="results-heading" tabIndex={-1} className="font-display text-3xl text-bone">
        {header.repoName}
      </h1>
      <p className="text-bone">
        Commit <abbr title={header.fullSha}>{header.shortSha}</abbr>
        <span className="sr-only"> (full SHA {header.fullSha})</span>, branch {header.branch}
        {header.notDefaultBranch ? ' (not the default branch)' : ''}, as of{' '}
        <time dateTime={header.asOfIso}>{header.asOfText}</time>. <CacheNote cache={cache} asOfIso={header.asOfIso} nowMs={nowMs} />
      </p>
      {header.headline !== null ? (
        <p className="text-xl text-bone">{header.headline.text}</p>
      ) : (
        <p className="text-xl text-bone">{header.emptyText}</p>
      )}
      <ul className="flex flex-wrap gap-x-6 gap-y-1 text-bone">
        <li>{counts.dead} dead ({counts.buried} buried, {counts.forgotten} forgotten)</li>
        <li>{counts.haunted} haunted</li>
        <li>{counts.alive} alive</li>
        <li>{counts.unassessed} unassessed</li>
      </ul>
      {header.entriesSentence !== null ? <p className="text-bone-muted">{header.entriesSentence}</p> : null}
      <GradeLine grade={header.grade} />
    </section>
  );
}
