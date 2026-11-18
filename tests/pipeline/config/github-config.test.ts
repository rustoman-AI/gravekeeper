import { describe, expect, it } from 'vitest';
import { readGithubConfig } from '../../../pipeline/config/github-config';
import type { GithubEnv } from '../../../pipeline/config/github-config';
import {
  GHES_API_PATH_SUFFIX,
  GITHUB_DEFAULT_API_URL,
  GITHUB_DEFAULT_GRAPHQL_URL,
  GITHUB_DEFAULT_WEB_HOST,
} from '../../../pipeline/constants';

const GHES_API = `https://ghe.example.com${GHES_API_PATH_SUFFIX}`;
const GHES_GRAPHQL = 'https://ghe.example.com/api/graphql';

const expectApiError = (env: GithubEnv): void => {
  const result = readGithubConfig(env);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe('internal-error');
    expect(result.error.message).toContain('GITHUB_API_URL');
    expect(result.error.message).not.toContain('GITHUB_GRAPHQL_URL');
  }
};

const expectGraphqlError = (env: GithubEnv): void => {
  const result = readGithubConfig(env);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe('internal-error');
    expect(result.error.message).toContain('GITHUB_GRAPHQL_URL');
  }
};

describe('readGithubConfig defaults (Requirement 2.1, 2.2)', () => {
  it('uses the defaults when both variables are unset', () => {
    const result = readGithubConfig({});
    expect(result).toEqual({
      ok: true,
      value: {
        apiUrl: GITHUB_DEFAULT_API_URL,
        graphqlUrl: GITHUB_DEFAULT_GRAPHQL_URL,
        webHost: GITHUB_DEFAULT_WEB_HOST,
      },
    });
  });

  it('uses the defaults when both variables are empty strings', () => {
    const result = readGithubConfig({ GITHUB_API_URL: '', GITHUB_GRAPHQL_URL: '' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.apiUrl).toBe(GITHUB_DEFAULT_API_URL);
      expect(result.value.graphqlUrl).toBe(GITHUB_DEFAULT_GRAPHQL_URL);
    }
  });

  it('does not trim: a blank API URL is an error', () => {
    expectApiError({ GITHUB_API_URL: ' ' });
  });

  it('removes one trailing slash of the default API URL', () => {
    const result = readGithubConfig({ GITHUB_API_URL: `${GITHUB_DEFAULT_API_URL}/` });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.apiUrl).toBe(GITHUB_DEFAULT_API_URL);
      expect(result.value.webHost).toBe(GITHUB_DEFAULT_WEB_HOST);
    }
  });

  it('compares scheme and host of the default API URL case-insensitively', () => {
    const result = readGithubConfig({ GITHUB_API_URL: 'HTTPS://API.GitHub.com' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.webHost).toBe(GITHUB_DEFAULT_WEB_HOST);
  });

  it('compares the path case-sensitively', () => {
    expectApiError({ GITHUB_API_URL: 'https://api.github.com/API' });
  });
});

describe('readGithubConfig GitHub Enterprise Server (Requirement 2.3)', () => {
  it('derives a lowercase Web_Host from the API URL', () => {
    const result = readGithubConfig({
      GITHUB_API_URL: `https://GHE.Example.COM${GHES_API_PATH_SUFFIX}`,
      GITHUB_GRAPHQL_URL: GHES_GRAPHQL.replace('ghe', 'GHE'),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.webHost).toBe('ghe.example.com');
  });

  it('accepts one trailing slash and strips it from apiUrl', () => {
    const result = readGithubConfig({
      GITHUB_API_URL: `${GHES_API}/`,
      GITHUB_GRAPHQL_URL: GHES_GRAPHQL,
    });
    expect(result).toEqual({
      ok: true,
      value: { apiUrl: GHES_API, graphqlUrl: GHES_GRAPHQL, webHost: 'ghe.example.com' },
    });
  });

  it.each([
    ['a port', 'https://ghe.example.com:8443/api/v3'],
    ['a query', 'https://ghe.example.com/api/v3?x=1'],
    ['a fragment', 'https://ghe.example.com/api/v3#x'],
    ['user information', 'https://user:pw@ghe.example.com/api/v3'],
    ['the http scheme', 'http://ghe.example.com/api/v3'],
    ['a wrong path', 'https://ghe.example.com/api/v4'],
    ['an upper-case path', 'https://ghe.example.com/API/V3'],
    ['an empty path', 'https://ghe.example.com'],
    ['two trailing slashes', 'https://ghe.example.com/api/v3//'],
    ['an unparsable value', 'not a url'],
    ['a missing scheme', 'ghe.example.com/api/v3'],
    ['github.com with the GHES path', 'https://github.com/api/v3'],
  ])('rejects %s', (_label, value) => {
    expectApiError({ GITHUB_API_URL: value, GITHUB_GRAPHQL_URL: GHES_GRAPHQL });
  });
});

describe('readGithubConfig GraphQL URL (Requirement 2.9, 20.11)', () => {
  it.each([
    ['a non-https scheme', 'http://api.github.com/graphql'],
    ['an unparsable value', 'graphql'],
    ['a different scheme', 'ftp://api.github.com/graphql'],
  ])('rejects %s', (_label, value) => {
    expectGraphqlError({ GITHUB_GRAPHQL_URL: value });
  });

  it('rejects a GraphQL URL on a different host', () => {
    expectGraphqlError({ GITHUB_API_URL: GHES_API, GITHUB_GRAPHQL_URL: GITHUB_DEFAULT_GRAPHQL_URL });
  });
});

describe('readGithubConfig error order (Requirement 2.11)', () => {
  it('reports the API URL before the GraphQL URL', () => {
    expectApiError({ GITHUB_API_URL: 'nope', GITHUB_GRAPHQL_URL: 'http://x.example' });
  });

  it('reports the GraphQL scheme before the host mismatch', () => {
    const result = readGithubConfig({
      GITHUB_API_URL: GHES_API,
      GITHUB_GRAPHQL_URL: 'http://other.example.com/graphql',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('is not a supported GitHub GraphQL URL');
  });
});

describe('readGithubConfig messages never contain the input', () => {
  it('omits the API URL value', () => {
    const secret = 'https://user:SECRETPW@ghe.example.com/wrong';
    const result = readGithubConfig({ GITHUB_API_URL: secret });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).not.toContain('SECRETPW');
      expect(result.error.message).not.toContain('ghe.example.com');
    }
  });

  it('omits the GraphQL URL value', () => {
    const value = 'http://SECRETHOST.example.com/graphql';
    const result = readGithubConfig({ GITHUB_GRAPHQL_URL: value });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).not.toContain('SECRETHOST');
  });

  it('does not throw on non-string runtime values', () => {
    const env = { GITHUB_API_URL: 42 } as unknown as GithubEnv;
    expect(() => readGithubConfig(env)).not.toThrow();
  });
});
