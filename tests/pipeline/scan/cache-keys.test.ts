import { describe, expect, it } from 'vitest';

import { scanCacheKey, type ScanCacheKeyParts } from '../../../pipeline/scan/cache-keys';

const base: ScanCacheKeyParts = {
  webHost: 'github.com',
  owner: 'Octo',
  repo: 'Repo',
  branch: 'main',
  defaultBranch: 'main',
  commitSha: 'a'.repeat(40),
  manifestPaths: ['package.json', 'web/package.json'],
};

describe('scanCacheKey', () => {
  it('is deterministic', () => {
    expect(scanCacheKey(base)).toBe(scanCacheKey({ ...base }));
  });

  it.each([
    ['webHost', { webHost: 'example.com' }],
    ['owner', { owner: 'Other' }],
    ['repo', { repo: 'Other' }],
    ['branch', { branch: 'dev' }],
    ['defaultBranch', { defaultBranch: 'dev' }],
    ['commitSha', { commitSha: 'b'.repeat(40) }],
    ['manifestPaths', { manifestPaths: ['package.json'] }],
  ] as const)('changing %s changes the key', (_name, override) => {
    expect(scanCacheKey({ ...base, ...override })).not.toBe(scanCacheKey(base));
  });

  it('treats owner and repo differing only in case as different keys', () => {
    expect(scanCacheKey({ ...base, owner: 'octo' })).not.toBe(scanCacheKey(base));
    expect(scanCacheKey({ ...base, repo: 'repo' })).not.toBe(scanCacheKey(base));
  });

  it('ignores manifest path order', () => {
    const reversed = [...base.manifestPaths].reverse();
    expect(scanCacheKey({ ...base, manifestPaths: reversed })).toBe(scanCacheKey(base));
  });

  it('does not mutate the input paths', () => {
    const paths = ['z.json', 'a.json'];
    scanCacheKey({ ...base, manifestPaths: paths });
    expect(paths).toEqual(['z.json', 'a.json']);
  });

  it('cannot take a token as input', () => {
    const withToken = { ...base, token: 'ghp_secret' };
    // @ts-expect-error object literal with a token field is not a ScanCacheKeyParts
    scanCacheKey({ ...base, token: 'ghp_secret' });
    // Extra keys at runtime do not influence the key and the token is not embedded.
    const key = scanCacheKey(withToken);
    expect(key).toBe(scanCacheKey(base));
    expect(key).not.toContain('ghp_secret');
  });
});
