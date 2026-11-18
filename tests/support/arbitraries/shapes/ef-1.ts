// EF-1: deps.dev package document shapes (GET /v3/systems/{system}/packages/{name}).

export interface Ef1Version {
  readonly version: unknown;
  readonly publishedAt?: unknown;
  readonly isDefault?: unknown;
  readonly isDeprecated?: unknown;
}

export function ef1Version(spec: Ef1Version): Record<string, unknown> {
  const entry: Record<string, unknown> = { versionKey: { system: 'NPM', name: 'pkg', version: spec.version } };
  if ('publishedAt' in spec) entry.publishedAt = spec.publishedAt;
  if ('isDefault' in spec) entry.isDefault = spec.isDefault;
  if ('isDeprecated' in spec) entry.isDeprecated = spec.isDeprecated;
  return entry;
}

export function ef1Body(versions: readonly unknown[]): unknown {
  return { packageKey: { system: 'NPM', name: 'pkg' }, versions };
}
