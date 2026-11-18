import type { RequestContext } from './http';
import type { SourceResult } from './github-source';

// Requirement 22.1, 22.11
export type DepsDevSystem = 'npm' | 'pypi' | 'cargo';

export interface VersionRequest {
  readonly system: DepsDevSystem;
  readonly name: string;
  readonly version: string;
}

export interface DepsDevSource {
  /** EF-1. GET /v3/systems/{system}/packages/{name}. 404 is absent. */
  getPackage(system: DepsDevSystem, name: string, ctx: RequestContext): Promise<SourceResult>;
  /** EF-2. GET .../packages/{name}/versions/{version}. */
  getVersion(
    system: DepsDevSystem,
    name: string,
    version: string,
    ctx: RequestContext,
  ): Promise<SourceResult>;
  /** EF-3. POST /v3alpha/versionbatch with at most DEPSDEV_BATCH_SIZE requests. */
  getVersionBatch(requests: readonly VersionRequest[], ctx: RequestContext): Promise<SourceResult>;
  /** EF-25. GET /v3/advisories/{id}. 404 is absent. L2 kind `depsdev-advisory`. */
  getAdvisory(id: string, ctx: RequestContext): Promise<SourceResult>;
}
