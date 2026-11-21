/*
 * The one place where the version to look up is chosen (Requirements 3.1, 3.6 to 3.9).
 * Total: never throws.
 */
import type { Ecosystem } from '@/core';
import { RANGE_MAX_LENGTH } from '../constants';
import { compareCodePoints } from './compare-code-points';
import { resolveRange } from './range-resolve';
import type { VersionSelection } from './types';
import { exactPin, selectVersion } from './version-select';

function cut(range: string): string {
  if (range.length <= RANGE_MAX_LENGTH) return range;
  return Array.from(range).slice(0, RANGE_MAX_LENGTH).join('');
}

// Requirement 3.1, 3.6, 3.7, 3.8, 3.9
export function chooseVersion(
  ecosystem: unknown,
  specs: readonly unknown[],
  versions: readonly string[],
  defaultVersion: string | null,
): VersionSelection {
  try {
    const pins: string[] = [];
    const rangeSet = new Set<string>();
    for (const spec of specs) {
      const pin = exactPin(spec, ecosystem);
      if (pin !== null) pins.push(pin);
      else if (typeof spec === 'string' && spec.trim() !== '') {
        const text = spec.trim();
        // Requirement 10.5 (pyproject): for pypi, `*` is no Declared_Range, like an empty spec.
        // npm and cargo keep `*` as a range.
        if (ecosystem === 'pypi' && text === '*') continue;
        rangeSet.add(text);
      }
    }
    if (pins.length > 0) return selectVersion(pins, versions, defaultVersion);
    const ranges = [...rangeSet].sort(compareCodePoints);
    if (ranges.length === 0) return selectVersion([], versions, defaultVersion);

    const outcome = resolveRange(ecosystem as Ecosystem, ranges, versions);
    if (outcome.kind === 'resolved') {
      return { selected: outcome.version, basis: 'resolved', notes: [] };
    }
    const fallback = selectVersion([], versions, defaultVersion);
    const note = { code: 'range-unresolved', ranges: ranges.map(cut) } as const;
    return { ...fallback, notes: [note, ...fallback.notes] };
  } catch {
    return selectVersion([], versions, defaultVersion);
  }
}
