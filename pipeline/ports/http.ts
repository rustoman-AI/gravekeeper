// Requirement 15.15, 17.9
export type SourceName = 'github' | 'depsdev' | 'osv' | 'npm' | 'cratesio' | 'pypi';

/** The nine Reason_Categories. */
export type ReasonCategory =
  | 'timeout'
  | 'network'
  | 'rate-limited'
  | 'http-error'
  | 'budget'
  | 'deadline'
  | 'token-missing'
  | 'prerequisite'
  | 'truncated';

/** The six categories an Adapter may report. The Pipeline adds the other three. */
export type AdapterReason = Extract<
  ReasonCategory,
  'timeout' | 'network' | 'rate-limited' | 'http-error' | 'budget' | 'deadline'
>;

// Requirement 23.7
/** Lowercase names, allow-list only: content-type, retry-after, x-ratelimit-*. */
export type SourceHeaders = Readonly<Record<string, string>>;

// Requirement 14.3, 15.17, 14.11
/** Per-attempt gate. GitHub budget implements it. Absent for raw content. */
export interface AttemptGate {
  /** False when GitHub_Budget is known and below GITHUB_BUDGET_THRESHOLD. */
  allow(): boolean;
  /** Called with the headers of every attempt that received a response. */
  observe(headers: SourceHeaders): void;
}

// Requirement 19.20
/** The three entry kinds that may live in the L2_Cache besides complete Scan_Results. */
export type L2Kind = 'osv-advisory' | 'depsdev-advisory' | 'crates-owners';

// Requirement 19.1, 19.2, 19.4
export interface CachePolicy {
  readonly ttlSeconds: number;
  readonly extraKey: readonly string[];
  readonly storeWhen: 'always' | 'graphql-no-foreign-errors';
  /** null: L1 only. */
  readonly l2Kind: L2Kind | null;
}

// Requirement 3.8, 17.6, 20.2
export interface HttpRequest {
  readonly source: SourceName;
  readonly method: 'GET' | 'POST';
  /** Absolute https URL, built from validated parts. */
  readonly url: string;
  /** Never Authorization. */
  readonly headers: Readonly<Record<string, string>>;
  /** Serialized JSON, keys built in a fixed order. */
  readonly body: string | null;
  /** 'github': the client may add the token. */
  readonly auth: 'none' | 'github';
  /** 404 meaning "absent" is ok; OSV detail 404 is failed. */
  readonly notFound: 'absent' | 'failed';
  /** null for repository and branch requests. */
  readonly cache: CachePolicy | null;
  readonly gate: AttemptGate | null;
}

// Requirement 15.10, 19.10
export interface RequestContext {
  /** Scan_Deadline_Signal. */
  readonly signal: AbortSignal;
  /** Scan_Start + SCAN_DEADLINE_MS on the injected clock. */
  readonly deadlineAtMs: number;
}

// Requirement 15.15, 17.9
export type WorkUnitOutcome =
  | {
      readonly kind: 'ok';
      readonly status: number;
      readonly bodyText: string;
      readonly headers: SourceHeaders;
      readonly attempts: number;
      readonly fromCache: boolean;
    }
  | {
      readonly kind: 'absent';
      readonly status: 404;
      readonly headers: SourceHeaders;
      readonly attempts: number;
      readonly fromCache: boolean;
    }
  | {
      readonly kind: 'failed';
      readonly reason: AdapterReason;
      readonly status: number | null;
      readonly headers: SourceHeaders | null;
      readonly attempts: number;
    };

export interface HttpClient {
  /** One Work_Unit: all attempts, waits and the body read. Never throws and never rejects. */
  execute(request: HttpRequest, context: RequestContext): Promise<WorkUnitOutcome>;
}

// Requirement 22.11
/** Validated GitHub configuration handed to adapters (no import of /pipeline/config). */
export interface GithubConfig {
  readonly apiUrl: string;
  readonly graphqlUrl: string;
  readonly webHost: string;
}
