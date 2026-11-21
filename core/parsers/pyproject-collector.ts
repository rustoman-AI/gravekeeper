// Shared types and helpers of the pyproject.toml collectors (design: "Components and Interfaces").
//
// All reads use Object.hasOwn and Object.entries, so inherited properties are never picked up and
// `__proto__` is an ordinary key (Requirement 2.7).
import type { Candidate } from './finish';

/** Output of one collector: ranked candidates and parser warnings, both appended in Table_Rank order. */
export interface Collector {
  readonly candidates: Candidate[];
  readonly warnings: string[];
}

/** Facts about the file that a collector needs. */
export interface PyprojectContext {
  /** PEP 503 normalized `[project].name`, or null when the file has no string name. */
  readonly projectName: string | null;
}

// Requirement 2.6: a quoted fragment holds at most 60 code points.
const MAX_QUOTED_POINTS = 60;

const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const LONE_SURROGATE_GLOBAL = new RegExp(LONE_SURROGATE.source, 'g');
// Control characters and line separators would break the one-line rule of a warning.
const LINE_BREAKING = /[\u0000-\u001f\u007f\u0085\u2028\u2029]/g;

/** True for a plain TOML table (not an array, not a date, not null). */
export function isTable(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

/** Reads an own property; an inherited one is `undefined`. */
export function ownValue(table: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

// Requirement 2.7
/** True when the text holds a UTF-16 surrogate that has no partner. */
export function hasLoneSurrogate(text: string): boolean {
  return LONE_SURROGATE.test(text);
}

// Requirement 2.6
/**
 * Bounds a fragment to 60 code points, ending in an ellipsis when cut. Lone surrogates become U+FFFD and
 * control characters become spaces, so a warning stays one line of well-formed text.
 */
export function bounded(text: string): string {
  const clean = text.replace(LONE_SURROGATE_GLOBAL, '\ufffd').replace(LINE_BREAKING, ' ');
  const points = Array.from(clean);
  if (points.length <= MAX_QUOTED_POINTS) return clean;
  return `${points.slice(0, MAX_QUOTED_POINTS - 1).join('')}\u2026`;
}

// Requirement 2.6
/** A bounded fragment inside double quotes, for a name, a constraint or a requirement text in a warning. */
export function quoted(text: string): string {
  return `"${bounded(text)}"`;
}
