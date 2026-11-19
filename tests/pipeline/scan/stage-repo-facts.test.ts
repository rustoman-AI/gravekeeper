// Requirements 11.1, 11.2, 11.5, 11.7, 11.8, 11.9, 11.13, 14.3, 17.5
import { describe, expect, it } from 'vitest';
import type { Ecosystem } from '../../../core';
import { GRAPHQL_BATCH_SIZE } from '../../../pipeline/constants';
import type { Fetched, SourceRepo, VersionSelection } from '../../../pipeline/mapping';
import type { RequestContext, SourceResult } from '../../../pipeline/ports';
import { GithubBudget } from '../../../pipeline/scan/github-budget';
import { WorkLedger } from '../../../pipeline/scan/ledger';
import { createUnitRunner } from '../../../pipeline/scan/run-unit';
import { repoFactsUnitKeys, runRepoFactsStage } from '../../../pipeline/scan/stage-repo-facts';
import { targetKey } from '../../../pipeline/scan/targets';
import type { LookupTarget } from '../../../pipeline/scan/types';

const HEADERS = {} as never;
const ok = (body: unknown): SourceResult<never> =>
  ({ kind: 'ok', status: 200, body, headers: HEADERS, fromCache: false }) as never;
const failedResult: SourceResult<never> = {
  kind: 'failed',
  reason: 'timeout',
  status: null,
  headers: null,
};
const AS_OF = '2024-01-11T00:00:00.000Z';
const RESET = '2024-01-11T01:00:00.000Z';

const target = (name: string, ecosystem: Ecosystem = 'npm'): LookupTarget => ({
  ecosystem,
  name,
  versionSpecs: ['1.0.0'],
});

const node = (archived: boolean) => ({
  isArchived: archived,
  defaultBranchRef: { target: { committedDate: '2024-01-01T00:00:00.000Z' } },
});

type Vars = Record<string, string>;

interface Setup {
  token?: boolean;
  respond?: (query: string, variables: Vars, call: number) => SourceResult<never>;
}

function setup(options: Setup = {}) {
  const calls: { query: string; variables: Vars }[] = [];
  const github = {
    hasToken: () => options.token ?? true,
    queryRepositories: (query: string, variables: Vars) => {
      calls.push({ query, variables });
      const respond =
        options.respond ??
        ((_q: string, v: Vars) => ok(answer(v, () => node(false), 100)));
      return Promise.resolve(respond(query, variables, calls.length - 1));
    },
  };
  const ledger = new WorkLedger();
  const controller = new AbortController();
  const runner = createUnitRunner(ledger, controller.signal);
  const ctx: RequestContext = { signal: controller.signal, deadlineAtMs: 0 };
  const budget = new GithubBudget();

  const run = (
    targets: LookupTarget[],
    repos: Record<string, SourceRepo | null | 'unavailable'>,
    packages: Record<string, SourceResult<never>> = {},
  ) => {
    const selections = new Map<string, VersionSelection>();
    const sourceRepos = new Map<string, Fetched<SourceRepo | null>>();
    const depsdevPackages = new Map<string, SourceResult<never>>();
    for (const t of targets) {
      const key = targetKey(t.ecosystem, t.name);
      selections.set(key, { selected: '1.0.0', basis: 'pinned', notes: [] });
      const repo = repos[t.name] ?? null;
      sourceRepos.set(key, repo === 'unavailable' ? { state: 'unavailable' } : { state: 'ok', body: repo });
      depsdevPackages.set(key, packages[t.name] ?? ok({}));
    }
    return runRepoFactsStage({
      sources: { github } as never,
      runner,
      ctx,
      budget,
      asOf: AS_OF as never,
      targets,
      selections,
      sourceRepos,
      depsdevPackages: depsdevPackages as never,
    });
  };
  const outcomeOf = (unitKey: string) =>
    ledger.entries.find((e) => e.source === 'github' && e.unitKey === unitKey)?.outcome;
  return { calls, ledger, controller, budget, run, outcomeOf };
}

/** Builds a GraphQL body with one entry per alias of the request. */
function answer(
  variables: Vars,
  make: (owner: string, name: string) => unknown,
  remaining: number,
): unknown {
  const data: Record<string, unknown> = { rateLimit: { remaining, resetAt: RESET } };
  for (const key of Object.keys(variables)) {
    if (!key.endsWith('Owner')) continue;
    const alias = key.slice(0, -'Owner'.length);
    data[alias] = make(variables[key] as string, variables[`${alias}Name`] as string);
  }
  return { data };
}

const repoOf = (name: string): SourceRepo => ({ owner: 'o', name });

describe('runRepoFactsStage', () => {
  it('sends one request and shares the result of a repo linked case-insensitively (R11.1, R11.2)', async () => {
    const { calls, run } = setup();
    const targets = [target('a'), target('b')];
    const result = await run(targets, {
      a: { owner: 'Acme', name: 'Lib' },
      b: { owner: 'acme', name: 'lib' },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.variables).toEqual({ r0Owner: 'Acme', r0Name: 'Lib' });
    const expected = { state: 'ok', body: { alias: 'r0', kind: 'ok', archived: false, daysSinceLastCommit: 10 } };
    expect(result.repository.get(targetKey('npm', 'a'))).toEqual(expected);
    expect(result.repository.get(targetKey('npm', 'b'))).toEqual(expected);
    expect(result.notes).toEqual([]);
  });

  it('without a token sends nothing, records token-missing per batch and adds one note (R11.8, R17.5)', async () => {
    const { calls, run, outcomeOf } = setup({ token: false });
    const result = await run([target('a'), target('b')], { a: repoOf('a'), b: repoOf('b') });
    expect(calls).toHaveLength(0);
    expect(outcomeOf(repoFactsUnitKeys.batch(0))).toEqual({ ok: false, reason: 'token-missing' });
    expect(result.notes.map((n) => n.code)).toEqual(['github-token-missing']);
    expect(result.repository.get(targetKey('npm', 'a'))).toEqual({ state: 'unavailable' });
  });

  it('adds the token-missing note even when no target has a Source_Repo (R11.8)', async () => {
    const { run, ledger } = setup({ token: false });
    const result = await run([target('a')], { a: null });
    expect(result.notes.map((n) => n.code)).toEqual(['github-token-missing']);
    expect(ledger.entries).toHaveLength(0);
  });

  it('target without a Source_Repo: no request, no unit, no-source-repo (R11.7)', async () => {
    const { calls, run, ledger, outcomeOf } = setup();
    const result = await run([target('a'), target('b')], { a: null, b: repoOf('b') });
    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0]?.variables ?? {})).toEqual(['r0Owner', 'r0Name']);
    expect(result.repository.get(targetKey('npm', 'a'))).toBe('no-source-repo');
    expect(ledger.entries.map((e) => e.unitKey)).toEqual([repoFactsUnitKeys.batch(0)]);
    expect(outcomeOf(repoFactsUnitKeys.batch(0))).toEqual({ ok: true });
  });

  it('only no-source-repo targets: no request and no unit (R11.7)', async () => {
    const { calls, run, ledger } = setup();
    const result = await run([target('a')], { a: null });
    expect(calls).toHaveLength(0);
    expect(ledger.entries).toHaveLength(0);
    expect(result.repository.get(targetKey('npm', 'a'))).toBe('no-source-repo');
    expect(result.notes).toEqual([]);
  });

  it('splits distinct repos at GRAPHQL_BATCH_SIZE (R11.1)', async () => {
    const { calls, run, ledger } = setup();
    const count = GRAPHQL_BATCH_SIZE + 1;
    const names = Array.from({ length: count }, (_, i) => `p${String(i).padStart(3, '0')}`);
    const repos = Object.fromEntries(names.map((n) => [n, repoOf(n)]));
    const result = await run(
      names.map((n) => target(n)),
      repos,
    );
    expect(calls).toHaveLength(2);
    expect(Object.keys(calls[0]?.variables ?? {})).toHaveLength(GRAPHQL_BATCH_SIZE * 2);
    expect(Object.keys(calls[1]?.variables ?? {})).toHaveLength(2);
    expect(calls[0]?.query).toContain('rateLimit');
    expect(ledger.entries.map((e) => e.unitKey)).toEqual([
      repoFactsUnitKeys.batch(0),
      repoFactsUnitKeys.batch(1),
    ]);
    for (const n of names) {
      expect(result.repository.get(targetKey('npm', n))).toMatchObject({ state: 'ok' });
    }
  });

  it('a NOT_FOUND alias is ok with null facts and keeps the other aliases (R11.5)', async () => {
    const { run, outcomeOf } = setup({
      respond: () =>
        ok({
          data: { rateLimit: { remaining: 100, resetAt: RESET }, r0: null, r1: node(true) },
          errors: [{ type: 'NOT_FOUND', path: ['r0'], message: 'x' }],
        }),
    });
    const result = await run([target('a'), target('b')], { a: repoOf('a'), b: repoOf('b') });
    expect(outcomeOf(repoFactsUnitKeys.batch(0))).toEqual({ ok: true });
    expect(result.repository.get(targetKey('npm', 'a'))).toEqual({
      state: 'ok',
      body: { alias: 'r0', kind: 'not-found' },
    });
    expect(result.repository.get(targetKey('npm', 'b'))).toMatchObject({
      state: 'ok',
      body: { kind: 'ok', archived: true },
    });
    expect(result.notes).toEqual([]);
  });

  it('a foreign error type fails the unit and keeps the other aliases (R11.9)', async () => {
    const { run, outcomeOf } = setup({
      respond: () =>
        ok({
          data: { rateLimit: { remaining: 100, resetAt: RESET }, r0: null, r1: node(false) },
          errors: [{ type: 'FORBIDDEN', path: ['r0'], message: 'x' }],
        }),
    });
    const result = await run([target('a'), target('b')], { a: repoOf('a'), b: repoOf('b') });
    expect(outcomeOf(repoFactsUnitKeys.batch(0))).toEqual({ ok: false, reason: 'http-error' });
    expect(result.repository.get(targetKey('npm', 'a'))).toEqual({ state: 'unavailable' });
    expect(result.repository.get(targetKey('npm', 'b'))).toMatchObject({
      state: 'ok',
      body: { kind: 'ok', archived: false },
    });
  });

  it('a failed request leaves its repos unavailable and does not raise a note (R11.12)', async () => {
    const { run, outcomeOf } = setup({ respond: () => failedResult });
    const result = await run([target('a')], { a: repoOf('a') });
    expect(outcomeOf(repoFactsUnitKeys.batch(0))).toEqual({ ok: false, reason: 'timeout' });
    expect(result.repository.get(targetKey('npm', 'a'))).toEqual({ state: 'unavailable' });
    expect(result.notes).toEqual([]);
  });

  it('stops after the budget drops: later batches are budget units and one note is added (R11.13, R14.3, R17.5)', async () => {
    const { calls, run, outcomeOf, budget } = setup({
      respond: (_q, v) => ok(answer(v, () => node(false), 3)),
    });
    const count = GRAPHQL_BATCH_SIZE + 1;
    const names = Array.from({ length: count }, (_, i) => `p${String(i).padStart(3, '0')}`);
    const result = await run(
      names.map((n) => target(n)),
      Object.fromEntries(names.map((n) => [n, repoOf(n)])),
    );
    expect(calls).toHaveLength(1);
    expect(budget.remaining).toBe(3);
    expect(outcomeOf(repoFactsUnitKeys.batch(0))).toEqual({ ok: true });
    expect(outcomeOf(repoFactsUnitKeys.batch(1))).toEqual({ ok: false, reason: 'budget' });
    expect(result.repository.get(targetKey('npm', 'p000'))).toMatchObject({ state: 'ok' });
    expect(result.repository.get(targetKey('npm', 'p050'))).toEqual({ state: 'unavailable' });
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toMatchObject({
      code: 'github-budget-low',
      details: { remaining: 3, resetAt: RESET },
    });
  });

  it('sends nothing when the budget is already low before the first batch (R11.13)', async () => {
    const { calls, run, budget, outcomeOf } = setup();
    budget.observeGraphql({ data: { rateLimit: { remaining: 0, resetAt: RESET } } });
    const result = await run([target('a')], { a: repoOf('a') });
    expect(calls).toHaveLength(0);
    expect(outcomeOf(repoFactsUnitKeys.batch(0))).toEqual({ ok: false, reason: 'budget' });
    expect(result.notes.map((n) => n.code)).toEqual(['github-budget-low']);
  });

  it('a failed deps.dev package request or unavailable Source_Repo is a prerequisite unit (R17.5)', async () => {
    const { calls, run, outcomeOf } = setup();
    const result = await run(
      [target('a'), target('b'), target('c')],
      { a: repoOf('a'), b: 'unavailable', c: repoOf('c') },
      { a: failedResult },
    );
    expect(outcomeOf(repoFactsUnitKeys.target(target('a')))).toEqual({
      ok: false,
      reason: 'prerequisite',
    });
    expect(outcomeOf(repoFactsUnitKeys.target(target('b')))).toEqual({
      ok: false,
      reason: 'prerequisite',
    });
    expect(result.repository.get(targetKey('npm', 'a'))).toEqual({ state: 'unavailable' });
    expect(result.repository.get(targetKey('npm', 'b'))).toEqual({ state: 'unavailable' });
    expect(calls).toHaveLength(1);
    expect(Object.values(calls[0]?.variables ?? {})).toEqual(['o', 'c']);
  });

  it('records a deadline unit without sending when the scan is aborted', async () => {
    const { calls, run, controller, outcomeOf } = setup();
    controller.abort();
    await run([target('a')], { a: repoOf('a') });
    expect(calls).toHaveLength(0);
    expect(outcomeOf(repoFactsUnitKeys.batch(0))).toEqual({ ok: false, reason: 'deadline' });
  });
});
