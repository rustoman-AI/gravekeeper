import type { HeaderModel } from '../view-model';
import { CacheNote } from './cache-note';
import { GradePlaque } from './grade-plaque';
import { StatusChip } from './status-chip';

export interface ResultsHeaderProps {
  header: HeaderModel;
  cache: 'hit' | 'miss' | 'unknown';
  /** Browser clock in ms, passed by the caller. */
  nowMs: number;
}

/**
 * Graveyard-art Requirements 5.1 to 5.4, 5.6 to 5.8 and graveyard-ui 3.10. Renders HeaderModel fields only.
 * The repo name is the page's only h1; the headline is a large paragraph.
 */
export function ResultsHeader({ header, cache, nowMs }: ResultsHeaderProps) {
  const grade = header.grade;
  const meta = (
    <p className="text-sm text-bone-muted">
      Commit <abbr title={header.fullSha}>{header.shortSha}</abbr>
      <span className="sr-only"> (full SHA {header.fullSha})</span>, branch {header.branch}
      {header.notDefaultBranch ? ' (not the default branch)' : ''}, as of{' '}
      <time dateTime={header.asOfIso}>{header.asOfText}</time>. <CacheNote cache={cache} asOfIso={header.asOfIso} nowMs={nowMs} />
    </p>
  );
  if (grade === null) {
    // Graveyard-art R11.1, 11.4: no plaque, chips, headline or grade scale; at most one sentence.
    return (
      <section aria-label="Scan summary" className="flex flex-col gap-4">
        <h1 id="results-heading" tabIndex={-1} className="font-display text-2xl text-bone">
          {header.repoName}
        </h1>
        {header.emptySentence !== null ? <p className="gk-headline gk-headline-empty">{header.emptySentence}</p> : null}
        {meta}
      </section>
    );
  }
  return (
    <section aria-label="Scan summary" className="gk-results-header">
      <h1 id="results-heading" tabIndex={-1} className="font-display text-2xl text-bone">
        {header.repoName}
      </h1>
      <p className="gk-headline">{header.headline !== null ? header.headline.text : null}</p>
      <div className="gk-results-header-detail">
        <GradePlaque grade={grade} />
        <ul aria-label="Status counts" className="gk-results-header-chips">
          {header.chips.map((chip) => (
            <StatusChip key={chip.status} chip={chip} />
          ))}
        </ul>
      </div>
      {meta}
      {header.entriesSentence !== null ? <p className="text-bone-muted">{header.entriesSentence}</p> : null}
    </section>
  );
}
