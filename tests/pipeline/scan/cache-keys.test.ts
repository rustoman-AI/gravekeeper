import { describe, expect, it } from 'vitest';

import { CACHE_KEY_VERSION } from '../../../pipeline/constants';
import { canonicalJson } from '../../../pipeline/ports/request-key';
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

  it('keys built with version 3 differ from version 2 keys for equal parts (R10.1)', () => {
    const build = (version: number): string =>
      canonicalJson([
        'scan',
        version,
        base.webHost,
        base.owner,
        base.repo,
        base.branch,
        base.defaultBranch,
        base.commitSha,
        [...base.manifestPaths].sort(),
      ]);
    expect(build(3)).not.toBe(build(2));
    expect(scanCacheKey(base)).toBe(build(CACHE_KEY_VERSION));
    expect(scanCacheKey(base)).not.toBe(build(2));
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
