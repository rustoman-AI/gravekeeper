import type { AdapterReason, AttemptGate, RequestContext, SourceHeaders } from './http';

// Requirement 22.1, 22.11
export type SourceResult<T = unknown> =
  | {
      readonly kind: 'ok';
      readonly status: number;
      readonly body: T;
      readonly headers: SourceHeaders;
      readonly fromCache: boolean;
    }
  | { readonly kind: 'absent'; readonly headers: SourceHeaders; readonly fromCache: boolean }
  /** 2xx response that is not JSON. */
  | { readonly kind: 'unparsable'; readonly status: number; readonly headers: SourceHeaders }
  | {
      readonly kind: 'failed';
      readonly reason: AdapterReason;
      readonly status: number | null;
      readonly headers: SourceHeaders | null;
    };

export interface RepoCoordinates {
  readonly owner: string;
  readonly repo: string;
}

export interface GithubSource {
  /** True when a non-empty GITHUB_TOKEN is set. The token itself is never exposed. */
  hasToken(): boolean;
  /** EF-12. GET {api}/repos/{owner}/{repo}. Not cached. */
  getRepository(ref: RepoCoordinates, ctx: RequestContext, gate: AttemptGate): Promise<SourceResult>;
  /** EF-13. GET {api}/repos/{owner}/{repo}/branches/{branch}. Branch requested unchanged. Not cached. */
  getBranch(
    ref: RepoCoordinates,
    branch: string,
    ctx: RequestContext,
    gate: AttemptGate,
  ): Promise<SourceResult>;
  /** EF-14. GET {api}/repos/{owner}/{repo}/git/trees/{sha}?recursive=1. Cached, key includes sha. */
  getTree(
    ref: RepoCoordinates,
    commitSha: string,
    ctx: RequestContext,
    gate: AttemptGate,
  ): Promise<SourceResult>;
  /** EF-15. Raw host for github.com (no gate), blobs endpoint with gate for GHES. */
  getManifestText(
    ref: RepoCoordinates,
    commitSha: string,
    path: string,
    treeEntrySha: string | null,
    ctx: RequestContext,
    gate: AttemptGate,
  ): Promise<SourceResult<string>>;
  /** EF-17. POST {graphql}. Requires a token. */
  queryRepositories(
    query: string,
    variables: Readonly<Record<string, string>>,
    ctx: RequestContext,
    gate: AttemptGate,
  ): Promise<SourceResult>;
}
