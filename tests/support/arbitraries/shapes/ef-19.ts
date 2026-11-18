// EF-19: GraphQL error shapes.

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
