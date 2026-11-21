// Requirements 3.2, 3.5, 3.6, 3.7, 3.9, 3.10, 3.12, 3.13, 4.11, 16.11
import { describe, expect, it, vi } from 'vitest';
import type { DiscoveryLimits } from '../../../pipeline/mapping';
import type {
  GithubSource,
  RequestContext,
  SourceHeaders,
  SourceResult,
} from '../../../pipeline/ports';
import { GithubBudget } from '../../../pipeline/scan/github-budget';
import { WorkLedger } from '../../../pipeline/scan/ledger';
import { renderErrorMessage } from '../../../pipeline/scan/messages';
import { createUnitRunner } from '../../../pipeline/scan/run-unit';
import {
  DISCOVERY_UNIT_KEYS,
  runDiscoveryStage,
} from '../../../pipeline/scan/stage-discovery';
import type { RepoRef } from '../../../pipeline/scan/types';

const WEB_HOST = 'github.com';
const SHA = 'a'.repeat(40);
const RESET_SECONDS = 1700000000;
const RESET_ISO = '2023-11-14T22:13:20Z';
const LIMITS: DiscoveryLimits = {
  maxDepth: 4,
  maxManifests: 50,
  manifestNames: ['package.json', 'requirements.txt', 'pyproject.toml', 'Cargo.toml'],
  skipDirs: ['node_modules'],
};

const headers: SourceHeaders = {};
const ok = (body: unknown): SourceResult => ({
  kind: 'ok',
  status: 200,
  body,
  headers,
  fromCache: false,
});
const absent: SourceResult = { kind: 'absent', headers, fromCache: false };
const failed = (h: SourceHeaders | null = null): SourceResult => ({
  kind: 'failed',
  reason: 'http-error',
  status: 500,
  headers: h,
});

const repoBody = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  full_name: 'Owner/Repo',
  default_branch: 'main',
  private: false,
  ...extra,
});
const branchBody = { commit: { sha: SHA } };
const treeBody = { tree: [{ path: 'package.json', type: 'blob', size: 10 }], truncated: false };

interface Script {
  repository?: () => Promise<SourceResult>;
  branch?: () => Promise<SourceResult>;
  tree?: () => Promise<SourceResult>;
}

function setup(script: Script, requested: string | null = null) {
  const calls: string[] = [];
  const branches: string[] = [];
  const github = {
    getRepository: vi.fn(() => {
      calls.push('repository');
      return (script.repository ?? (() => Promise.resolve(ok(repoBody()))))();
    }),
    getBranch: vi.fn((_ref: unknown, branch: string) => {
      calls.push('branch');
      branches.push(branch);
      return (script.branch ?? (() => Promise.resolve(ok(branchBody))))();
    }),
    getTree: vi.fn(() => {
      calls.push('tree');
      return (script.tree ?? (() => Promise.resolve(ok(treeBody))))();
    }),
  } as unknown as GithubSource;
  const controller = new AbortController();
  const ledger = new WorkLedger();
  const budget = new GithubBudget();
  const ctx: RequestContext = { signal: controller.signal, deadlineAtMs: 0 };
  const repo: RepoRef = { host: WEB_HOST, owner: 'owner', repo: 'repo', branch: requested };
  const run = () =>
    runDiscoveryStage({
      github,
      runner: createUnitRunner(ledger, controller.signal),
      budget,
      ctx,
      repo,
      limits: LIMITS,
      webHost: WEB_HOST,
    });
  return { run, calls, branches, controller, ledger, budget };
}

const upstream = (resetAt?: string) => ({
  ok: false,
  error: {
    code: 'upstream-unavailable',
    message: renderErrorMessage('upstream-unavailable', undefined, WEB_HOST),
    details: resetAt === undefined ? { source: 'github' } : { source: 'github', resetAt },
  },
});

describe('runDiscoveryStage', () => {
  it('returns the canonical identity, branch, commit and manifests', async () => {
    const { run, calls } = setup({});
    const result = await run();
    expect(result).toMatchObject({
      ok: true,
      value: {
        owner: 'Owner',
        repo: 'Repo',
        branch: 'main',
        defaultBranch: 'main',
        commitSha: SHA,
      },
    });
    if (result.ok) expect(result.value.discovery.candidates.map((c) => c.path)).toEqual(['package.json']);
    expect(calls).toEqual(['repository', 'branch', 'tree']);
  });

  // R3.12, R3.13
  it('canonicalises a mixed-case full_name and still sends the branch request with it', async () => {
    const { run, calls } = setup({
      repository: () => Promise.resolve(ok(repoBody({ full_name: 'FaCeBook/ReAcT' }))),
    }, 'dev');
    const result = await run();
    expect(result).toMatchObject({
      ok: true,
      value: { owner: 'FaCeBook', repo: 'ReAcT', branch: 'dev', defaultBranch: 'main' },
    });
    expect(calls).toEqual(['repository', 'branch', 'tree']);
  });

  describe('repo-not-found (R3.2)', () => {
    const expected = {
      ok: false,
      error: {
        code: 'repo-not-found',
        message: renderErrorMessage('repo-not-found', undefined, WEB_HOST),
      },
    };

    it('is returned for a 404 of the repository request, without details', async () => {
      const { run, calls } = setup({ repository: () => Promise.resolve(absent) });
      const result = await run();
      expect(result).toEqual(expected);
      expect(calls).toEqual(['repository']);
    });

    it('is returned for a private repository, before any branch request', async () => {
      const { run, calls } = setup({
        repository: () => Promise.resolve(ok({ private: true })),
      });
      expect(await run()).toEqual(expected);
      expect(calls).toEqual(['repository']);
    });
  });

  describe('branch-not-found (R3.5)', () => {
    it('carries details.branch of the requested branch', async () => {
      const { run, calls, branches } = setup({ branch: () => Promise.resolve(absent) }, 'feat/x');
      const result = await run();
      expect(result).toEqual({
        ok: false,
        error: {
          code: 'branch-not-found',
          message: renderErrorMessage('branch-not-found', { branch: 'feat/x' }, WEB_HOST),
          details: { branch: 'feat/x' },
        },
      });
      expect(branches).toEqual(['feat/x']);
      expect(calls).toEqual(['repository', 'branch']);
    });

    it('names the default branch when none was requested', async () => {
      const { run } = setup({ branch: () => Promise.resolve(absent) });
      expect(await run()).toMatchObject({
        ok: false,
        error: { code: 'branch-not-found', details: { branch: 'main' } },
      });
    });
  });

  describe('upstream-unavailable', () => {
    it('is returned for a failed repository request without resetAt', async () => {
      const { run, calls } = setup({ repository: () => Promise.resolve(failed()) });
      expect(await run()).toEqual(upstream());
      expect(calls).toEqual(['repository']);
    });

    it('includes resetAt when x-ratelimit-reset is an integer (R3.7)', async () => {
      const { run } = setup({
        repository: () =>
          Promise.resolve(failed({ 'x-ratelimit-reset': String(RESET_SECONDS) })),
      });
      expect(await run()).toEqual(upstream(RESET_ISO));
    });

    it.each(['soon', '1.5', '-5', '', '1e9'])(
      'omits resetAt when x-ratelimit-reset is %j',
      async (value) => {
        const { run } = setup({
          repository: () => Promise.resolve(failed({ 'x-ratelimit-reset': value })),
        });
        expect(await run()).toEqual(upstream());
      },
    );

    it('is returned when the repository body is unparsable (R3.10)', async () => {
      const { run } = setup({
        repository: () => Promise.resolve({ kind: 'unparsable', status: 200, headers }),
      });
      expect(await run()).toEqual(upstream());
    });

    it.each([
      ['not an object', 'text'],
      ['a full_name without slash', repoBody({ full_name: 'ownerrepo' })],
      ['a full_name with two slashes', repoBody({ full_name: 'a/b/c' })],
      ['a missing full_name', { default_branch: 'main' }],
    ])('is returned when the repository body is %s (R3.10, R3.12)', async (_l, body) => {
      const { run, calls } = setup({ repository: () => Promise.resolve(ok(body)) });
      expect(await run()).toEqual(upstream());
      expect(calls).toEqual(['repository']);
    });

    describe('default_branch rule (R3.9)', () => {
      const bad: [string, unknown][] = [
        ['missing', undefined],
        ['empty', ''],
        ['a number', 5],
        ['null', null],
        ['too long', 'b'.repeat(256)],
      ];
      it.each(bad)('is returned when default_branch is %s and no branch was requested', async (_l, v) => {
        const body = repoBody();
        if (v === undefined) delete body.default_branch;
        else body.default_branch = v;
        const { run, calls } = setup({ repository: () => Promise.resolve(ok(body)) });
        expect(await run()).toEqual(upstream());
        expect(calls).toEqual(['repository']);
      });

      it.each(bad)('is returned when default_branch is %s although a branch was requested', async (_l, v) => {
        const body = repoBody();
        if (v === undefined) delete body.default_branch;
        else body.default_branch = v;
        const { run, calls } = setup({ repository: () => Promise.resolve(ok(body)) }, 'dev');
        expect(await run()).toEqual(upstream());
        expect(calls).toEqual(['repository']);
      });
    });

    it('is returned for a failed branch request and stops before the tree', async () => {
      const { run, calls } = setup({ branch: () => Promise.resolve(failed()) });
      expect(await run()).toEqual(upstream());
      expect(calls).toEqual(['repository', 'branch']);
    });

    it.each([
      ['no commit', {}],
      ['a short sha', { commit: { sha: 'abc' } }],
      ['a non-object body', 'x'],
    ])('is returned when the branch body has %s (R3.6, R3.10)', async (_l, body) => {
      const { run, calls } = setup({ branch: () => Promise.resolve(ok(body)) });
      expect(await run()).toEqual(upstream());
      expect(calls).toEqual(['repository', 'branch']);
    });

    it('is returned for a 404 of the tree request (R4.11)', async () => {
      const { run, calls } = setup({ tree: () => Promise.resolve(absent) });
      expect(await run()).toEqual(upstream());
      expect(calls).toEqual(['repository', 'branch', 'tree']);
    });

    it('is returned when the tree body has no tree array (R4.11)', async () => {
      const { run } = setup({ tree: () => Promise.resolve(ok({ truncated: false })) });
      expect(await run()).toEqual(upstream());
    });

    it('is returned when a source call throws', async () => {
      const { run } = setup({
        repository: () => {
          throw new Error('boom');
        },
      });
      expect(await run()).toEqual(upstream());
    });
  });

  describe('budget below the threshold (R3.7)', () => {
    const low = { 'x-ratelimit-remaining': '3', 'x-ratelimit-reset': String(RESET_SECONDS) };

    it('stops discovery before the first request and reports the budget resetAt', async () => {
      const { run, calls, budget, ledger } = setup({});
      budget.observe(low);
      expect(await run()).toEqual(upstream(RESET_ISO));
      expect(calls).toEqual([]);
      expect(ledger.entries).toEqual([
        {
          source: 'github',
          unitKey: DISCOVERY_UNIT_KEYS.repository,
          outcome: { ok: false, reason: 'budget' },
        },
      ]);
    });

    it('stops before the branch request when the repository response used up the budget', async () => {
      const { run, calls, budget, ledger } = setup({
        repository: () => {
          budget.observe(low);
          return Promise.resolve(ok(repoBody()));
        },
      });
      expect(await run()).toEqual(upstream(RESET_ISO));
      expect(calls).toEqual(['repository']);
      expect(ledger.entries.map((e) => [e.unitKey, e.outcome])).toEqual([
        [DISCOVERY_UNIT_KEYS.repository, { ok: true }],
        [DISCOVERY_UNIT_KEYS.branch, { ok: false, reason: 'budget' }],
      ]);
    });

    it('omits resetAt when the budget has no known reset', async () => {
      const { run, budget } = setup({});
      budget.observe({ 'x-ratelimit-remaining': '0' });
      expect(await run()).toEqual(upstream());
    });

    it('sends the request when the budget is exactly at the threshold', async () => {
      const { run, budget } = setup({});
      budget.observe({ 'x-ratelimit-remaining': '10' });
      expect((await run()).ok).toBe(true);
    });
  });

  describe('deadline (R16.11)', () => {
    const expected = {
      ok: false,
      error: {
        code: 'deadline-exceeded',
        message: renderErrorMessage('deadline-exceeded', undefined, WEB_HOST),
      },
    };

    it('is returned when the deadline passes during the repository request', async () => {
      const s = setup({ repository: () => new Promise<SourceResult>(() => undefined) });
      const running = s.run();
      s.controller.abort();
      expect(await running).toEqual(expected);
      expect(s.ledger.entries[0]?.outcome).toEqual({ ok: false, reason: 'deadline' });
    });

    it('is returned when the deadline passes during the tree request', async () => {
      const s = setup({ tree: () => new Promise<SourceResult>(() => undefined) });
      const running = s.run();
      await vi.waitFor(() => expect(s.calls).toContain('tree'));
      s.controller.abort();
      expect(await running).toEqual(expected);
    });

    it('is returned when an adapter reports a deadline failure', async () => {
      const { run } = setup({
        branch: () =>
          Promise.resolve({ kind: 'failed', reason: 'deadline', status: null, headers: null }),
      });
      expect(await run()).toEqual(expected);
    });

    it('sends nothing when the signal is already aborted', async () => {
      const s = setup({});
      s.controller.abort();
      expect(await s.run()).toEqual(expected);
      expect(s.calls).toEqual([]);
      expect(s.ledger.entries).toEqual([
        {
          source: 'github',
          unitKey: DISCOVERY_UNIT_KEYS.repository,
          outcome: { ok: false, reason: 'deadline' },
        },
      ]);
    });
  });
});
