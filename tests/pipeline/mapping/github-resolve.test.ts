import { describe, expect, it } from 'vitest';
import { BRANCH_MAX_LENGTH } from '../../../pipeline/constants';
import { readCommitSha, readRepository } from '../../../pipeline/mapping/github-resolve';

const SHA = 'a'.repeat(40);

function repo(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { full_name: 'Owner/Repo', default_branch: 'main', private: false, ...extra };
}

describe('readRepository', () => {
  // Validates: Requirements 3.2, 3.3, 3.9, 3.10
  it('reads owner, repo and default branch', () => {
    expect(readRepository(repo(), null)).toEqual({
      ok: true,
      value: { owner: 'Owner', repo: 'Repo', defaultBranch: 'main', private: false },
    });
  });

  it('keeps the mixed case of full_name', () => {
    const r = readRepository(repo({ full_name: 'FaCeBook/ReAcT' }), null);
    expect(r).toMatchObject({ ok: true, value: { owner: 'FaCeBook', repo: 'ReAcT' } });
  });

  it('reports a private repository with empty owner and repo', () => {
    const r = readRepository({ private: true }, null);
    expect(r).toEqual({
      ok: true,
      value: { owner: '', repo: '', defaultBranch: null, private: true },
    });
  });

  it('reports private even when other fields are invalid or a branch is requested', () => {
    expect(readRepository({ private: true, full_name: 5 }, 'dev')).toMatchObject({
      ok: true,
      value: { private: true },
    });
  });

  it('treats private values other than true as public', () => {
    expect(readRepository(repo({ private: 'true' }), null).ok).toBe(true);
    expect(readRepository(repo({ private: 1 }), null)).toMatchObject({
      ok: true,
      value: { private: false },
    });
  });

  describe('default_branch', () => {
    it('accepts a name of BRANCH_MAX_LENGTH', () => {
      const name = 'b'.repeat(BRANCH_MAX_LENGTH);
      expect(readRepository(repo({ default_branch: name }), null)).toMatchObject({
        ok: true,
        value: { defaultBranch: name },
      });
    });

    it('rejects a name of BRANCH_MAX_LENGTH + 1 when no branch is requested', () => {
      const name = 'b'.repeat(BRANCH_MAX_LENGTH + 1);
      expect(readRepository(repo({ default_branch: name }), null)).toEqual({
        ok: false,
        error: 'invalid',
      });
    });

    it.each([
      ['missing', undefined],
      ['empty', ''],
      ['null', null],
      ['a number', 5],
      ['an object', {}],
    ])('is invalid when %s and no branch is requested', (_label, value) => {
      const body = repo();
      if (value === undefined) delete body.default_branch;
      else body.default_branch = value;
      expect(readRepository(body, null)).toEqual({ ok: false, error: 'invalid' });
    });

    it('accepts an emoji name of BRANCH_MAX_LENGTH code points', () => {
      const name = '🌿'.repeat(BRANCH_MAX_LENGTH);
      expect(name.length).toBe(2 * BRANCH_MAX_LENGTH);
      expect(readRepository(repo({ default_branch: name }), null)).toMatchObject({
        ok: true,
        value: { defaultBranch: name },
      });
    });

    it('rejects an emoji name of BRANCH_MAX_LENGTH + 1 code points', () => {
      const name = '🌿'.repeat(BRANCH_MAX_LENGTH + 1);
      expect(readRepository(repo({ default_branch: name }), null)).toEqual({
        ok: false,
        error: 'invalid',
      });
    });

    it('gives null instead of an error when a branch is requested', () => {
      const body = repo({ default_branch: '' });
      expect(readRepository(body, 'dev')).toMatchObject({
        ok: true,
        value: { defaultBranch: null },
      });
      expect(
        readRepository(repo({ default_branch: 'b'.repeat(BRANCH_MAX_LENGTH + 1) }), 'dev'),
      ).toMatchObject({ ok: true, value: { defaultBranch: null } });
    });
  });

  describe('full_name', () => {
    it.each([
      ['no slash', 'ownerrepo'],
      ['two slashes', 'a/b/c'],
      ['empty owner', '/repo'],
      ['empty repo', 'owner/'],
      ['only a slash', '/'],
      ['empty', ''],
    ])('is invalid with %s', (_label, fullName) => {
      expect(readRepository(repo({ full_name: fullName }), null)).toEqual({
        ok: false,
        error: 'invalid',
      });
    });

    it.each([undefined, null, 5, {}, ['a/b']])('is invalid when it is %j', (value) => {
      const body = repo();
      if (value === undefined) delete body.full_name;
      else body.full_name = value;
      expect(readRepository(body, null)).toEqual({ ok: false, error: 'invalid' });
    });
  });

  // Validates: Requirement 3.10
  it.each([null, undefined, 'x', 5, true, [], [repo()]])('rejects the non-object body %j', (body) => {
    expect(readRepository(body, null)).toEqual({ ok: false, error: 'invalid' });
  });

  it('ignores inherited properties and does not throw on throwing getters', () => {
    const inherited = Object.create(repo()) as unknown;
    expect(readRepository(inherited, null)).toEqual({ ok: false, error: 'invalid' });
    const throwing = {
      get full_name(): string {
        throw new Error('boom');
      },
    };
    expect(() => readRepository(throwing, null)).not.toThrow();
  });
});

describe('readCommitSha', () => {
  // Validates: Requirements 3.6, 3.12
  it('returns a 40 character hexadecimal sha', () => {
    expect(readCommitSha({ commit: { sha: SHA } })).toBe(SHA);
  });

  it('accepts upper and mixed case hexadecimal digits unchanged', () => {
    const sha = 'AbCdEf0123456789aBcDeF0123456789ABCDEF01';
    expect(readCommitSha({ commit: { sha } })).toBe(sha);
  });

  it.each([39, 41, 0, 64])('rejects a sha of %i characters', (n) => {
    expect(readCommitSha({ commit: { sha: 'a'.repeat(n) } })).toBeNull();
  });

  it.each(['g', 'z', ' ', '-', 'é'])('rejects the non-hex character %j', (c) => {
    expect(readCommitSha({ commit: { sha: 'a'.repeat(39) + c } })).toBeNull();
    expect(readCommitSha({ commit: { sha: c + 'a'.repeat(39) } })).toBeNull();
  });

  it('rejects a sha with a trailing newline', () => {
    expect(readCommitSha({ commit: { sha: SHA.slice(0, 39) + '\n' } })).toBeNull();
    expect(readCommitSha({ commit: { sha: SHA + '\n' } })).toBeNull();
  });

  it.each([null, undefined, 5, true, 'x', [], [{ commit: { sha: SHA } }]])(
    'rejects the non-object body %j',
    (body) => {
      expect(readCommitSha(body)).toBeNull();
    },
  );

  it.each([
    {},
    { commit: null },
    { commit: 'x' },
    { commit: {} },
    { commit: { sha: 5 } },
    { commit: { sha: null } },
    { commit: { sha: [SHA] } },
    { sha: SHA },
  ])('rejects the shape %j', (body) => {
    expect(readCommitSha(body)).toBeNull();
  });
});
