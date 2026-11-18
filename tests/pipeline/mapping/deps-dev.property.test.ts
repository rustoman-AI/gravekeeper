import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { dayCount } from '../../../pipeline/mapping/day-count';
import { mapDepsDevPackage, mapDepsDevVersionBatch } from '../../../pipeline/mapping/deps-dev';
import { cfg } from '../../support/fc-config';
import { ef1Body, ef1Version } from '../../support/arbitraries/shapes/ef-1';
import { ef2Project } from '../../support/arbitraries/shapes/ef-2';
import { ef3Body, ef3Response } from '../../support/arbitraries/shapes/ef-3';

const MIN_MS = -62135596800000;
const MAX_MS = 253402300799999;
const iso = (ms: number): string => new Date(ms).toISOString();

const arbInstant = fc.integer({ min: MIN_MS, max: MAX_MS }).map(iso);

describe('deps.dev mapper properties', () => {
  // Feature: scan-pipeline, Property 18: Release age is the minimum Day_Count over valid timestamps
  // Validates: Requirements 8.13
  it('daysSinceLastRelease is the minimum Day_Count and is permutation invariant', () => {
    fc.assert(
      fc.property(
        fc.array(arbInstant, { minLength: 1, maxLength: 12 }),
        arbInstant,
        (stamps, asOf) => {
          const versions = stamps.map((publishedAt, i) => ef1Version({ version: `1.0.${i}`, publishedAt }));
          const counts = stamps.map((s) => dayCount(s, asOf));
          const valid = counts.filter((c): c is number => c !== null);
          const expected = valid.length === 0 ? null : Math.min(...valid);
          const forward = mapDepsDevPackage(ef1Body(versions), null, asOf).daysSinceLastRelease;
          const reversed = mapDepsDevPackage(ef1Body([...versions].reverse()), null, asOf).daysSinceLastRelease;
          return forward === expected && reversed === expected;
        },
      ),
      cfg(),
    );
  });

  it('daysSinceLastRelease is permutation invariant for any shuffle', () => {
    fc.assert(
      fc.property(
        fc
          .array(arbInstant, { minLength: 1, maxLength: 12 })
          .chain((stamps) =>
            fc.tuple(fc.constant(stamps), fc.shuffledSubarray(stamps, { minLength: stamps.length, maxLength: stamps.length })),
          ),
        arbInstant,
        ([stamps, shuffled], asOf) => {
          const build = (list: readonly string[]) =>
            ef1Body(list.map((publishedAt, i) => ef1Version({ version: `1.0.${i}`, publishedAt })));
          const a = mapDepsDevPackage(build(stamps), null, asOf).daysSinceLastRelease;
          const b = mapDepsDevPackage(build(shuffled), null, asOf).daysSinceLastRelease;
          return a === b;
        },
      ),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 19: Batch responses are matched by key, not by position
  // Validates: Requirements 8.16
  it('batch results do not depend on the order of responses', () => {
    const arbKey = fc.record({
      system: fc.constantFrom('NPM', 'npm', 'PYPI', 'CARGO'),
      name: fc.constantFrom('a', 'b', 'c'),
      version: fc.constantFrom('1.0.0', '2.0.0'),
    });
    const arbId = fc.oneof(
      fc.constantFrom('github.com/o/r', 'github.com/x/y', 'gitlab.com/o/r', 'GitHub.com/o/r', 'github.com/o'),
      fc.string(),
    );
    const arbProjects = fc.option(
      fc.array(
        fc.tuple(arbId, fc.constantFrom('SOURCE_REPO', 'ISSUE_TRACKER')).map(([id, rel]) => ef2Project(id, rel)),
        { maxLength: 3 },
      ),
      { nil: undefined },
    );
    fc.assert(
      fc.property(
        // Scope (user decision, option A): Property 19 covers bodies whose response keys are
        // distinct (system case-insensitive, name and version exact). A repeated key falls
        // under criterion 8.9's first-match rule, pinned by an example test below.
        fc.uniqueArray(fc.tuple(arbKey, arbProjects), {
          maxLength: 8,
          selector: ([key]) => `${key.system.toLowerCase()}\u0000${key.name}\u0000${key.version}`,
        }),
        fc.array(arbKey, { maxLength: 6 }),
        fc.nat(),
        (entries, requests, rot) => {
          const responses = entries.map(([key, projects]) => ef3Response(key, projects));
          const k = responses.length === 0 ? 0 : rot % responses.length;
          const permutations = [
            [...responses].reverse(),
            [...responses.slice(k), ...responses.slice(0, k)],
          ];
          const base = mapDepsDevVersionBatch(ef3Body(responses), requests, 'github.com');
          return permutations.every((p) => {
            const other = mapDepsDevVersionBatch(ef3Body(p), requests, 'github.com');
            return JSON.stringify(base) === JSON.stringify(other);
          });
        },
      ),
      cfg(),
    );
  });

  // Requirement 8.9: when a key repeats, the first matching response wins.
  it('repeated response keys follow the first matching response', () => {
    const key = { system: 'NPM', name: 'c', version: '1.0.0' };
    const requests = [key];
    const withoutVersion = ef3Response(key);
    const withRepo = ef3Response(key, [ef2Project('github.com/o/r', 'SOURCE_REPO')]);
    expect(mapDepsDevVersionBatch(ef3Body([withoutVersion, withRepo]), requests, 'github.com')).toEqual([
      { found: true, sourceRepo: null },
    ]);
    expect(mapDepsDevVersionBatch(ef3Body([withRepo, withoutVersion]), requests, 'github.com')).toEqual([
      { found: true, sourceRepo: { owner: 'o', name: 'r' } },
    ]);
  });
});
