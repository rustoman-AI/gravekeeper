// Requirement 2.1, 19.19, 15.1 (User-Agent), 22.17
/** The non-secret environment variables the pipeline reads. Unset variables are undefined. */
export interface RuntimeEnv {
  readonly GITHUB_API_URL?: string | undefined;
  readonly GITHUB_GRAPHQL_URL?: string | undefined;
  readonly GRAVEKEEPER_RUNTIME_CACHE?: string | undefined;
  readonly GRAVEKEEPER_USER_AGENT?: string | undefined;
}

/** Default `User-Agent` value (scan-pipeline requirements.md, Configuration table). */
export const DEFAULT_USER_AGENT = 'gravekeeper';

/** Reads the four variables. Values are returned as given, including empty strings. */
export function readRuntimeEnv(): RuntimeEnv {
  return {
    GITHUB_API_URL: process.env.GITHUB_API_URL,
    GITHUB_GRAPHQL_URL: process.env.GITHUB_GRAPHQL_URL,
    GRAVEKEEPER_RUNTIME_CACHE: process.env.GRAVEKEEPER_RUNTIME_CACHE,
    GRAVEKEEPER_USER_AGENT: process.env.GRAVEKEEPER_USER_AGENT,
  };
}

/** Requirement 19.19: only the exact value `off` disables L2; unset, empty and any other value enable it. */
export function isL2Enabled(env: RuntimeEnv): boolean {
  return env.GRAVEKEEPER_RUNTIME_CACHE !== 'off';
}

/** The `User-Agent` value: the variable, or the default when unset or empty. */
export function resolveUserAgent(env: RuntimeEnv): string {
  const value = env.GRAVEKEEPER_USER_AGENT;
  return typeof value === 'string' && value !== '' ? value : DEFAULT_USER_AGENT;
}
