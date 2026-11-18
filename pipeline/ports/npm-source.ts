import type { RequestContext } from './http';
import type { SourceResult } from './github-source';

// Requirement 22.1, 22.11
export interface NpmSource {
  /** EF-20. GET https://registry.npmjs.org/{name}/latest. 404 is absent. */
  getLatest(name: string, ctx: RequestContext): Promise<SourceResult>;
}
