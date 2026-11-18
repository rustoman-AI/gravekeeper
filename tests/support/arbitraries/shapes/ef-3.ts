// EF-3: deps.dev versionbatch response shapes (POST /v3alpha/versionbatch).

import { ef2Body } from './ef-2';

export interface Ef3Key {
  readonly system: unknown;
  readonly name: unknown;
  readonly version: unknown;
}

export function ef3Response(key: Ef3Key, relatedProjects?: readonly unknown[]): Record<string, unknown> {
  const response: Record<string, unknown> = { request: { versionKey: key } };
  if (relatedProjects !== undefined) response.version = ef2Body(relatedProjects);
  return response;
}

export function ef3Body(responses: readonly unknown[]): unknown {
  return { responses };
}
