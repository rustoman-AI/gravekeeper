// Requirements 7.4, 7.5, 8.8, 9.1, 9.2, 9.3, 17.8
import { describe, expect, it } from 'vitest';
import type { Ecosystem } from '../../../core';
import { DEPSDEV_BATCH_SIZE, OSV_BATCH_SIZE } from '../../../pipeline/constants';
import type { RequestContext, SourceResult } from '../../../pipeline/ports';
import { WorkLedger } from '../../../pipeline/scan/ledger';
import { createUnitRunner } from '../../../pipeline/scan/run-unit';
import { runVersionStage, versionUnitKeys } from '../../../pipeline/scan/stage-versions';
import { targetKey } from '../../../pipeline/scan/targets';
import type { LookupTarget } from '../../../pipeline/scan/types';

const HEADERS = {} as never;
const ok = (body: unknown): SourceResult<never> =>
  ({ kind: 'ok', status: 200, body, headers: HEADERS, fromCache: false }) as never;
const absent: SourceResult<never> = { kind: 'absent', headers: HEADERS, fromCache: false };
const unparsable: SourceResult<never> = { kind: 'unparsable', status: 200, headers: HEADERS };
const failed: SourceResult<never> = {
  kind: 'failed',
  reason: 'timeout',
  status: null,
  headers: null,
};

const WEB_HOST = 'github.com';

const target = (ecosystem: Ecosystem, name: string, spec = '1.0.0'): LookupTarget => ({
  ecosystem,
  name,
  versionSpecs: [spec],
});

/** deps.dev package document (EF-1) with the given versions; `def` is the default version. */
const pkgDoc = (versions: string[], def: string) => ({
  versions: versions.map((v) => ({ versionKey: { version: v }, isDefault: v === def })),
});

const repoVersionDoc = (owner: string, repo: string) => ({
  relatedProjects: [
    { relationType: 'SOURCE_REPO', projectKey: { id: `github.com/${owner}/${repo}` } },
  ],
});

interface VersionRequestLike {
  system: string;
  name: string;
  version: string;
}

/** Echoes one matching response per request (EF-3). */
const echoBatch = (requests: VersionRequestLike[]) =>
  ok({
    responses: requests.map((r) => ({
      request: { versionKey: { system: r.system.toUpperCase(), name: r.name, version: r.version } },
      version: repoVersionDoc('o', r.name),
    })),
  });

interface Responders {
  versionBatch?: (requests: VersionRequestLike[]) => Promise<SourceResult<never>>;
  version?: (system: string, name: string, version: string) => Promise<SourceResult<never>>;
  osv?: (queries: { name: string; ecosystem: string; version: string }[]) => Promise<SourceResult<never>>;
  pypi?: (name: string, version: string) => Promise<SourceResult<never>>;
}

function setup(responders: Responders = {}) {
  const calls = {
    versionBatch: [] as VersionRequestLike[][],
    version: [] as string[],
    osv: [] as { name: string; ecosystem: string; version: string }[][],
    pypi: [] as { name: string; version: string; ctx: unknown }[],
  };
  const sources = {
    depsdev: {
      getVersionBatch: (requests: VersionRequestLike[]) => {
        calls.versionBatch.push(requests);
        return (responders.versionBatch ?? ((r) => Promise.resolve(echoBatch(r))))(requests);
      },
      getVersion: (system: string, name: string, version: string) => {
        calls.version.push(`${system}:${name}:${version}`);
        return (responders.version ?? (() => Promise.resolve(ok({}))))(system, name, version);
      },
    },
    osv: {
      queryBatch: (queries: { name: string; ecosystem: string; version: string }[]) => {
        calls.osv.push(queries);
        return (
          responders.osv ??
          ((q) => Promise.resolve(ok({ results: q.map(() => ({})) })))
        )(queries);
      },
    },
    pypi: {
      getProject: (name: string, version: string, ctx: unknown) => {
        calls.pypi.push({ name, version, ctx });
        return (responders.pypi ?? (() => Promise.resolve(ok({ ownership: {} }))))(name, version);
      },
    },
  } as never;
  const ledger = new WorkLedger();
  const controller = new AbortController();
  const runner = createUnitRunner(ledger, controller.signal);
  const ctx: RequestContext = { signal: controller.signal, deadlineAtMs: 0 };
  const run = (
    targets: LookupTarget[],
    packages: Record<string, SourceResult<never>>,
  ) => {
    const depsdevPackages = new Map(
      targets.map((t) => [
        targetKey(t.ecosystem, t.name),
        packages[t.name] ?? ok(pkgDoc(['1.0.0', '2.0.0'], '2.0.0')),
      ]),
    );
    return runVersionStage({
      sources,
      runner,
      ctx,
      targets,
      depsdevPackages: depsdevPackages as never,
      npmLatest: new Map(),
      webHost: WEB_HOST,
    });
  };
  const outcomeOf = (source: string, unitKey: string) =>
    ledger.entries.find((e) => e.source === source && e.unitKey === unitKey)?.outcome;
  return { calls, ledger, controller, ctx, run, outcomeOf };
}

describe('runVersionStage version basis (R7.4, R7.5)', () => {
  it('selects an exact pin present in the version list as pinned', async () => {
    const { calls, run } = setup();
    const result = await run([target('npm', 'a', '1.0.0')], {});
    expect(result.selections.get(targetKey('npm', 'a'))).toMatchObject({
      selected: '1.0.0',
      basis: 'pinned',
    });
    expect(calls.osv[0]).toEqual([{ name: 'a', ecosystem: 'npm', version: '1.0.0' }]);
  });

  it('resolves a range spec against the version list', async () => {
    const { calls, run } = setup();
    const result = await run([target('npm', 'a', '^1.0.0')], {});
    expect(result.selections.get(targetKey('npm', 'a'))).toMatchObject({
      selected: '1.0.0',
      basis: 'resolved',
    });
    expect(calls.versionBatch[0]).toEqual([{ system: 'npm', name: 'a', version: '1.0.0' }]);
  });

  it('falls back to the default version without a spec', async () => {
    const { calls, run } = setup();
    const noSpec: LookupTarget = { ecosystem: 'npm', name: 'a', versionSpecs: [] };
    const result = await run([noSpec], {});
    expect(result.selections.get(targetKey('npm', 'a'))).toMatchObject({
      selected: '2.0.0',
      basis: 'default',
    });
    expect(calls.versionBatch[0]).toEqual([{ system: 'npm', name: 'a', version: '2.0.0' }]);
  });

  it('falls back to the default version with a range-unresolved note for an unmatched range', async () => {
    const { run } = setup();
    const result = await run([target('npm', 'a', '^3.0.0')], {});
    const selection = result.selections.get(targetKey('npm', 'a'));
    expect(selection).toMatchObject({ selected: '2.0.0', basis: 'default' });
    expect(selection?.notes).toEqual([{ code: 'range-unresolved', ranges: ['^3.0.0'] }]);
    expect(result.notes.some((n) => n.code === 'range-unresolved')).toBe(true);
  });
  it('uses the default version when the pin is not in the list', async () => {
    const { run } = setup();
    const result = await run([target('npm', 'a', '9.9.9')], {});
    const selection = result.selections.get(targetKey('npm', 'a'));
    expect(selection).toMatchObject({ selected: '2.0.0', basis: 'default' });
    expect(selection?.notes).toEqual([{ code: 'pin-not-found', pinned: '9.9.9' }]);
  });
});

describe('runVersionStage deps.dev version batch (R8.8)', () => {
  it('maps the Source_Repo from the batch, records one batch unit and adds the unverified note', async () => {
    const { calls, ledger, run, outcomeOf } = setup();
    const result = await run([target('npm', 'a'), target('cargo', 'c')], {});
    expect(calls.versionBatch).toHaveLength(1);
    expect(calls.version).toEqual([]);
    expect(result.sourceRepos.get(targetKey('npm', 'a'))).toEqual({
      state: 'ok',
      body: { owner: 'o', name: 'a' },
    });
    expect(outcomeOf('depsdev', versionUnitKeys.versionBatch(0))).toEqual({ ok: true });
    expect(ledger.entries.filter((e) => e.source === 'depsdev')).toHaveLength(1);
    expect(result.notes.map((n) => n.code)).toEqual([
      'source-repo-unverified',
      'source-repo-unverified',
    ]);
    expect(result.notes[0]?.details).toMatchObject({ sourceRepo: 'github.com/o/a' });
  });

  it('records a null Source_Repo as ok without a note', async () => {
    const { run } = setup({
      versionBatch: (r) =>
        Promise.resolve(
          ok({
            responses: r.map((x) => ({
              request: { versionKey: { system: 'NPM', name: x.name, version: x.version } },
              version: {},
            })),
          }),
        ),
    });
    const result = await run([target('npm', 'a')], {});
    expect(result.sourceRepos.get(targetKey('npm', 'a'))).toEqual({ state: 'ok', body: null });
    expect(result.notes).toEqual([]);
  });

  it.each([
    ['a failed batch', failed],
    ['an unparsable batch', unparsable],
    ['a body without responses', ok({})],
  ])('replaces %s by single requests and adds one batch-fallback note', async (_name, response) => {
    const { calls, ledger, run, outcomeOf } = setup({ versionBatch: () => Promise.resolve(response) });
    const targets = [target('npm', 'a'), target('npm', 'b')];
    const result = await run(targets, {});
    expect(calls.version.sort()).toEqual(['npm:a:1.0.0', 'npm:b:1.0.0']);
    expect(result.notes.filter((n) => n.code === 'batch-fallback')).toHaveLength(1);
    // The replaced batch is not counted; the singles are.
    expect(ledger.entries.some((e) => e.unitKey === versionUnitKeys.versionBatch(0))).toBe(false);
    expect(outcomeOf('depsdev', versionUnitKeys.version(targets[0] as LookupTarget, '1.0.0'))).toEqual({
      ok: true,
    });
    expect(result.sourceRepos.size).toBe(2);
  });

  it('adds one batch-fallback note for several failed batches', async () => {
    const { calls, run } = setup({ versionBatch: () => Promise.resolve(failed) });
    const targets = Array.from({ length: DEPSDEV_BATCH_SIZE + 1 }, (_, i) => target('npm', `p${i}`));
    const result = await run(targets, {});
    expect(calls.versionBatch.map((b) => b.length)).toEqual([DEPSDEV_BATCH_SIZE, 1]);
    expect(calls.version).toHaveLength(DEPSDEV_BATCH_SIZE + 1);
    expect(result.notes.filter((n) => n.code === 'batch-fallback')).toHaveLength(1);
  });

  it('requests a single version only for a request without a matching response', async () => {
    const { calls, run } = setup({
      versionBatch: (r) =>
        Promise.resolve(echoBatch(r.filter((x) => x.name === 'a'))),
    });
    const result = await run([target('npm', 'a'), target('npm', 'b')], {});
    expect(calls.version).toEqual(['npm:b:1.0.0']);
    expect(result.notes.filter((n) => n.code === 'batch-fallback')).toHaveLength(1);
    expect(result.sourceRepos.get(targetKey('npm', 'a'))).toMatchObject({ state: 'ok' });
    expect(result.sourceRepos.get(targetKey('npm', 'b'))).toMatchObject({ state: 'ok' });
  });

  it('maps a failed single request to unavailable and a 404 to absent', async () => {
    const { run } = setup({
      versionBatch: () => Promise.resolve(failed),
      version: (_s, name) => Promise.resolve(name === 'a' ? failed : absent),
    });
    const result = await run([target('npm', 'a'), target('npm', 'b')], {});
    expect(result.sourceRepos.get(targetKey('npm', 'a'))).toEqual({ state: 'unavailable' });
    expect(result.sourceRepos.get(targetKey('npm', 'b'))).toEqual({ state: 'absent' });
  });

  it('records deadline units without a request or note when the singles start after the deadline', async () => {
    const { calls, controller, ledger, run } = setup({
      versionBatch: () => {
        controller.abort();
        return Promise.resolve(failed);
      },
    });
    const result = await run([target('npm', 'a')], {});
    expect(calls.version).toEqual([]);
    expect(result.notes).toEqual([]);
    expect(result.sourceRepos.get(targetKey('npm', 'a'))).toEqual({ state: 'unavailable' });
    expect(
      ledger.entries.filter((e) => e.source === 'depsdev').map((e) => e.outcome),
    ).toEqual([{ ok: false, reason: 'deadline' }]);
  });

  it('cuts single requests still pending at the deadline', async () => {
    const { calls, controller, run, outcomeOf } = setup({
      versionBatch: () => Promise.resolve(failed),
      version: () => new Promise(() => undefined),
    });
    const targets = [target('npm', 'a')];
    const running = run(targets, {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    const result = await running;
    expect(calls.version).toEqual(['npm:a:1.0.0']);
    expect(result.sourceRepos.get(targetKey('npm', 'a'))).toEqual({ state: 'unavailable' });
    expect(outcomeOf('depsdev', versionUnitKeys.version(targets[0] as LookupTarget, '1.0.0'))).toEqual({
      ok: false,
      reason: 'deadline',
    });
  });
});

describe('runVersionStage targets without a package document (R17.8)', () => {
  it('sends nothing for a 404 package and records no unit for it', async () => {
    const { calls, ledger, run } = setup();
    const result = await run([target('pypi', 'a')], { a: absent });
    expect(result.selections.get(targetKey('pypi', 'a'))).toMatchObject({ selected: null });
    expect(calls.versionBatch).toEqual([]);
    expect(calls.osv).toEqual([]);
    expect(calls.pypi).toEqual([]);
    expect(ledger.entries).toEqual([]);
    expect(result.sourceRepos.size + result.osv.size + result.pypiProjects.size).toBe(0);
  });

  it.each([
    ['failed', failed],
    ['unparsable', unparsable],
  ])('records the osv unit as prerequisite when the package request is %s', async (_n, response) => {
    const { calls, run, outcomeOf } = setup();
    const t = target('npm', 'a');
    const result = await run([t, target('npm', 'b')], { a: response });
    expect(result.selections.get(targetKey('npm', 'a'))).toMatchObject({ selected: null });
    expect(outcomeOf('osv', versionUnitKeys.osvTarget(t))).toEqual({
      ok: false,
      reason: 'prerequisite',
    });
    expect(calls.osv.flat().map((q) => q.name)).toEqual(['b']);
    expect(result.osv.has(targetKey('npm', 'a'))).toBe(false);
  });

  it('selects nothing and sends nothing for a package without a default version', async () => {
    const { calls, ledger, run } = setup();
    const result = await run([target('npm', 'a', '^1')], { a: ok({ versions: [] }) });
    expect(result.selections.get(targetKey('npm', 'a'))).toMatchObject({ selected: null });
    expect(calls.osv).toEqual([]);
    expect(ledger.entries).toEqual([]);
  });
});

describe('runVersionStage OSV batches (R9.1, R9.2, R9.3)', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => target('npm', `p${i}`));

  it('sends no request without a Selected_Version', async () => {
    const { calls, run } = setup();
    await run([], {});
    expect(calls.osv).toEqual([]);
  });

  it.each([
    [OSV_BATCH_SIZE, [OSV_BATCH_SIZE]],
    [OSV_BATCH_SIZE + 1, [OSV_BATCH_SIZE, 1]],
  ])('sends %i queries in batches of %j', async (count, sizes) => {
    const { calls, ledger, run } = setup();
    const result = await run(many(count), {});
    expect(calls.osv.map((b) => b.length)).toEqual(sizes);
    expect(ledger.entries.filter((e) => e.source === 'osv')).toHaveLength(sizes.length);
    expect(result.osv.size).toBe(count);
  });

  it('maps results to targets by position', async () => {
    const { run } = setup({
      osv: () =>
        Promise.resolve(ok({ results: [{ vulns: [{ id: 'GHSA-2' }, { id: 'GHSA-1' }] }, {}] })),
    });
    const result = await run([target('npm', 'a'), target('cargo', 'c')], {});
    expect(result.osv.get(targetKey('npm', 'a'))).toEqual({
      kind: 'ids',
      ids: ['GHSA-1', 'GHSA-2'],
      truncated: false,
    });
    expect(result.osv.get(targetKey('cargo', 'c'))).toEqual({
      kind: 'ids',
      ids: [],
      truncated: false,
    });
  });

  it('uses the OSV ecosystem names', async () => {
    const { calls, run } = setup();
    await run([target('npm', 'a'), target('pypi', 'p', '==1.0.0'), target('cargo', 'c', '=1.0.0')], {});
    expect(calls.osv.flat().map((q) => q.ecosystem).sort()).toEqual(['PyPI', 'crates.io', 'npm']);
  });

  it('counts a length mismatch as a failed http-error unit and marks its targets unavailable', async () => {
    const { run, outcomeOf } = setup({
      osv: () => Promise.resolve(ok({ results: [{}] })),
    });
    const result = await run([target('npm', 'a'), target('npm', 'b')], {});
    expect(outcomeOf('osv', versionUnitKeys.osvBatch(0))).toEqual({
      ok: false,
      reason: 'http-error',
    });
    expect(result.osv.get(targetKey('npm', 'a'))).toBe('unavailable');
    expect(result.osv.get(targetKey('npm', 'b'))).toBe('unavailable');
  });

  it('keeps a mismatch in one batch from affecting the other', async () => {
    let n = 0;
    const { run, outcomeOf } = setup({
      osv: (q) => {
        n += 1;
        return Promise.resolve(ok({ results: n === 1 ? [] : q.map(() => ({})) }));
      },
    });
    const result = await run(many(OSV_BATCH_SIZE + 1), {});
    const states = [...result.osv.values()].filter((v) => v === 'unavailable').length;
    expect(states === OSV_BATCH_SIZE || states === 1).toBe(true);
    const outcomes = [0, 1].map((i) => outcomeOf('osv', versionUnitKeys.osvBatch(i))?.ok);
    expect(outcomes.sort()).toEqual([false, true]);
  });

  it('marks targets unavailable and records the reason when the request fails', async () => {
    const { run, outcomeOf } = setup({ osv: () => Promise.resolve(failed) });
    const result = await run([target('npm', 'a')], {});
    expect(result.osv.get(targetKey('npm', 'a'))).toBe('unavailable');
    expect(outcomeOf('osv', versionUnitKeys.osvBatch(0))).toEqual({ ok: false, reason: 'timeout' });
  });
});

describe('runVersionStage PyPI per-version request (R12.5, R12.16)', () => {
  it('requests the project once with the name, the Selected_Version and the context', async () => {
    const { calls, ctx, run, outcomeOf } = setup({
      pypi: () => Promise.resolve(ok({ ownership: { roles: [] } })),
    });
    const t = target('pypi', 'p', '==1.0.0');
    const result = await run([t, target('npm', 'a')], {});
    expect(calls.pypi).toEqual([{ name: 'p', version: '1.0.0', ctx }]);
    expect(result.pypiProjects.get(targetKey('pypi', 'p'))).toEqual({
      state: 'ok',
      body: { ownership: { roles: [] } },
    });
    expect(result.pypiProjects.has(targetKey('npm', 'a'))).toBe(false);
    expect(outcomeOf('pypi', versionUnitKeys.pypiProject('p', '1.0.0'))).toEqual({ ok: true });
  });

  it('uses the default version for an unpinned pypi target', async () => {
    const { calls, run } = setup();
    await run([target('pypi', 'p', '>=1')], {});
    expect(calls.pypi.map((c) => c.version)).toEqual(['2.0.0']);
  });

  it('sends no request and counts no unit without a Selected_Version', async () => {
    const { calls, ledger, run } = setup();
    const result = await run([target('pypi', 'p')], { p: ok({ versions: [] }) });
    expect(calls.pypi).toEqual([]);
    expect(ledger.entries.some((e) => e.source === 'pypi')).toBe(false);
    expect(result.pypiProjects.size).toBe(0);
  });

  it('maps absent and failed answers to Fetched states', async () => {
    const { run } = setup({
      pypi: (name) => Promise.resolve(name === 'p' ? absent : failed),
    });
    const result = await run(
      [target('pypi', 'p', '==1.0.0'), target('pypi', 'q', '==1.0.0')],
      {},
    );
    expect(result.pypiProjects.get(targetKey('pypi', 'p'))).toEqual({ state: 'absent' });
    expect(result.pypiProjects.get(targetKey('pypi', 'q'))).toEqual({ state: 'unavailable' });
  });
});
