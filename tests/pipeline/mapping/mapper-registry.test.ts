import { describe, expect, it } from 'vitest';
import {
  HELPERS,
  MAPPERS,
  MAPPER_REGISTRY,
  MAPPING_EXPORT_NAMES,
  REGISTERED_NAMES,
} from '../../support/mapper-registry';

// Validates: Requirements 13.10, 13.15

interface Comparison {
  readonly missing: readonly string[];
  readonly stale: readonly string[];
  readonly duplicates: readonly string[];
}

/** Compares the exported names with the registered names. */
function compareNames(exported: readonly string[], registered: readonly string[]): Comparison {
  const registeredSet = new Set(registered);
  const exportedSet = new Set(exported);
  const counts = new Map<string, number>();
  for (const n of registered) counts.set(n, (counts.get(n) ?? 0) + 1);
  return {
    missing: exported.filter((n) => !registeredSet.has(n)),
    stale: registered.filter((n) => !exportedSet.has(n)),
    duplicates: [...counts].filter(([, c]) => c > 1).map(([n]) => n),
  };
}

describe('mapper registry completeness', () => {
  it('registers every runtime export of pipeline/mapping exactly once', () => {
    expect(MAPPING_EXPORT_NAMES.length).toBeGreaterThan(0);
    expect(compareNames(MAPPING_EXPORT_NAMES, REGISTERED_NAMES)).toEqual({
      missing: [],
      stale: [],
      duplicates: [],
    });
  });

  it('splits the registry into mappers and helpers without loss', () => {
    expect(MAPPERS.length + HELPERS.length).toBe(MAPPER_REGISTRY.length);
  });

  it('gives every helper a non-empty reason', () => {
    for (const h of HELPERS) {
      expect(h.reason.trim().length, h.name).toBeGreaterThan(0);
    }
  });

  it('gives every mapper at least one variant and a validator', () => {
    for (const m of MAPPERS) {
      expect(m.variants.length, m.name).toBeGreaterThan(0);
      expect(typeof m.validate, m.name).toBe('function');
    }
  });

  describe('comparison', () => {
    it('reports an exported name that is not registered', () => {
      const removed = REGISTERED_NAMES[0] as string;
      const result = compareNames(
        MAPPING_EXPORT_NAMES,
        REGISTERED_NAMES.filter((n) => n !== removed),
      );
      expect(result.missing).toEqual([removed]);
    });

    it('reports a registered name that is not exported', () => {
      expect(compareNames(MAPPING_EXPORT_NAMES, [...REGISTERED_NAMES, 'notExported']).stale).toEqual([
        'notExported',
      ]);
    });

    it('reports a name registered twice', () => {
      const dup = REGISTERED_NAMES[0] as string;
      expect(compareNames(MAPPING_EXPORT_NAMES, [...REGISTERED_NAMES, dup]).duplicates).toEqual([dup]);
    });
  });
});
