import { dayCount } from './day-count';
import { readOwn } from './read-own';
import type { BatchEntry, SourceRepo } from './types';
import { readDepsDevVersions } from './version-select';

/** Structural twin of `VersionRequest` of the deps.dev port (mappers do not import ports). */
export interface DepsDevVersionRequest {
  readonly system: string;
  readonly name: string;
  readonly version: string;
}

export interface DepsDevPackageFacts {
  readonly daysSinceLastRelease: number | null;
  readonly deprecated: boolean | null;
  readonly defaultVersion: string | null;
  readonly versions: readonly string[];
}

/**
 * Reads a deps.dev package document (EF-1). Release age is the minimum
 * Day_Count over valid `publishedAt` values; `deprecated` is `isDeprecated`
 * of the Selected_Version entry. Total: never throws.
 */
// Requirement 8.2, 8.3, 8.4
export function mapDepsDevPackage(
  body: unknown,
  selectedVersion: string | null,
  asOf: string,
): DepsDevPackageFacts {
  const { defaultVersion, versions } = readDepsDevVersions(body);
  let daysSinceLastRelease: number | null = null;
  let deprecated: boolean | null = null;
  try {
    const list = readOwn(body, 'versions');
    if (Array.isArray(list)) {
      const length = list.length;
      let deprecatedDone = false;
      for (let i = 0; i < length; i++) {
        const entry = readOwn(list, String(i));
        if (typeof entry !== 'object' || entry === null) continue;
        const days = dayCount(readOwn(entry, 'publishedAt'), asOf);
        if (days !== null && (daysSinceLastRelease === null || days < daysSinceLastRelease)) {
          daysSinceLastRelease = days;
        }
        if (!deprecatedDone && selectedVersion !== null) {
          const version = readOwn(readOwn(entry, 'versionKey'), 'version');
          if (version === selectedVersion) {
            deprecatedDone = true;
            const flag = readOwn(entry, 'isDeprecated');
            deprecated = typeof flag === 'boolean' ? flag : null;
          }
        }
      }
    }
  } catch {
    // keep what was read
  }
  return { daysSinceLastRelease, deprecated, defaultVersion, versions };
}

/**
 * Reads a deps.dev version document (EF-2, also `responses[].version` of
 * EF-3): the first `SOURCE_REPO` entry whose id is `<host>/<owner>/<repo>`
 * with a host equal (case-insensitively) to `webHost`. Otherwise null.
 */
// Requirement 8.7, 2.8
export function mapDepsDevVersion(body: unknown, webHost: string): SourceRepo | null {
  try {
    const projects = readOwn(body, 'relatedProjects');
    if (!Array.isArray(projects)) return null;
    const length = projects.length;
    const host = typeof webHost === 'string' ? webHost.toLowerCase() : '';
    for (let i = 0; i < length; i++) {
      const entry = readOwn(projects, String(i));
      if (readOwn(entry, 'relationType') !== 'SOURCE_REPO') continue;
      const id = readOwn(readOwn(entry, 'projectKey'), 'id');
      if (typeof id !== 'string') continue;
      const parts = id.split('/');
      if (parts.length !== 3) continue;
      const [idHost, owner, name] = parts as [string, string, string];
      if (idHost.toLowerCase() !== 'github.com' || owner === '' || name === '') continue;
      return idHost.toLowerCase() === host ? { owner, name } : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Reads a `versionbatch` body (EF-3). One entry per request, in request
 * order. A response matches a request by `versionKey` (`name` and `version`
 * exact, `system` case-insensitive), never by position; the first matching
 * response wins. Null when `responses` is not an array.
 */
// Requirement 8.8, 8.9, 8.16
export function mapDepsDevVersionBatch(
  body: unknown,
  requests: readonly DepsDevVersionRequest[],
  webHost: string,
): readonly BatchEntry[] | null {
  try {
    const responses = readOwn(body, 'responses');
    if (!Array.isArray(responses)) return null;
    const keys: { system: string; name: string; version: string; response: unknown }[] = [];
    const length = responses.length;
    for (let i = 0; i < length; i++) {
      const response = readOwn(responses, String(i));
      const key = readOwn(readOwn(response, 'request'), 'versionKey');
      const system = readOwn(key, 'system');
      const name = readOwn(key, 'name');
      const version = readOwn(key, 'version');
      if (typeof system !== 'string' || typeof name !== 'string' || typeof version !== 'string') {
        continue;
      }
      keys.push({ system: system.toLowerCase(), name, version, response });
    }
    return requests.map((request): BatchEntry => {
      const system = String(request.system).toLowerCase();
      const hit = keys.find(
        (k) => k.system === system && k.name === request.name && k.version === request.version,
      );
      if (hit === undefined) return { found: false };
      return { found: true, sourceRepo: mapDepsDevVersion(readOwn(hit.response, 'version'), webHost) };
    });
  } catch {
    return null;
  }
}
