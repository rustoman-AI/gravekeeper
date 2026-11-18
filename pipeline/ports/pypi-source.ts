import type { RequestContext } from './http';
import type { SourceResult } from './github-source';

// Requirement 22.1, 22.11
export interface PypiSource {
  /** EF-22. GET https://pypi.org/pypi/{name}/json. 404 is absent. */
  getProject(name: string, ctx: RequestContext): Promise<SourceResult>;
}
