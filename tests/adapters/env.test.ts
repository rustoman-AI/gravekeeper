// Requirements 2.7, 20.1, 20.10, 19.19, 22.17
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_USER_AGENT,
  isL2Enabled,
  readRuntimeEnv,
  resolveUserAgent,
} from '../../adapters/runtime/env';
import { readGithubToken } from '../../adapters/runtime/token-reader';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('readGithubToken', () => {
  it('returns null when unset', () => {
    vi.stubEnv('GITHUB_TOKEN', undefined);
    expect(readGithubToken()).toBeNull();
  });

  it('returns null when empty', () => {
    vi.stubEnv('GITHUB_TOKEN', '');
    expect(readGithubToken()).toBeNull();
  });

  it('returns the value when set', () => {
    vi.stubEnv('GITHUB_TOKEN', 'ghp_example');
    expect(readGithubToken()).toBe('ghp_example');
  });
});

describe('GRAVEKEEPER_RUNTIME_CACHE / isL2Enabled', () => {
  it.each([
    ['off', false],
    ['on', true],
    ['', true],
    ['anything-else', true],
    ['OFF', true],
  ])('value %j -> L2 enabled %s', (value, expected) => {
    vi.stubEnv('GRAVEKEEPER_RUNTIME_CACHE', value);
    expect(isL2Enabled(readRuntimeEnv())).toBe(expected);
  });

  it('enables L2 when unset', () => {
    vi.stubEnv('GRAVEKEEPER_RUNTIME_CACHE', undefined);
    expect(isL2Enabled(readRuntimeEnv())).toBe(true);
  });
});

describe('readRuntimeEnv', () => {
  it('never exposes the token', () => {
    const secret = 'ghp_secret_token_value';
    vi.stubEnv('GITHUB_TOKEN', secret);
    const env = readRuntimeEnv();
    expect(JSON.stringify(env)).not.toContain(secret);
    expect(Object.keys(env)).not.toContain('GITHUB_TOKEN');
    expect(Object.values(env)).not.toContain(secret);
  });

  it('resolves the user agent with a default for unset or empty', () => {
    vi.stubEnv('GRAVEKEEPER_USER_AGENT', undefined);
    expect(resolveUserAgent(readRuntimeEnv())).toBe(DEFAULT_USER_AGENT);
    vi.stubEnv('GRAVEKEEPER_USER_AGENT', '');
    expect(resolveUserAgent(readRuntimeEnv())).toBe(DEFAULT_USER_AGENT);
    vi.stubEnv('GRAVEKEEPER_USER_AGENT', 'custom/1');
    expect(resolveUserAgent(readRuntimeEnv())).toBe('custom/1');
  });
});

describe('token variable is read in exactly one file', () => {
  const root = resolve(__dirname, '..', '..');
  const sourceRoots = ['app', 'adapters', 'pipeline', 'core', 'lib', 'components'];
  const needle = 'process.env.' + 'GITHUB_TOKEN';

  function walk(dir: string, out: string[]): void {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(ts|tsx|js|jsx|mjs|mts|cjs)$/.test(name)) out.push(full);
    }
  }

  it('only adapters/runtime/token-reader.ts contains the access', () => {
    const files: string[] = [];
    for (const r of sourceRoots) {
      const dir = join(root, r);
      if (existsSync(dir)) walk(dir, files);
    }
    const hits = files
      .filter((f) => readFileSync(f, 'utf8').includes(needle))
      .map((f) => relative(root, f).split('\\').join('/'));
    expect(hits).toEqual(['adapters/runtime/token-reader.ts']);
  });
});
