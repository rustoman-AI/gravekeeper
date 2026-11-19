/*
 * Resolution of Declared_Ranges to one listed version (Requirements 3.2 to 3.6).
 * Total: any input gives `resolved` or `unresolved`, never a throw.
 */
import type { Ecosystem } from '@/core';
import { RANGE_MAX_LENGTH } from '../constants';
import { cargoToSemverRange } from './range-cargo';
import { pepCompare, pepRange, pepSatisfies, pepVersion } from './range-pep440';
import { semverCompare, semverIsPrerelease, semverRange, semverSatisfies, semverVersion } from './range-semver';

export type RangeOutcome =
  | { readonly kind: 'resolved'; readonly version: string }
  | { readonly kind: 'unresolved' };

const UNRESOLVED: RangeOutcome = { kind: 'unresolved' };

interface Engine {
  readonly toRange: (range: string) => string | null;
  readonly isCandidate: (version: string) => boolean;
  readonly compare: (a: string, b: string) => number;
  readonly satisfies: (version: string, range: string) => boolean;
}

const SEMVER_ENGINE: Engine = {
  toRange: semverRange,
  isCandidate: (v) => semverVersion(v) !== null && !semverIsPrerelease(v),
  compare: semverCompare,
  satisfies: semverSatisfies,
};

const ENGINES: Readonly<Record<Ecosystem, Engine>> = {
  npm: SEMVER_ENGINE,
  cargo: {
    ...SEMVER_ENGINE,
    toRange: (r) => {
      const mapped = cargoToSemverRange(r);
      return mapped === null ? null : semverRange(mapped);
    },
  },
  pypi: {
    toRange: pepRange,
    isCandidate: (v) => {
      const parsed = pepVersion(v);
      return parsed !== null && !parsed.isPrerelease;
    },
    compare: pepCompare,
    satisfies: pepSatisfies,
  },
};

function engineFor(ecosystem: unknown): Engine | null {
  return ecosystem === 'npm' || ecosystem === 'cargo' || ecosystem === 'pypi' ? ENGINES[ecosystem] : null;
}

function tooLong(range: string): boolean {
  // Cheap bound first: code points never exceed UTF-16 length.
  return range.length > RANGE_MAX_LENGTH && Array.from(range).length > RANGE_MAX_LENGTH;
}

export function resolveRange(ecosystem: Ecosystem, ranges: readonly string[], versions: readonly string[]): RangeOutcome {
  try {
    const engine = engineFor(ecosystem);
    if (engine === null || ranges.length === 0) return UNRESOLVED;
    const compiled: string[] = [];
    for (const range of ranges) {
      if (typeof range !== 'string' || tooLong(range)) return UNRESOLVED;
      const out = engine.toRange(range);
      if (out === null) return UNRESOLVED;
      compiled.push(out);
    }
    let best: string | null = null;
    const seen = new Set<string>();
    for (const v of versions) {
      if (typeof v !== 'string' || seen.has(v)) continue;
      seen.add(v);
      if (!engine.isCandidate(v)) continue;
      if (!compiled.every((r) => engine.satisfies(v, r))) continue;
      if (best === null || engine.compare(v, best) > 0) best = v;
    }
    return best === null ? UNRESOLVED : { kind: 'resolved', version: best };
  } catch {
    return UNRESOLVED;
  }
}
