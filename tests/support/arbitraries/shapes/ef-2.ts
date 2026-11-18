// EF-2: deps.dev version document shapes (GET /v3/systems/{system}/packages/{name}/versions/{version}).

export function ef2Project(id: unknown, relationType: unknown = 'SOURCE_REPO'): Record<string, unknown> {
  return { projectKey: { id }, relationType };
}

export function ef2Body(relatedProjects: readonly unknown[]): Record<string, unknown> {
  return {
    versionKey: { system: 'NPM', name: 'pkg', version: '1.0.0' },
    relatedProjects,
  };
}
