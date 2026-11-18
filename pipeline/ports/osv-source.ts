import type { RequestContext } from './http';
import type { SourceResult } from './github-source';

// Requirement 22.1, 22.11
export type OsvEcosystem = 'npm' | 'PyPI' | 'crates.io';

export interface OsvQuery {
  readonly name: string;
  readonly ecosystem: OsvEcosystem;
  readonly version: string;
}

export interface OsvSource {
  /** EF-5. POST /v1/querybatch with at most OSV_BATCH_SIZE queries. */
  queryBatch(queries: readonly OsvQuery[], ctx: RequestContext): Promise<SourceResult>;
  /** EF-6. GET /v1/vulns/{id}. A 404 is failed and never stored. L2 kind `osv-advisory`. */
  getVulnerability(id: string, ctx: RequestContext): Promise<SourceResult>;
}
