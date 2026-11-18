// EF-17: GraphQL repository response shapes.

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
