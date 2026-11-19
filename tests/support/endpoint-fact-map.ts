// Requirement 23.13
// The Endpoint_Fact_Map of requirements.md as data. Row ids, field paths and
// verification status are copied from that section (EF-1 to EF-25).
//
// Path syntax: `a.b` object member, `a[]` every array element, `rN` matches
// any GraphQL alias (`r0`, `r1`, ...), `headers.<Name>` a response header
// (case-insensitive), and `$body` the response body text.

export type EndpointSource = 'depsdev' | 'osv' | 'github' | 'npm' | 'cratesio' | 'pypi';

export interface RequestMatcher {
  readonly method: 'GET' | 'POST';
  /** Matched against the full request URL. */
  readonly url: RegExp;
}

export interface EndpointFactRow {
  readonly id: string;
  readonly source: EndpointSource;
  /** True when the Verification column reports a live HTTP verification of the row. */
  readonly verified: boolean;
  readonly requiresToken: boolean;
  readonly requestMatcher: RequestMatcher;
  readonly paths: readonly string[];
  /** Paths the Verification column marks as Not verified (not required by the coverage test). */
  readonly notVerifiedPaths?: readonly string[];
}

const DEPSDEV_PACKAGE = /^https:\/\/api\.deps\.dev\/v3\/systems\/(npm|pypi|cargo)\/packages\/[^/?#]+$/;
const DEPSDEV_VERSION = /^https:\/\/api\.deps\.dev\/v3\/systems\/(npm|pypi|cargo)\/packages\/[^/?#]+\/versions\/[^/?#]+$/;
const OSV_VULN = /^https:\/\/api\.osv\.dev\/v1\/vulns\/[^/?#]+$/;
const GH_REPO = /\/repos\/[^/?#]+\/[^/?#]+$/;

export const ENDPOINT_FACT_MAP: readonly EndpointFactRow[] = [
  {
    id: 'EF-1',
    source: 'depsdev',
    verified: true,
    requiresToken: false,
    requestMatcher: { method: 'GET', url: DEPSDEV_PACKAGE },
    paths: [
      'versions[].publishedAt',
      'versions[].isDefault',
      'versions[].isDeprecated',
      'versions[].versionKey.version',
      'packageKey.system',
    ],
  },
  {
    id: 'EF-2',
    source: 'depsdev',
    verified: true,
    requiresToken: false,
    requestMatcher: { method: 'GET', url: DEPSDEV_VERSION },
    paths: ['relatedProjects[].projectKey.id', 'relatedProjects[].relationType'],
  },
  {
    id: 'EF-3',
    source: 'depsdev',
    verified: true,
    requiresToken: false,
    requestMatcher: { method: 'POST', url: /^https:\/\/api\.deps\.dev\/v3alpha\/versionbatch$/ },
    paths: ['responses[].request', 'responses[].version', 'nextPageToken'],
    notVerifiedPaths: ['nextPageToken'],
  },
  {
    id: 'EF-4',
    source: 'depsdev',
    verified: true,
    requiresToken: false,
    requestMatcher: { method: 'GET', url: /^https:\/\/api\.deps\.dev\/v3\/projects\/[^/?#]+$/ },
    paths: [
      'openIssuesCount',
      'starsCount',
      'forksCount',
      'scorecard.checks[].name',
      'scorecard.overallScore',
    ],
  },
  {
    id: 'EF-5',
    source: 'osv',
    verified: true,
    requiresToken: false,
    requestMatcher: { method: 'POST', url: /^https:\/\/api\.osv\.dev\/v1\/querybatch$/ },
    paths: ['results[]', 'results[].vulns[].id', 'results[].vulns[].modified'],
  },
  {
    id: 'EF-6',
    source: 'osv',
    verified: true,
    requiresToken: false,
    requestMatcher: { method: 'GET', url: OSV_VULN },
    paths: ['id', 'aliases', 'withdrawn', 'database_specific', 'affected[]', 'severity[]'],
  },
  {
    id: 'EF-7',
    source: 'osv',
    verified: true,
    requiresToken: false,
    requestMatcher: { method: 'GET', url: OSV_VULN },
    paths: ['database_specific.severity', 'severity[].score', 'severity[].type'],
  },
  {
    id: 'EF-8',
    source: 'osv',
    verified: true,
    requiresToken: false,
    requestMatcher: { method: 'GET', url: OSV_VULN },
    paths: ['withdrawn'],
  },
  {
    id: 'EF-9',
    source: 'osv',
    verified: true,
    requiresToken: false,
    requestMatcher: { method: 'GET', url: OSV_VULN },
    paths: ['aliases'],
  },
  {
    id: 'EF-10',
    source: 'osv',
    verified: true,
    requiresToken: false,
    requestMatcher: { method: 'GET', url: OSV_VULN },
    paths: ['affected[].database_specific.informational'],
  },
  {
    id: 'EF-11',
    source: 'osv',
    verified: false,
    requiresToken: false,
    requestMatcher: { method: 'POST', url: /^https:\/\/api\.osv\.dev\/v1\/querybatch$/ },
    paths: ['results[].next_page_token'],
    notVerifiedPaths: ['results[].next_page_token'],
  },
  {
    id: 'EF-12',
    source: 'github',
    verified: true,
    requiresToken: false,
    requestMatcher: { method: 'GET', url: GH_REPO },
    paths: [
      'full_name',
      'default_branch',
      'private',
      'visibility',
      'archived',
      'disabled',
      'pushed_at',
    ],
  },
  {
    id: 'EF-13',
    source: 'github',
    verified: true,
    requiresToken: false,
    requestMatcher: { method: 'GET', url: /\/repos\/[^/?#]+\/[^/?#]+\/branches\/.+$/ },
    paths: ['commit.sha'],
  },
  {
    id: 'EF-14',
    source: 'github',
    verified: true,
    requiresToken: false,
    requestMatcher: { method: 'GET', url: /\/repos\/[^/?#]+\/[^/?#]+\/git\/trees\/[^/?#]+\?recursive=1$/ },
    paths: ['tree[].path', 'tree[].type', 'tree[].sha', 'tree[].size', 'truncated'],
  },
  {
    id: 'EF-15',
    source: 'github',
    verified: true,
    requiresToken: false,
    requestMatcher: {
      method: 'GET',
      url: /^https:\/\/raw\.githubusercontent\.com\/[^/?#]+\/[^/?#]+\/[^/?#]+\/.+$/,
    },
    paths: ['$body'],
  },
  {
    id: 'EF-16',
    source: 'github',
    verified: true,
    requiresToken: false,
    requestMatcher: { method: 'GET', url: /\/repos\// },
    paths: [
      'headers.X-RateLimit-Limit',
      'headers.X-RateLimit-Remaining',
      'headers.X-RateLimit-Used',
      'headers.X-RateLimit-Resource',
      'headers.X-RateLimit-Reset',
    ],
  },
  {
    id: 'EF-17',
    source: 'github',
    verified: true,
    requiresToken: true,
    requestMatcher: { method: 'POST', url: /\/graphql$/ },
    paths: [
      'data.rN.nameWithOwner',
      'data.rN.isArchived',
      'data.rN.isDisabled',
      'data.rN.pushedAt',
      'data.rN.defaultBranchRef.name',
      'data.rN.defaultBranchRef.target.committedDate',
      'data.rN.defaultBranchRef.target.oid',
    ],
  },
  {
    id: 'EF-18',
    source: 'github',
    verified: true,
    requiresToken: true,
    requestMatcher: { method: 'POST', url: /\/graphql$/ },
    paths: [
      'data.rateLimit.limit',
      'data.rateLimit.remaining',
      'data.rateLimit.used',
      'data.rateLimit.cost',
      'data.rateLimit.resetAt',
      'data.rateLimit.nodeCount',
      'headers.X-RateLimit-Limit',
      'headers.X-RateLimit-Remaining',
      'headers.X-RateLimit-Used',
      'headers.X-RateLimit-Resource',
      'headers.X-RateLimit-Reset',
    ],
  },
  {
    id: 'EF-19',
    source: 'github',
    // NOT_FOUND verified live (HTTP); other error types are Not verified.
    verified: true,
    requiresToken: true,
    requestMatcher: { method: 'POST', url: /\/graphql$/ },
    paths: ['errors[].type', 'errors[].path', 'errors[].message'],
  },
  {
    id: 'EF-20',
    source: 'npm',
    verified: true,
    requiresToken: false,
    requestMatcher: { method: 'GET', url: /^https:\/\/registry\.npmjs\.org\/[^?#]+\/latest$/ },
    paths: ['maintainers[]', 'maintainers[].name', 'maintainers[].email', 'deprecated'],
  },
  {
    id: 'EF-21',
    source: 'cratesio',
    verified: true,
    requiresToken: false,
    requestMatcher: { method: 'GET', url: /^https:\/\/crates\.io\/api\/v1\/crates\/[^/?#]+\/owners$/ },
    paths: ['users[].login', 'users[].kind'],
  },
  {
    id: 'EF-22',
    source: 'pypi',
    verified: true,
    requiresToken: false,
    requestMatcher: { method: 'GET', url: /^https:\/\/pypi\.org\/pypi\/[^/?#]+\/[^/?#]+\/json$/ },
    paths: ['ownership.roles[].role', 'ownership.roles[].user', 'ownership.organization'],
    notVerifiedPaths: ['ownership.organization'],
  },
  {
    id: 'EF-23',
    source: 'github',
    verified: false,
    requiresToken: false,
    requestMatcher: { method: 'GET', url: /^https:\/\// },
    paths: ['headers.Retry-After', 'headers.X-RateLimit-Remaining', 'headers.X-RateLimit-Reset'],
    notVerifiedPaths: [
      'headers.Retry-After',
      'headers.X-RateLimit-Remaining',
      'headers.X-RateLimit-Reset',
    ],
  },
  {
    id: 'EF-24',
    source: 'github',
    verified: false,
    requiresToken: false,
    requestMatcher: { method: 'GET', url: /\/api\/v3\// },
    paths: [],
  },
  {
    id: 'EF-25',
    source: 'depsdev',
    verified: true,
    requiresToken: false,
    requestMatcher: { method: 'GET', url: /^https:\/\/api\.deps\.dev\/v3\/advisories\/[^/?#]+$/ },
    paths: ['advisoryKey.id', 'cvss3Score'],
  },
];
