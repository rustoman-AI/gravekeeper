// Every constant of the Constants table in scan-pipeline requirements.md,
// and no other UPPER_SNAKE constant (Requirement 23.11).

// GitHub configuration
export const GITHUB_DEFAULT_API_URL = "https://api.github.com";
export const GITHUB_DEFAULT_GRAPHQL_URL = "https://api.github.com/graphql";
export const GITHUB_DEFAULT_WEB_HOST = "github.com";
export const GITHUB_RAW_HOST = "raw.githubusercontent.com";
export const GHES_API_PATH_SUFFIX = "/api/v3";

// Request and URL limits (Requirement 1)
export const REPO_URL_MAX_LENGTH = 512;
export const BRANCH_MAX_LENGTH = 255;
export const OWNER_MAX_LENGTH = 39;
export const REPO_NAME_MAX_LENGTH = 100;
export const URL_IGNORED_QUERY_PARAMS: readonly string[] = ["tab"];
export const REQUEST_BODY_MAX_BYTES = 65536;
export const DAY_MS = 86400000;

// Discovery and selection (Requirements 4, 5)
// pyproject spec R9.1: pyproject.toml is a discoverable manifest, ordered
// after requirements.txt and before Cargo.toml.
export const DISCOVERY_MANIFEST_NAMES: readonly string[] = [
  "package.json",
  "requirements.txt",
  "pyproject.toml",
  "Cargo.toml",
];
export const DISCOVERY_SKIP_DIRS: readonly string[] = [
  "node_modules",
  "vendor",
  "target",
  "dist",
  "build",
  ".git",
  ".venv",
  "venv",
  "__pycache__",
  "bower_components",
  ".tox",
  ".next",
  ".nuxt",
  ".cache",
  ".gradle",
  "site-packages",
  "third_party",
  "coverage",
];
export const DISCOVERY_MAX_DEPTH = 4;
export const DISCOVERY_MAX_MANIFESTS = 50;
export const SCAN_MAX_MANIFESTS = 10;
export const SCAN_MAX_DEPENDENCIES = 300;

// HTTP client, deadlines, concurrency, retry
export const MAX_RESPONSE_BYTES = 5000000;
export const REQUEST_TIMEOUT_MS = 8000;
export const REQUEST_TOTAL_TIMEOUT_MS = 20000;
export const SCAN_DEADLINE_MS = 25000;
export const SCAN_RESPONSE_MARGIN_MS = 1500;
export const CONCURRENCY_GITHUB = 1;
export const CONCURRENCY_DEPSDEV = 8;
export const CONCURRENCY_OSV = 4;
export const CONCURRENCY_NPM = 8;
export const CONCURRENCY_CRATESIO = 1;
export const CONCURRENCY_PYPI = 8;
export const CRATESIO_MIN_INTERVAL_MS = 1000;
export const RETRY_MAX_ATTEMPTS = 3;
export const RETRY_BASE_DELAY_MS = 250;
export const RETRY_MAX_DELAY_MS = 4000;
export const RETRY_JITTER_RATIO = 0.2;
export const RETRY_AFTER_MAX_MS = 5000;
export const GITHUB_BUDGET_THRESHOLD = 10;

// Caching (Requirement 19)
export const UPSTREAM_CACHE_TTL_SECONDS = 3600;
export const ADVISORY_CACHE_TTL_SECONDS = 86400;
export const SCAN_CACHE_TTL_SECONDS = 21600;
export const CACHE_MAX_ENTRIES = 500;
export const CRATES_OWNERS_TTL_SECONDS = 604800;
export const PARTIAL_SCAN_TTL_SECONDS = 600;
export const L2_OPERATION_TIMEOUT_MS = 300;
export const L2_MAX_SCAN_BYTES = 1000000;
export const L2_MAX_BODY_BYTES = 262144;
// resurrect spec R4.1: bumped to 4 so scans cached before hints are not reused.
export const CACHE_KEY_VERSION = 4;

// Maximum code points of one normalized hint text.
export const HINT_TEXT_MAX_LENGTH = 600;
// Maximum number of hints kept per package.
export const HINTS_MAX_PER_PACKAGE = 3;

export const REDIRECT_MAX_HOPS = 3;

// Response headers exposed to adapters (names compared case-insensitively):
// the exact names plus every header whose name begins with one of the prefixes.
export const RESPONSE_HEADER_ALLOWLIST: {
  readonly names: readonly string[];
  readonly prefixes: readonly string[];
} = {
  names: ["content-type", "retry-after"],
  prefixes: ["x-ratelimit-"],
};

export const ROUTE_MAX_DURATION_SECONDS = 30;
export const FIXTURE_SET_MAX_BYTES = 1048576;

// Batch sizes and maxima
export const OSV_BATCH_SIZE = 500;
export const OSV_MAX_ADVISORY_DETAILS = 500;
export const GRAPHQL_BATCH_SIZE = 50;
export const DEPSDEV_BATCH_SIZE = 100;

// CVSS 3.x qualitative severity ranges (inclusive bounds)
export const CVSS_RANGES: readonly {
  readonly severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  readonly min: number;
  readonly max: number;
}[] = [
  { severity: "LOW", min: 0.1, max: 3.9 },
  { severity: "MEDIUM", min: 4.0, max: 6.9 },
  { severity: "HIGH", min: 7.0, max: 8.9 },
  { severity: "CRITICAL", min: 9.0, max: 10.0 },
];

// Test support
export const TOKEN_TEST_MIN_LENGTH = 16;
export const FIXTURE_MIN_REPOS = 3;

// Scan accuracy (scan-accuracy requirements 3.6, 6.7, 7.3, 10.1)
export const RANGE_MAX_LENGTH = 256;
export const ADVISORY_URL_PREFIX = "https://osv.dev/vulnerability/";
export const CACHE_STATUS_HEADER = "X-Gravekeeper-Cache";
