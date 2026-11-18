import { describe, expect, it } from 'vitest';
import { formatRepoUrl } from '../../../pipeline/url/format-repo-url';
import { parseRepoUrl } from '../../../pipeline/url/parse-repo-url';

const HOST = 'github.com';

function accepted(input: string, host = HOST) {
  const result = parseRepoUrl(input, host);
  if (!result.ok) throw new Error(`expected success, got ${result.error.details.part}`);
  return result.value;
}

function part(input: string, host = HOST): string {
  const result = parseRepoUrl(input, host);
  if (result.ok) throw new Error('expected failure');
  expect(result.error.code).toBe('invalid-url');
  return result.error.details.part;
}

describe('parseRepoUrl', () => {
  // Requirement 1.1
  it('parses owner and repo with every optional element', () => {
    const expected = { host: HOST, owner: 'octo-cat', repo: 'Hello.World', branch: null };
    expect(accepted('https://github.com/octo-cat/Hello.World')).toEqual(expected);
    expect(accepted('github.com/octo-cat/Hello.World')).toEqual(expected);
    expect(accepted('http://www.github.com/octo-cat/Hello.World.git/')).toEqual(expected);
    expect(accepted('  https://github.com/octo-cat/Hello.World\n')).toEqual(expected);
  });

  // Requirement 1.2
  it('parses branches with slashes and percent sequences, and keeps +', () => {
    expect(accepted('https://github.com/o/r/tree/main').branch).toBe('main');
    expect(accepted('https://github.com/o/r.git/tree/feature/x-1/').branch).toBe('feature/x-1');
    expect(accepted('https://github.com/o/r/tree/caf%C3%A9%2Fz').branch).toBe('café/z');
    expect(accepted('https://github.com/o/r/tree/a+b').branch).toBe('a+b');
  });

  // Requirement 1.3
  it('applies the case rules', () => {
    const ref = accepted('HTTPS://WWW.GitHub.COM/OwNer/RePo');
    expect(ref).toEqual({ host: HOST, owner: 'OwNer', repo: 'RePo', branch: null });
    expect(part('https://github.com/o/r/Tree/main')).toBe('path');
    expect(accepted('https://github.com/o/r.GIT').repo).toBe('r.GIT');
  });

  // Requirement 1.4
  it('ignores the fragment and ignored query parameters', () => {
    expect(accepted('https://github.com/o/r#readme').repo).toBe('r');
    expect(accepted('https://github.com/o/r?').repo).toBe('r');
    expect(accepted('https://github.com/o/r?tab=readme&tab=x#frag').repo).toBe('r');
    expect(accepted('https://github.com/o/r/tree/main?tab=x').branch).toBe('main');
  });

  // Requirement 1.5
  it('rejects another host with a message that has Web_Host but not the input', () => {
    const result = parseRepoUrl('https://gitlab.com/o/r', HOST);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.details.part).toBe('host');
      expect(result.error.message).toContain(HOST);
      expect(result.error.message).not.toContain('gitlab');
    }
    expect(part('https://evilgithub.com/o/r')).toBe('host');
    expect(part('https://github.com.evil.io/o/r')).toBe('host');
  });

  // Requirement 1.6
  it('rejects unsupported paths', () => {
    for (const path of ['/o/r/issues', '/o/r/blob/main/x', '/o/r/pull/1', '/o', '/', '', '//r', '/o//r', '/o/r//', '/o/r/tree', '/o/r/tree/', '/o/r/tree//']) {
      expect(part(`https://github.com${path}`), path).toBe('path');
    }
  });

  // Requirement 1.7
  it('rejects url-level problems', () => {
    const bad = [
      '',
      '   ',
      'https://github.com/o/r x',
      'https://github.com/o/r\u0001',
      'https://github.com/o/r\u007f',
      'ftp://github.com/o/r',
      'ssh://github.com/o/r',
      'https://user@github.com/o/r',
      'https://github.com:443/o/r',
      'https://github.com/o/r?foo=1',
      'https://github.com/o/r?=1',
      'https://github.com/o/r?tab=1&x',
      `https://github.com/o/${'a'.repeat(520)}`,
    ];
    for (const input of bad) expect(part(input), input).toBe('url');
  });

  it('rejects non-string input without throwing', () => {
    expect(part(undefined as unknown as string)).toBe('url');
  });

  // Requirement 1.8
  it('rejects invalid owners', () => {
    for (const owner of ['-a', 'a-', 'a--b', 'a_b', 'a.b', 'é', 'a'.repeat(40)]) {
      expect(part(`https://github.com/${owner}/r`), owner).toBe('owner');
    }
    expect(accepted(`https://github.com/${'a'.repeat(39)}/r`).owner).toHaveLength(39);
  });

  // Requirement 1.9
  it('rejects invalid repositories', () => {
    for (const repo of ['.', '..', '.git', 'x.git.git', 'é', 'a!', 'a'.repeat(101)]) {
      expect(part(`https://github.com/o/${repo}`), repo).toBe('repository');
    }
    expect(accepted(`https://github.com/o/${'a'.repeat(100)}`).repo).toHaveLength(100);
    expect(accepted('https://github.com/o/x.git').repo).toBe('x');
  });

  // Requirement 1.10
  it('rejects invalid branches', () => {
    const bad = [
      'a%2', 'a%zz', '%', '%FF', '%C3', 'a%00b', 'a%20b', 'a%7Eb', 'a%5Eb', 'a%3Ab', 'a%3Fb', 'a%2Ab', 'a%5Bb', 'a%5Cb',
      'a..b', 'a%40%7Bb', '-a', '%2Fa', 'a%2F', 'a.', 'a.lock', 'a%2F%2Fb', 'a/./..',
      'a'.repeat(256),
    ];
    for (const branch of bad) expect(part(`https://github.com/o/r/tree/${branch}`), branch).toBe('branch');
    expect(accepted(`https://github.com/o/r/tree/${'a'.repeat(255)}`).branch).toHaveLength(255);
  });

  // Requirement 1.16
  it('reports the first applicable error in the order 7, 5, 6, 8, 9, 10', () => {
    // 7 over 5
    expect(part('https://other.com:80/-x/..')).toBe('url');
    // 5 over 6
    expect(part('https://other.com/issues')).toBe('host');
    // 6 over 8
    expect(part('https://github.com/-o/r/issues')).toBe('path');
    // 8 over 9
    expect(part('https://github.com/-o/..')).toBe('owner');
    // 9 over 10
    expect(part('https://github.com/o/../tree/-a')).toBe('repository');
    // 10 alone
    expect(part('https://github.com/o/r/tree/-a')).toBe('branch');
    // 7 over 6, 8, 9, 10
    expect(part('https://github.com/-o/../tree/-a?x=1')).toBe('url');
  });

  // Requirement 2.5
  it('rejects github.com when the Web_Host is a GHES host, and accepts the GHES host', () => {
    expect(part('https://github.com/o/r', 'ghes.example.com')).toBe('host');
    expect(accepted('https://GHES.example.com/o/r', 'ghes.example.com').host).toBe('ghes.example.com');
    expect(part('https://ghes.example.com/o/r')).toBe('host');
  });
});

describe('formatRepoUrl', () => {
  // Requirement 1.11
  it('formats the canonical URL with percent-encoded branches', () => {
    expect(formatRepoUrl({ host: HOST, owner: 'o', repo: 'r', branch: null })).toBe('https://github.com/o/r');
    expect(formatRepoUrl({ host: HOST, owner: 'o', repo: 'r', branch: 'feat/a-b_c.d' })).toBe(
      'https://github.com/o/r/tree/feat/a-b_c.d',
    );
    expect(formatRepoUrl({ host: HOST, owner: 'o', repo: 'r', branch: 'a+b é@!~' })).toBe(
      'https://github.com/o/r/tree/a%2Bb%20%C3%A9%40%21%7E',
    );
  });
});
