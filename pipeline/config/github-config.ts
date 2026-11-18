import {
  GHES_API_PATH_SUFFIX,
  GITHUB_DEFAULT_API_URL,
  GITHUB_DEFAULT_GRAPHQL_URL,
  GITHUB_DEFAULT_WEB_HOST,
} from '../constants';
import type { GithubConfig } from '../ports/http';
import { err, ok } from '../mapping/result';
import type { Result } from '../mapping/result';

// Requirement 2.4, 2.9, 20.11
export interface GithubEnv {
  readonly GITHUB_API_URL?: string | undefined;
  readonly GITHUB_GRAPHQL_URL?: string | undefined;
}

export interface ConfigError {
  readonly code: 'internal-error';
  readonly message: string;
}

// Fixed messages: they name the variable and never its value (Requirement 2.4, 2.9, 20.11).
const API_URL_MESSAGE = 'GITHUB_API_URL is not a supported GitHub API URL.';
const GRAPHQL_URL_MESSAGE = 'GITHUB_GRAPHQL_URL is not a supported GitHub GraphQL URL.';
const GRAPHQL_HOST_MESSAGE = 'GITHUB_GRAPHQL_URL must have the same host as GITHUB_API_URL.';

interface UrlParts {
  readonly scheme: string; // lowercase
  readonly userInfo: boolean;
  readonly host: string; // lowercase, userinfo removed, port kept
  readonly hasPort: boolean;
  readonly path: string;
  readonly hasQuery: boolean;
  readonly hasFragment: boolean;
}

const URL_PATTERN = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#[\s\S]*)?$/;

const splitUrl = (raw: string): UrlParts | null => {
  const match = URL_PATTERN.exec(raw);
  if (match === null) return null;
  const scheme = (match[1] ?? '').toLowerCase();
  const authority = match[2] ?? '';
  const at = authority.lastIndexOf('@');
  const hostAndPort = (at === -1 ? authority : authority.slice(at + 1)).toLowerCase();
  if (hostAndPort === '') return null;
  try {
    // Confirms that the platform URL parser accepts the whole value.
    new URL(raw);
  } catch {
    return null;
  }
  return {
    scheme,
    userInfo: at !== -1,
    host: hostAndPort,
    hasPort: /:[0-9]*$/.test(hostAndPort) && !hostAndPort.endsWith(']'),
    path: match[3] ?? '',
    hasQuery: match[4] !== undefined,
    hasFragment: match[5] !== undefined,
  };
};

const stripOneTrailingSlash = (value: string): string =>
  value.endsWith('/') ? value.slice(0, -1) : value;

const HOST_NAME = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;

const deriveWebHost = (apiUrl: string): string | null => {
  const parts = splitUrl(stripOneTrailingSlash(apiUrl));
  if (parts === null) return null;
  if (parts.userInfo || parts.hasQuery || parts.hasFragment) return null;
  const defaultParts = splitUrl(GITHUB_DEFAULT_API_URL);
  // Requirement 2.2
  if (
    defaultParts !== null &&
    parts.scheme === defaultParts.scheme &&
    parts.host === defaultParts.host &&
    parts.path === defaultParts.path
  ) {
    return GITHUB_DEFAULT_WEB_HOST;
  }
  // Requirement 2.3
  if (
    parts.scheme === 'https' &&
    !parts.hasPort &&
    parts.host !== GITHUB_DEFAULT_WEB_HOST &&
    parts.path === GHES_API_PATH_SUFFIX &&
    HOST_NAME.test(parts.host)
  ) {
    return parts.host;
  }
  return null;
};

const hasValue = (value: string | undefined): value is string =>
  typeof value === 'string' && value !== '';

// Requirement 2.1, 2.11: check order 2.4, 2.9, 20.11
export function readGithubConfig(env: GithubEnv): Result<GithubConfig, ConfigError> {
  try {
    const apiRaw = hasValue(env.GITHUB_API_URL) ? env.GITHUB_API_URL : GITHUB_DEFAULT_API_URL;
    const graphqlRaw = hasValue(env.GITHUB_GRAPHQL_URL)
      ? env.GITHUB_GRAPHQL_URL
      : GITHUB_DEFAULT_GRAPHQL_URL;

    const webHost = deriveWebHost(apiRaw);
    if (webHost === null) return err({ code: 'internal-error', message: API_URL_MESSAGE });

    const graphql = splitUrl(graphqlRaw);
    if (graphql === null || graphql.scheme !== 'https') {
      return err({ code: 'internal-error', message: GRAPHQL_URL_MESSAGE });
    }

    // Requirement 20.11: same host, explicit port included. The API host has no port.
    const api = splitUrl(stripOneTrailingSlash(apiRaw));
    if (api === null || graphql.host !== api.host) {
      return err({ code: 'internal-error', message: GRAPHQL_HOST_MESSAGE });
    }

    return ok({
      apiUrl: stripOneTrailingSlash(apiRaw),
      graphqlUrl: graphqlRaw,
      webHost,
    });
  } catch {
    return err({ code: 'internal-error', message: API_URL_MESSAGE });
  }
}
