import type { Ecosystem } from '../core';
import curatedData from '../data/resurrections.json';
import { CURATED_MAX_ALTERNATIVES, CURATED_WHY_MAX_LENGTH } from './constants';
import { isValidName, normalizeName } from './resurrect-names';

// resurrect Requirements 7.4, 7.6: the Curated_Loader. Validates the raw data, drops what fails, never throws.
export interface CuratedEntry {
  readonly ecosystem: Ecosystem;
  readonly from: string;
  readonly to: readonly string[];
  readonly why: string;
  readonly source: string;
}

const ECOSYSTEMS: readonly Ecosystem[] = ['npm', 'pypi', 'cargo'];
const ENTRY_KEYS = ['ecosystem', 'from', 'to', 'why', 'source'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Requirement 6.6: one sentence, at most the limit, ends with a period, no URL, no line break.
function isValidWhy(why: unknown): why is string {
  if (typeof why !== 'string') return false;
  if (why.length === 0 || why.length > CURATED_WHY_MAX_LENGTH) return false;
  if (!why.endsWith('.')) return false;
  if (/[\u0000-\u001f\u007f\u0085\u2028\u2029]/.test(why)) return false;
  if (/:\/\/|www\./i.test(why)) return false;
  if (/[.!?]\s/.test(why)) return false;
  return true;
}

// Requirement 6.7: https, no credentials.
function isValidSource(source: unknown): source is string {
  if (typeof source !== 'string') return false;
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && url.hostname !== '' && url.username === '' && url.password === '';
}

function toEntry(raw: unknown): CuratedEntry | null {
  if (!isRecord(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.length !== ENTRY_KEYS.length || !ENTRY_KEYS.every((k) => keys.includes(k))) return null;
  const { ecosystem, from, to, why, source } = raw;
  if (typeof ecosystem !== 'string' || !(ECOSYSTEMS as readonly string[]).includes(ecosystem)) return null;
  const eco = ecosystem as Ecosystem;
  if (!isValidName(eco, from)) return null;
  if (!Array.isArray(to) || to.length < 1 || to.length > CURATED_MAX_ALTERNATIVES) return null;
  if (!to.every((name) => isValidName(eco, name))) return null;
  if (new Set(to as string[]).size !== to.length) return null;
  if (!isValidWhy(why) || !isValidSource(source)) return null;
  return { ecosystem: eco, from: from as string, to: [...(to as string[])], why, source };
}

/** Total: any input gives a list; failing entries and later duplicates of a normalized `from` are dropped. */
export function loadCurated(raw: unknown): CuratedEntry[] {
  try {
    if (!isRecord(raw) || !Array.isArray(raw['entries'])) return [];
    const seen = new Set<string>();
    const kept: CuratedEntry[] = [];
    for (const item of raw['entries'] as unknown[]) {
      const entry = toEntry(item);
      if (entry === null) continue;
      const key = indexKey(entry.ecosystem, entry.from);
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(entry);
    }
    return kept;
  } catch {
    return [];
  }
}

function indexKey(ecosystem: Ecosystem, name: string): string {
  return ecosystem + '\u0000' + normalizeName(ecosystem, name);
}

export const CURATED_ENTRIES: readonly CuratedEntry[] = loadCurated(curatedData);

const INDEX: ReadonlyMap<string, CuratedEntry> = new Map(
  CURATED_ENTRIES.map((entry) => [indexKey(entry.ecosystem, entry.from), entry] as const),
);

/** The entry whose normalized `from` equals the normalized name, or null. Total. */
export function lookupCurated(ecosystem: Ecosystem, name: string): CuratedEntry | null {
  if (typeof name !== 'string') return null;
  return INDEX.get(indexKey(ecosystem, name)) ?? null;
}
