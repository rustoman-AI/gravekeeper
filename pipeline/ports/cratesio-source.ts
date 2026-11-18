import type { RequestContext } from './http';
import type { SourceResult } from './github-source';

// Requirement 22.1, 22.11, 12.13
export interface CratesIoSource {
  /** EF-21. GET https://crates.io/api/v1/crates/{name}/owners. L2 kind `crates-owners`. */
  getOwners(name: string, ctx: RequestContext): Promise<SourceResult>;
}
