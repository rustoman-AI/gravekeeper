import { LABEL_MAX_LINES } from './constants';

/** 0.6 em of the 12 px label font: a high estimate for lowercase package names. */
export const LABEL_CHAR_WIDTH_PX = 7.2;

/** Splits after every "-" or "/". The segments joined give the input back. */
export function labelSegments(name: string): string[] {
  const segments: string[] = [];
  let start = 0;
  for (let i = 0; i < name.length; i += 1) {
    const ch = name[i];
    if (ch === '-' || ch === '/') {
      segments.push(name.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < name.length) segments.push(name.slice(start));
  return segments;
}

/**
 * Greedy line fill by segments. A segment longer than `capacity` is cut into chunks of
 * `capacity` characters (the model of overflow-wrap: anywhere).
 */
export function wrapLabel(name: string, capacity: number): string[] {
  const cap = Math.max(1, Math.floor(capacity));
  const lines: string[] = [];
  let current = '';
  for (const segment of labelSegments(name)) {
    if (current.length + segment.length <= cap) {
      current += segment;
      continue;
    }
    if (current.length > 0) {
      lines.push(current);
      current = '';
    }
    let rest = segment;
    while (rest.length > cap) {
      lines.push(rest.slice(0, cap));
      rest = rest.slice(cap);
    }
    current = rest;
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/** True when the model needs more than LABEL_MAX_LINES lines for a box of `widthPx`. */
export function mayTruncateLabel(name: string, widthPx: number): boolean {
  const capacity = Math.max(1, Math.floor(widthPx / LABEL_CHAR_WIDTH_PX));
  return wrapLabel(name, capacity).length > LABEL_MAX_LINES;
}
