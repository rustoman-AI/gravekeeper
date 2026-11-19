// Requirements 8.1, 12.1, 12.2, 12.5, 12.7, 12.14, 16.1
import { describe, expect, it } from 'vitest';
import type { Dependency, Ecosystem, Scope } from '../../../core';
import type { RequestContext, SourceResult } from '../../../pipeline/ports';
import { WorkLedger } from '../../../pipeline/scan/ledger';
import { createUnitRunner } from '../../../pipeline/scan/run-unit';
import { registryUnitKeys, runRegistryStage } from '../../../pipeline/scan/stage-registries';
import { targetKey } from '../../../pipeline/scan/targets';
import type { LookupTarget } from '../../../pipeline/scan/types';

const HEADERS = {} as never;
const ok = (body: unknown): SourceResult<never> =>
  ({ kind: 'ok', status: 200, body, headers: HEADERS, fromCache: false }) as never;
const absent: SourceResult<never> = { kind: 'absent', headers: HEADERS, fromCache: false };
const unparsable: SourceResult<never> = { kind: 'unparsable', status: 200, headers: HEADERS };

const target = (ecosystem: Ecosystem, name: string): LookupTarget => ({
  ecosystem,
  name,
  versionSpecs: ['1'],
});
const dep = (ecosystem: Ecosystem, name: string, scope: Scope): Dependency => ({
  name,
  rawName: name,
  ecosystem,
  versionSpec: '1',
  scope,
  sourceKind: 'registry',
});

type Respond = () => Promise<SourceResult<never>>;

function setup(
  responses: {
    depsdev?: (system: string, name: string) => Promise<SourceResult<never>>;
    npm?: (name: string) => Promise<SourceResult<never>>;
    owners?: (name: string) => Promise<SourceResult<never>>;
  } = {},
) {
  const calls = {
    depsdev: [] as string[],
    npm: [] as string[],
    owners: [] as string[],
  };
  const sources = {
    depsdev: {
      getPackage: (system: string, name: string) => {
        calls.depsdev.push(`${system}:${name}`);
        return (responses.depsdev ?? (() => Promise.resolve(ok({}))))(system, name);
      },
    },
    npm: {
      getLatest: (name: string) => {
        calls.npm.push(name);
        return (responses.npm ?? (() => Promise.resolve(ok({}))))(name);
      },
    },
    cratesio: {
      getOwners: (name: string) => {
        calls.owners.push(name);
        return (responses.owners ?? (() => Promise.resolve(ok({}))))(name);
      },
    },
  } as never;
  const ledger = new WorkLedger();
  const controller = new AbortController();
  const runner = createUnitRunner(ledger, controller.signal);
  const ctx: RequestContext = { signal: controller.signal, deadlineAtMs: 0 };
  const run = (targets: LookupTarget[], dependencies: Dependency[] = []) =>
    runRegistryStage({ sources, runner, ctx, targets, dependencies });
  return { calls, ledger, controller, run };
}

describe('runRegistryStage request counts', () => {
  it('sends deps.dev for every target, npm latest for npm, owners for cargo, nothing for PyPI', async () => {
    const { calls, run } = setup();
    const targets = [
      target('npm', 'a'),
      target('npm', 'b'),
      target('pypi', 'p'),
      target('cargo', 'c'),
    ];
    const result = await run(targets, [dep('cargo', 'c', 'runtime')]);
    expect(calls.depsdev.sort()).toEqual(['cargo:c', 'npm:a', 'npm:b', 'pypi:p']);
    expect(calls.npm.sort()).toEqual(['a', 'b']);
    expect(calls.owners).toEqual(['c']);
    expect([...result.depsdevPackages.keys()].sort()).toEqual(
      targets.map((t) => targetKey(t.ecosystem, t.name)).sort(),
    );
    expect([...result.npmLatest.keys()].sort()).toEqual(
      [targetKey('npm', 'a'), targetKey('npm', 'b')].sort(),
    );
    expect([...result.cratesOwners.keys()]).toEqual([targetKey('cargo', 'c')]);
  });

  it('makes no request and returns empty maps for no targets', async () => {
    const { calls, ledger, run } = setup();
    const result = await run([]);
    expect(calls).toEqual({ depsdev: [], npm: [], owners: [] });
    expect(ledger.entries).toEqual([]);
    expect(result.depsdevPackages.size + result.npmLatest.size + result.cratesOwners.size).toBe(0);
  });

  it('records one ledger unit per request with the stage unit keys', async () => {
    const { ledger, run } = setup();
    await run(
      [target('npm', 'a'), target('cargo', 'c')],
      [dep('cargo', 'c', 'runtime')],
    );
    const seen = ledger.entries.map((e) => `${e.source}|${e.unitKey}`).sort();
    expect(seen).toEqual(
      [
        `depsdev|${registryUnitKeys.depsdevPackage({ ecosystem: 'npm', name: 'a' })}`,
        `depsdev|${registryUnitKeys.depsdevPackage({ ecosystem: 'cargo', name: 'c' })}`,
        `npm|${registryUnitKeys.npmLatest('a')}`,
        `cratesio|${registryUnitKeys.cratesOwners('c')}`,
      ].sort(),
    );
    expect(ledger.entries.every((e) => e.outcome.ok)).toBe(true);
  });
});

describe('runRegistryStage crates order (R12.14)', () => {
  it('starts owners lookups by first scope runtime, build, dev, optional, then name', async () => {
    const { calls, run } = setup();
    const names = ['zopt', 'adev', 'bbuild', 'zrun', 'arun', 'mdev'];
    const scopes: Record<string, Scope[]> = {
      zopt: ['optional'],
      adev: ['dev'],
      bbuild: ['build'],
      zrun: ['dev', 'runtime'],
      arun: ['runtime'],
      mdev: ['dev'],
    };
    const dependencies = names.flatMap((n) => (scopes[n] ?? []).map((s) => dep('cargo', n, s)));
    await run(
      names.map((n) => target('cargo', n)),
      dependencies,
    );
    expect(calls.owners).toEqual(['arun', 'zrun', 'bbuild', 'adev', 'mdev', 'zopt']);
  });

  it('still looks up a cargo target without a dependency entry, last', async () => {
    const { calls, run } = setup();
    await run(
      [target('cargo', 'orphan'), target('cargo', 'x')],
      [dep('cargo', 'x', 'dev')],
    );
    expect(calls.owners).toEqual(['x', 'orphan']);
  });
});

describe('runRegistryStage outcomes', () => {
  it('treats a 404 as absent and an ok unit (R12.7)', async () => {
    const { ledger, run } = setup({
      depsdev: () => Promise.resolve(absent),
      npm: () => Promise.resolve(absent),
      owners: () => Promise.resolve(absent),
    });
    const result = await run([target('npm', 'a'), target('cargo', 'c')], [dep('cargo', 'c', 'runtime')]);
    expect(result.depsdevPackages.get(targetKey('npm', 'a'))).toMatchObject({ kind: 'absent' });
    expect(result.npmLatest.get(targetKey('npm', 'a'))).toMatchObject({ kind: 'absent' });
    expect(result.cratesOwners.get(targetKey('cargo', 'c'))).toMatchObject({ kind: 'absent' });
    expect(ledger.entries).toHaveLength(4);
    expect(ledger.entries.every((e) => e.outcome.ok)).toBe(true);
  });

  it('records an unparsable body as a failed http-error unit', async () => {
    const { ledger, run } = setup({ npm: () => Promise.resolve(unparsable) });
    const result = await run([target('npm', 'a')]);
    expect(result.npmLatest.get(targetKey('npm', 'a'))).toMatchObject({ kind: 'unparsable' });
    const latest = ledger.entries.find((e) => e.source === 'npm');
    expect(latest?.outcome).toEqual({ ok: false, reason: 'http-error' });
    expect(ledger.entries.find((e) => e.source === 'depsdev')?.outcome).toEqual({ ok: true });
  });

  it('keeps one failed unit from affecting the others', async () => {
    const failed: SourceResult<never> = {
      kind: 'failed',
      reason: 'timeout',
      status: null,
      headers: null,
    };
    const { ledger, run } = setup({
      depsdev: (_s, name) => Promise.resolve(name === 'bad' ? failed : ok({})),
    });
    const result = await run([target('npm', 'bad'), target('npm', 'good')]);
    expect(result.depsdevPackages.get(targetKey('npm', 'bad'))).toMatchObject({ kind: 'failed' });
    expect(result.depsdevPackages.get(targetKey('npm', 'good'))).toMatchObject({ kind: 'ok' });
    const bad = ledger.entries.find(
      (e) => e.unitKey === registryUnitKeys.depsdevPackage({ ecosystem: 'npm', name: 'bad' }),
    );
    expect(bad?.outcome).toEqual({ ok: false, reason: 'timeout' });
  });
});

describe('runRegistryStage deadline (R16.1)', () => {
  it('cuts the owners lookups still pending at the deadline', async () => {
    const pending: Respond = () => new Promise(() => undefined);
    const { calls, ledger, controller, run } = setup({
      owners: (name) => (name === 'first' ? Promise.resolve(ok({})) : pending()),
    });
    const running = run(
      [target('cargo', 'first'), target('cargo', 'second'), target('cargo', 'third')],
      [
        dep('cargo', 'first', 'runtime'),
        dep('cargo', 'second', 'dev'),
        dep('cargo', 'third', 'optional'),
      ],
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    const result = await running;
    expect(calls.owners).toEqual(['first', 'second', 'third']);
    expect(result.cratesOwners.get(targetKey('cargo', 'first'))).toMatchObject({ kind: 'ok' });
    for (const name of ['second', 'third']) {
      expect(result.cratesOwners.get(targetKey('cargo', name))).toMatchObject({
        kind: 'failed',
        reason: 'deadline',
      });
    }
    const owners = ledger.entries.filter((e) => e.source === 'cratesio');
    expect(owners.map((e) => e.outcome)).toEqual([
      { ok: true },
      { ok: false, reason: 'deadline' },
      { ok: false, reason: 'deadline' },
    ]);
  });

  it('sends nothing and records deadline for every unit when already aborted', async () => {
    const { calls, ledger, controller, run } = setup();
    controller.abort();
    await run([target('npm', 'a'), target('cargo', 'c')], [dep('cargo', 'c', 'runtime')]);
    expect(calls).toEqual({ depsdev: [], npm: [], owners: [] });
    expect(ledger.entries).toHaveLength(4);
    expect(ledger.entries.every((e) => !e.outcome.ok && e.outcome.reason === 'deadline')).toBe(true);
  });
});
