// resurrect-upgrade Requirements 1.1, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10
import { describe, expect, it } from 'vitest';
import { NPM_VERSION_DOCS_MAX } from '../../../pipeline/constants';
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
const failed: SourceResult<never> = { kind: 'failed', reason: 'timeout', status: null, headers: null };

const npmTarget = (name: string, spec = '1.0.0'): LookupTarget => ({
  ecosystem: 'npm',
  name,
  versionSpecs: [spec],
});

/** Package document: 1.0.0 deprecated, 2.0.0 the default. */
const deprecatedDoc = () => ({
  versions: [
    { versionKey: { version: '1.0.0' }, isDefault: false, isDeprecated: true },
    { versionKey: { version: '2.0.0' }, isDefault: true },
  ],
});

function setup(npmAnswer: () => SourceResult<never> = () => ok({ deprecated: 'old' })) {
  const npmCalls: { name: string; version: string }[] = [];
  const sources = {
    depsdev: {
      getVersionBatch: () => Promise.resolve(ok({ responses: [] })),
      getVersion: () => Promise.resolve(ok({})),
    },
    osv: { queryBatch: (q: unknown[]) => Promise.resolve(ok({ results: q.map(() => ({})) })) },
    pypi: { getProject: () => Promise.resolve(ok({})) },
    npm: {
      getVersion: (name: string, version: string) => {
        npmCalls.push({ name, version });
        return Promise.resolve(npmAnswer());
      },
    },
  } as never;
  const ledger = new WorkLedger();
  const controller = new AbortController();
  const runner = createUnitRunner(ledger, controller.signal);
  const ctx: RequestContext = { signal: controller.signal, deadlineAtMs: 0 };
  const run = (targets: LookupTarget[], latest: Record<string, SourceResult<never>> = {}) =>
    runVersionStage({
      sources,
      runner,
      ctx,
      targets,
      depsdevPackages: new Map(targets.map((t) => [targetKey('npm', t.name), ok(deprecatedDoc())])) as never,
      npmLatest: new Map(
        targets.flatMap((t) => (latest[t.name] ? [[targetKey('npm', t.name), latest[t.name]]] : [])),
      ) as never,
      webHost: 'github.com',
    });
  return { npmCalls, ledger, run };
}

describe('runVersionStage npm Version_Document (R1.1, R1.5 to R1.10)', () => {
  it('requests the selected version once for a deprecated, differing target', async () => {
    const { npmCalls, ledger, run } = setup();
    const result = await run([npmTarget('a')]);
    expect(npmCalls).toEqual([{ name: 'a', version: '1.0.0' }]);
    expect(result.npmVersions.get(targetKey('npm', 'a'))).toEqual({
      state: 'ok',
      body: { deprecated: 'old' },
    });
    expect(
      ledger.entries.some((e) => e.source === 'npm' && e.unitKey === versionUnitKeys.npmVersion('a', '1.0.0')),
    ).toBe(true);
  });

  it('caps the requests at NPM_VERSION_DOCS_MAX, taking names in code point order', async () => {
    const { npmCalls, run } = setup();
    const names = Array.from({ length: 45 }, (_, i) => `pkg-${String(i).padStart(2, '0')}`);
    const reversed = [...names].reverse();
    const result = await run(reversed.map((n) => npmTarget(n)));
    expect(npmCalls).toHaveLength(NPM_VERSION_DOCS_MAX);
    expect(npmCalls.map((c) => c.name).sort()).toEqual(names.slice(0, NPM_VERSION_DOCS_MAX));
    expect(result.npmVersions.size).toBe(NPM_VERSION_DOCS_MAX);
  });

  it('gives no body for an absent or failed answer and still returns', async () => {
    for (const answer of [absent, failed]) {
      const { run } = setup(() => answer);
      const result = await run([npmTarget('a')]);
      const entry = result.npmVersions.get(targetKey('npm', 'a'));
      expect(entry).toEqual({ state: answer.kind === 'absent' ? 'absent' : 'unavailable' });
      expect(result.selections.get(targetKey('npm', 'a'))?.selected).toBe('1.0.0');
    }
  });

  it('sends no request when the checked version equals the latest', async () => {
    const { npmCalls, run } = setup();
    const result = await run([npmTarget('a')], { a: ok({ version: '1.0.0' }) });
    expect(npmCalls).toEqual([]);
    expect(result.npmVersions.size).toBe(0);
  });
});
