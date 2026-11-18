// Requirements 20.2, 20.3, 20.7
import { describe, expect, it, vi } from 'vitest';
import { createGithubAuthorizer } from '../../adapters/http/github-authorizer';
import type { GithubConfig } from '../../pipeline/ports/http';

const DOTCOM: GithubConfig = {
  apiUrl: 'https://api.github.com',
  graphqlUrl: 'https://api.github.com/graphql',
  webHost: 'github.com',
};

const GHES: GithubConfig = {
  apiUrl: 'https://ghe.example.test/api/v3',
  graphqlUrl: 'https://ghe.example.test/api/graphql',
  webHost: 'ghe.example.test',
};

const auth = (config: GithubConfig, token: string | null = 'tok') =>
  createGithubAuthorizer(() => token, config);

describe('createGithubAuthorizer', () => {
  it('adds the header for the API and GraphQL URLs', () => {
    const a = auth(DOTCOM);
    expect(a(new URL('https://api.github.com/repos/o/r'))).toBe('Bearer tok');
    expect(a(new URL('https://api.github.com/graphql'))).toBe('Bearer tok');
  });

  it('matches host case-insensitively and ignores the default port', () => {
    const a = auth(DOTCOM);
    expect(a(new URL('https://API.GITHUB.COM/repos/o/r'))).toBe('Bearer tok');
    expect(a(new URL('https://api.github.com:443/repos/o/r'))).toBe('Bearer tok');
  });

  it('refuses a non-default port', () => {
    const a = auth(DOTCOM);
    expect(a(new URL('https://API.GITHUB.COM:8443/repos/o/r'))).toBeNull();
  });

  it('refuses raw.githubusercontent.com and other registries', () => {
    const a = auth(DOTCOM);
    for (const u of [
      'https://raw.githubusercontent.com/o/r/HEAD/package.json',
      'https://registry.npmjs.org/x',
      'https://crates.io/api/v1/crates/x',
      'https://pypi.org/pypi/x/json',
      'https://api.osv.dev/v1/vulns/X',
      'https://api.deps.dev/v3/systems/npm',
      'https://github.com/o/r',
    ]) {
      expect(a(new URL(u))).toBeNull();
    }
  });

  it('refuses look-alike hosts', () => {
    const a = auth(DOTCOM);
    for (const u of [
      'https://api.github.com.evil.test/repos/o/r',
      'https://evil.api.github.com/repos/o/r',
      'https://api.github.com@evil.test/',
      'https://xapi.github.com/',
    ]) {
      expect(a(new URL(u))).toBeNull();
    }
  });

  it('refuses http, even for the API host', () => {
    expect(auth(DOTCOM)(new URL('http://api.github.com/repos/o/r'))).toBeNull();
  });

  it('returns null when the token is null or empty', () => {
    expect(auth(DOTCOM, null)(new URL('https://api.github.com/'))).toBeNull();
    expect(auth(DOTCOM, '')(new URL('https://api.github.com/'))).toBeNull();
  });

  it('reads the token on every call', () => {
    const read = vi.fn<() => string | null>().mockReturnValueOnce('a').mockReturnValueOnce(null);
    const a = createGithubAuthorizer(read, DOTCOM);
    const url = new URL('https://api.github.com/');
    expect(a(url)).toBe('Bearer a');
    expect(a(url)).toBeNull();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('does not read the token for a refused URL', () => {
    const read = vi.fn<() => string | null>().mockReturnValue('t');
    createGithubAuthorizer(read, DOTCOM)(new URL('https://registry.npmjs.org/x'));
    expect(read).not.toHaveBeenCalled();
  });

  describe('GitHub Enterprise Server config', () => {
    it('authorizes the GHES API host and refuses github.com hosts', () => {
      const a = auth(GHES);
      expect(a(new URL('https://ghe.example.test/api/v3/repos/o/r'))).toBe('Bearer tok');
      expect(a(new URL('https://ghe.example.test/api/graphql'))).toBe('Bearer tok');
      expect(a(new URL('https://GHE.EXAMPLE.TEST:443/api/v3/'))).toBe('Bearer tok');
      expect(a(new URL('https://api.github.com/repos/o/r'))).toBeNull();
      expect(a(new URL('https://ghe.example.test.evil.test/api/v3'))).toBeNull();
      expect(a(new URL('http://ghe.example.test/api/v3'))).toBeNull();
    });

    it('does not authorize the GHES web host under the dotcom config', () => {
      expect(auth(DOTCOM)(new URL('https://ghe.example.test/api/v3'))).toBeNull();
    });
  });
});
