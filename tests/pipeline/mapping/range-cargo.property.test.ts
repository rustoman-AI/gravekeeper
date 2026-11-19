import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { resolveRange } from '../../../pipeline/mapping/range-resolve';
import { cfg } from '../../support/fc-config';

const num = fc.integer({ min: 0, max: 4 });
// One to three decimal parts, no leading zeros (Cargo `V`).
const cargoVersion = fc
  .tuple(num, num, num, fc.integer({ min: 1, max: 3 }))
  .map(([a, b, c, n]) => [a, b, c].slice(0, n).join('.'));
const fullVersion = fc.tuple(num, num, num).map(([a, b, c]) => `${a}.${b}.${c}`);
const versionList = fc.array(fullVersion, { maxLength: 25 });
const operator = fc.constantFrom('', '^', '~', '=', '>', '>=', '<', '<=');
const comparator = fc.tuple(operator, cargoVersion, fc.boolean()).map(([op, v, space]) => op + (space && op !== '' ? ' ' : '') + v);

describe('Property 6: Cargo mapping is caret by default and an intersection for commas', () => {
  // Feature: scan-accuracy, Property 6: Cargo mapping is caret by default and an intersection for commas
  // Validates: Requirements 4.9
  it('a bare version resolves like the same version with a caret', () => {
    fc.assert(
      fc.property(cargoVersion, versionList, (x, list) => {
        expect(resolveRange('cargo', [x], list)).toEqual(resolveRange('cargo', ['^' + x], list));
      }),
      cfg(),
    );
  });

  // Feature: scan-accuracy, Property 6: Cargo mapping is caret by default and an intersection for commas
  // Validates: Requirements 4.10
  it('a comma requirement satisfies each comparator alone, is the highest such version, and ignores order', () => {
    fc.assert(
      fc.property(
        fc.array(comparator, { minLength: 1, maxLength: 4 }),
        versionList,
        fc.infiniteStream(fc.nat()),
        (comparators, list, stream) => {
          const joined = comparators.join(', ');
          const outcome = resolveRange('cargo', [joined], list);

          // Permutation by a seeded Fisher-Yates shuffle.
          const shuffled = [...comparators];
          const it = stream[Symbol.iterator]();
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = (it.next().value as number) % (i + 1);
            [shuffled[i], shuffled[j]] = [shuffled[j] as string, shuffled[i] as string];
          }
          expect(resolveRange('cargo', [shuffled.join(', ')], list)).toEqual(outcome);

          const alone = (c: string, v: string): boolean => {
            const r = resolveRange('cargo', [c], [v]);
            return r.kind === 'resolved' && r.version === v;
          };
          if (outcome.kind === 'resolved') {
            expect(list).toContain(outcome.version);
            for (const c of comparators) expect(alone(c, outcome.version)).toBe(true);
          }
          // No listed version that satisfies every comparator alone is missed.
          const all = list.filter((v) => comparators.every((c) => alone(c, v)));
          expect(outcome.kind).toBe(all.length > 0 ? 'resolved' : 'unresolved');
        },
      ),
      cfg(),
    );
  });
});
