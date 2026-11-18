// EF-17: GraphQL repository response shapes.
import * as fc from 'fast-check';

export interface RepoNodeOptions {
  readonly isArchived?: unknown;
  readonly committedDate?: unknown;
  /** When true, `defaultBranchRef` is null. */
  readonly noBranch?: boolean;
}

export function repoNode(options: RepoNodeOptions = {}): Record<string, unknown> {
  const node: Record<string, unknown> = { nameWithOwner: 'o/n' };
  if ('isArchived' in options) node.isArchived = options.isArchived;
  else node.isArchived = false;
  node.defaultBranchRef = options.noBranch
    ? null
    : {
        name: 'main',
        target: { oid: 'a'.repeat(40), committedDate: options.committedDate ?? '2024-01-01T00:00:00Z' },
      };
  return node;
}

export function graphqlBody(
  data: Record<string, unknown> | null | undefined,
  errors?: readonly unknown[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (data !== undefined) body.data = data;
  if (errors !== undefined) body.errors = errors;
  return body;
}

// Property 33 / 75 generators.

/** Values that are not booleans, or `undefined` for a missing field. */
export const arbNonBoolean: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.string({ maxLength: 6 }),
  fc.integer(),
  fc.constantFrom('true', 'false', 0, 1, [], {}),
);

/** `committedDate` values that `dayCount` must reject, or `undefined` for missing. */
export const arbInvalidDate: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.integer(),
  fc.boolean(),
  fc.string({ maxLength: 8 }).filter((s) => !/\d{4}-/.test(s)),
  fc.constantFrom(
    '2024-02-30T00:00:00Z',
    '2024-13-01T00:00:00Z',
    '2024-01-01',
    '2024-01-01T25:00:00Z',
    '2024-01-01T00:00:00+01:00',
    '',
  ),
);

/** Valid timestamps not after the reference instant 2024-06-01T00:00:00Z. */
export const arbValidDate: fc.Arbitrary<string> = fc
  .date({ min: new Date('2000-01-01T00:00:00Z'), max: new Date('2024-06-01T00:00:00Z'), noInvalidDate: true })
  .map((d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z'));

/** Builds a node with independently present or missing `isArchived` and `committedDate`. */
export function rawNode(isArchived: unknown, committedDate: unknown): Record<string, unknown> {
  const node: Record<string, unknown> = { nameWithOwner: 'o/n' };
  if (isArchived !== undefined) node.isArchived = isArchived;
  node.defaultBranchRef =
    committedDate === undefined
      ? { name: 'main', target: { oid: 'a'.repeat(40) } }
      : { name: 'main', target: { oid: 'a'.repeat(40), committedDate } };
  return node;
}
