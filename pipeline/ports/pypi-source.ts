import type { RequestContext } from './http';
import type { SourceResult } from './github-source';

// Requirement 22.1, 22.11
export interface PypiSource {
  /** EF-22. GET https://pypi.org/pypi/{name}/{version}/json, `version` = the Selected_Version (R12.5).
   *  404 is absent. The orchestrator calls it only when the Selected_Version is set (R12.16). */
  getProject(name: string, version: string, ctx: RequestContext): Promise<SourceResult>;
}
