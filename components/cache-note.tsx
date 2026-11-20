import { formatAge } from '../view-model';

export interface CacheNoteProps {
  cache: 'hit' | 'miss' | 'unknown';
  asOfIso: string;
  /** Browser clock in ms, passed by the caller. */
  nowMs: number;
}

/** Requirement 3.10: age text; the records wording appears only for a cache `hit`. */
export function CacheNote({ cache, asOfIso, nowMs }: CacheNoteProps) {
  const age = formatAge(asOfIso, nowMs);
  return (
    <span className="text-bone-muted">
      {cache === 'hit' ? `${age}, from the caretaker's records` : age}
    </span>
  );
}
