// EF-19: GraphQL error shapes.
import * as fc from 'fast-check';

export function notFoundError(alias: string): Record<string, unknown> {
  return { type: 'NOT_FOUND', path: [alias], message: `Could not resolve to a Repository` };
}

export function foreignError(alias: string, type = 'FORBIDDEN'): Record<string, unknown> {
  return { type, path: [alias], message: 'denied' };
}

export function unattributableErrors(): readonly unknown[] {
  return [
    { message: 'no path', type: 'NOT_FOUND' },
    { message: 'unknown alias', type: 'INTERNAL', path: ['zzz'] },
    { message: 'empty path', path: [] },
    { message: 'numeric first', path: [0, 'x'] },
    null,
    'text',
  ];
}

// Property 75 generator.

/** Errors that name no alias of a batch whose aliases are `r<digits>`. */
export const arbUnattributableError: fc.Arbitrary<unknown> = fc.oneof(
  fc.record({ message: fc.string({ maxLength: 8 }), type: fc.constantFrom('NOT_FOUND', 'INTERNAL', 'FORBIDDEN') }),
  fc.record({
    message: fc.string({ maxLength: 8 }),
    type: fc.constantFrom('NOT_FOUND', 'INTERNAL'),
    path: fc.string({ maxLength: 5 }).map((s) => [`zzz${s}`, 'x']),
  }),
  fc.record({ message: fc.constant('empty'), type: fc.constant('NOT_FOUND'), path: fc.constant([]) }),
  fc.record({ message: fc.constant('num'), path: fc.integer().map((n) => [n, 'x']) }),
  fc.record({ message: fc.constant('notarray'), type: fc.constant('NOT_FOUND'), path: fc.constant('r0') }),
  fc.constantFrom(null, 'text', 7, true),
);
