// Requirements 5.1, 5.2, 5.4, 5.5, 5.8, 5.9, 5.10, 5.11, 5.12
import { describe, expect, it, vi } from 'vitest';
import { CONSTANTS, parseManifest } from '../../../core';
import { discoverManifests } from '../../../pipeline/mapping';
import type { DiscoveryLimits, SelectionLimits } from '../../../pipeline/mapping';
import type { GithubSource, RequestContext, SourceResult } from '../../../pipeline/ports';
import { GithubBudget } from '../../../pipeline/scan/github-budget';
import { WorkLedger } from '../../../pipeline/scan/ledger';
import { renderErrorMessage } from '../../../pipeline/scan/messages';
import {
  manifestFetchFailedNote,
  manifestTooLargeNote,
  noManifestsNote,
  noRootManifestNote,
  treeTruncatedNote,
} from '../../../pipeline/scan/notes';
import { createUnitRunner } from '../../../pipeline/scan/run-unit';
import type { DiscoveryStageOutput } from '../../../pipeline/scan/stage-discovery';
import {
  manifestUnitKey,
  runManifestStage,
  selectManifestStage,
} from '../../../pipeline/scan/stage-manifests';

const WEB_HOST = 'github.com';
const SHA = 'c'.repeat(40);
const NAMES = ['package.json', 'requirements.txt', 'Cargo.toml'];
const DISCOVERY_LIMITS: DiscoveryLimits = {
  maxDepth: 4,
  maxManifests: 50,
  manifestNames: NAMES,
  skipDirs: ['node_modules'],
};
const LIMITS: SelectionLimits = { maxManifests: 3, manifestNames: NAMES };

interface Entry {
  path: string;
  size?: number;
  sha?: string;
}

function discovered(entries: Entry[], truncated = false): DiscoveryStageOutput {
  const treeBody = {
    truncated,
    tree: entries.map((e) => ({
      path: e.path,
      type: 'blob',
      size: e.size ?? 10,
      sha: e.sha ?? `sha-${e.path}`,
    })),
  };
  const result = discoverManifests(treeBody, DISCOVERY_LIMITS);
  if (!result.ok) throw new Error('discovery failed');
  return {
    owner: 'Owner',
    repo: 'Repo',
    branch: 'main',
    defaultBranch: 'main',
    commitSha: SHA,
    discovery: result.value,
    treeBody,
  };
}

const okText = (body: string): SourceResult<string> => ({
  kind: 'ok',
  status: 200,
  body,
  headers: {},
  fromCache: false,
});
const failedFetch: SourceResult<string> = {
  kind: 'failed',
  reason: 'http-error',
  status: 500,
  headers: null,
};

const PKG = JSON.stringify({ dependencies: { left: '^1.0.0' } });
const REQ = 'requests==2.0.0\n';
const CARGO = '[dependencies]\nserde = "1"\n';
const TEXTS: Record<string, string> = {
  'package.json': PKG,
  'requirements.txt': REQ,
  'Cargo.toml': CARGO,
};
const textFor = (path: string): string => TEXTS[path.slice(path.lastIndexOf('/') + 1)] ?? '';

type Fetch = (path: string, sha: string | null) => Promise<SourceResult<string>>;

function setup(
  disc: DiscoveryStageOutput,
  requested: string[] = [],
  fetch: Fetch = (p) => Promise.resolve(okText(textFor(p))),
) {
  const fetched: string[] = [];
  const shas: (string | null)[] = [];
  const getManifestText = vi.fn(
    (_ref: unknown, _commit: string, path: string, sha: string | null) => {
      fetched.push(path);
      shas.push(sha);
      return fetch(path, sha);
    },
  );
  const github = { getManifestText } as unknown as GithubSource;
  const controller = new AbortController();
  const ledger = new WorkLedger();
  const ctx: RequestContext = { signal: controller.signal, deadlineAtMs: 0 };
  const run = () =>
    runManifestStage({
      github,
      runner: createUnitRunner(ledger, controller.signal),
      budget: new GithubBudget(),
      ctx,
      discovered: disc,
      requested,
      limits: LIMITS,
      webHost: WEB_HOST,
    });
  return { run, fetched, shas, getManifestText, controller, ledger };
}

describe('runManifestStage', () => {
  it('selects the Root_Manifests by default, in code point order (R5.1)', async () => {
    const disc = discovered([
      { path: 'package.json' },
      { path: 'Cargo.toml' },
      { path: 'sub/requirements.txt' },
    ]);
    const s = setup(disc);
    const result = await s.run();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.selected).toEqual(['Cargo.toml', 'package.json']);
    expect(s.fetched).toEqual(['Cargo.toml', 'package.json']);
    expect(result.value.manifests.map((m) => m.path)).toEqual(['Cargo.toml', 'package.json']);
    expect(result.value.notes).toEqual([]);
  });

  it('fetches an explicit list, de-duplicated and sorted, including nested paths (R5.4)', async () => {
    const disc = discovered([
      { path: 'package.json' },
      { path: 'b/requirements.txt' },
      { path: 'a/package.json' },
    ]);
    const s = setup(disc, ['b/requirements.txt', 'a/package.json', 'b/requirements.txt']);
    const result = await s.run();
    expect(result.ok && result.value.selected).toEqual(['a/package.json', 'b/requirements.txt']);
    expect(s.fetched).toEqual(['a/package.json', 'b/requirements.txt']);
    expect(s.ledger.entries.map((e) => e.unitKey)).toEqual([
      manifestUnitKey('a/package.json'),
      manifestUnitKey('b/requirements.txt'),
    ]);
    expect(manifestUnitKey('a/package.json')).toBe('github:manifest:a/package.json');
  });

  it('returns too-many-manifests when the list exceeds the limit, before any request (R5.4)', async () => {
    const disc = discovered([{ path: 'package.json' }]);
    const s = setup(disc, ['a/package.json', 'b/package.json', 'c/package.json', 'd/package.json']);
    const result = await s.run();
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'too-many-manifests',
        message: renderErrorMessage('too-many-manifests', { limit: 3 }, WEB_HOST),
        details: { limit: 3, candidates: ['package.json'] },
      },
    });
    expect(s.getManifestText).not.toHaveBeenCalled();
  });

  it('returns manifest-not-found for a path missing from the tree (R5.5)', async () => {
    const s = setup(discovered([{ path: 'package.json' }]), ['package.json', 'x/package.json']);
    const result = await s.run();
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'manifest-not-found',
        message: renderErrorMessage('manifest-not-found', { path: 'x/package.json' }, WEB_HOST),
        details: { path: 'x/package.json', candidates: ['package.json'] },
      },
    });
    expect(s.getManifestText).not.toHaveBeenCalled();
  });

  it('returns an empty candidates list for an empty tree (R8.3)', async () => {
    const s = setup(discovered([]), ['x/package.json']);
    const result = await s.run();
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'manifest-not-found', details: { path: 'x/package.json', candidates: [] } },
    });
  });
  it('returns manifest-not-found for a tree path that is not a manifest name (R5.5)', async () => {
    const s = setup(discovered([{ path: 'package.json' }, { path: 'README.md' }]), ['README.md']);
    const result = await s.run();
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'manifest-not-found', details: { path: 'README.md' } },
    });
  });

  it('skips an oversize manifest: note, no request, no Work_Unit, still selected (R5.8)', async () => {
    const disc = discovered([
      { path: 'package.json', size: CONSTANTS.MAX_MANIFEST_LENGTH + 1 },
      { path: 'Cargo.toml', size: CONSTANTS.MAX_MANIFEST_LENGTH },
    ]);
    const s = setup(disc);
    const result = await s.run();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.selected).toEqual(['Cargo.toml', 'package.json']);
    expect(s.fetched).toEqual(['Cargo.toml']);
    expect(s.ledger.entries.map((e) => e.unitKey)).toEqual([manifestUnitKey('Cargo.toml')]);
    expect(result.value.manifests.map((m) => m.path)).toEqual(['Cargo.toml']);
    expect(result.value.notes).toEqual([manifestTooLargeNote('package.json')]);
  });

  it('continues after a failed fetch and notes it (R5.9)', async () => {
    const disc = discovered([{ path: 'Cargo.toml' }, { path: 'package.json' }]);
    const s = setup(disc, [], (p) =>
      Promise.resolve(p === 'Cargo.toml' ? failedFetch : okText(PKG)),
    );
    const result = await s.run();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.manifests.map((m) => m.path)).toEqual(['package.json']);
    expect(result.value.notes).toEqual([manifestFetchFailedNote('Cargo.toml')]);
    expect(result.value.selected).toEqual(['Cargo.toml', 'package.json']);
    expect(s.ledger.entries.map((e) => e.outcome)).toEqual([
      { ok: false, reason: 'http-error' },
      { ok: true },
    ]);
  });

  it('treats an unparsable or non-string body as a failed fetch (R5.9)', async () => {
    const disc = discovered([{ path: 'Cargo.toml' }, { path: 'package.json' }]);
    const s = setup(disc, [], (p) =>
      Promise.resolve(
        p === 'Cargo.toml'
          ? { kind: 'unparsable', status: 200, headers: {} }
          : ({ kind: 'ok', status: 200, body: 5, headers: {}, fromCache: false } as never),
      ),
    );
    const result = await s.run();
    expect(result.ok && result.value.manifests).toEqual([]);
    expect(result.ok && result.value.notes).toEqual([
      manifestFetchFailedNote('Cargo.toml'),
      manifestFetchFailedNote('package.json'),
    ]);
  });

  it('treats a throwing source as a failed fetch', async () => {
    const s = setup(discovered([{ path: 'package.json' }]), [], () => {
      throw new Error('boom');
    });
    const result = await s.run();
    expect(result.ok && result.value.notes).toEqual([manifestFetchFailedNote('package.json')]);
  });

  it('returns an empty result with notes when every fetch fails (R5.9)', async () => {
    const disc = discovered([{ path: 'Cargo.toml' }, { path: 'package.json' }]);
    const s = setup(disc, [], () => Promise.resolve(failedFetch));
    const result = await s.run();
    expect(result).toEqual({
      ok: true,
      value: {
        selected: ['Cargo.toml', 'package.json'],
        manifests: [],
        notes: [manifestFetchFailedNote('Cargo.toml'), manifestFetchFailedNote('package.json')],
      },
    });
  });

  it('keeps parser warnings in order and takes dependencies from the ParseResult (R5.10, R5.11)', async () => {
    const text = JSON.stringify({
      dependencies: { left: '^1.0.0', '': '1' },
      devDependencies: 'oops',
    });
    const expected = parseManifest(text, 'package.json');
    expect(expected.warnings.length).toBeGreaterThan(1);
    const s = setup(discovered([{ path: 'package.json' }]), [], () =>
      Promise.resolve(okText(text)),
    );
    const result = await s.run();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.manifests).toEqual([
      {
        path: 'package.json',
        format: 'package.json',
        warnings: expected.warnings,
        dependencies: expected.dependencies,
      },
    ]);
  });

  it('derives the ecosystem only from the parser output of each format (R5.12)', async () => {
    const disc = discovered([
      { path: 'Cargo.toml' },
      { path: 'package.json' },
      { path: 'requirements.txt' },
    ]);
    const s = setup(disc, [], () => Promise.resolve(okText(PKG)));
    const result = await s.run();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Every body is package.json text; each is parsed with the format of its file name.
    for (const m of result.value.manifests) {
      const expected = parseManifest(PKG, m.format);
      expect(m.dependencies).toEqual(expected.dependencies);
      expect(m.warnings).toEqual(expected.warnings);
    }
    const byPath = new Map(result.value.manifests.map((m) => [m.path, m]));
    expect(byPath.get('package.json')?.dependencies.every((d) => d.ecosystem === 'npm')).toBe(true);
    expect(byPath.get('package.json')?.dependencies).toHaveLength(1);
  });

  it('passes the commit sha and the tree entry sha to the source (GHES blobs)', async () => {
    const s = setup(
      discovered([{ path: 'package.json', sha: 'blob-1' }, { path: 'Cargo.toml', sha: 'blob-2' }]),
    );
    await s.run();
    expect(s.shas).toEqual(['blob-2', 'blob-1']);
    expect(s.getManifestText.mock.calls[0]?.[1]).toBe(SHA);
    expect(s.getManifestText.mock.calls[0]?.[0]).toEqual({ owner: 'Owner', repo: 'Repo' });
  });

  it('fails the remaining manifests with reason deadline once the signal aborts', async () => {
    const disc = discovered([
      { path: 'Cargo.toml' },
      { path: 'package.json' },
      { path: 'requirements.txt' },
    ]);
    const s = setup(disc, [], (p) => {
      const r = Promise.resolve(okText(textFor(p)));
      if (p === 'Cargo.toml') s.controller.abort();
      return r;
    });
    const result = await s.run();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The abort fires while the first request is pending, so it also loses to the deadline.
    expect(result.value.manifests).toEqual([]);
    expect(result.value.notes).toEqual([
      manifestFetchFailedNote('Cargo.toml'),
      manifestFetchFailedNote('package.json'),
      manifestFetchFailedNote('requirements.txt'),
    ]);
    expect(s.fetched).toEqual(['Cargo.toml']);
    expect(s.ledger.entries.map((e) => e.outcome)).toEqual([
      { ok: false, reason: 'deadline' },
      { ok: false, reason: 'deadline' },
      { ok: false, reason: 'deadline' },
    ]);
  });

  it('keeps manifests fetched before the deadline and fails the rest', async () => {
    const disc = discovered([{ path: 'Cargo.toml' }, { path: 'package.json' }]);
    const s = setup(disc);
    // Abort right after the first unit is recorded.
    const record = s.ledger.record.bind(s.ledger);
    s.ledger.record = (...args: Parameters<typeof record>) => {
      const recorded = record(...args);
      s.controller.abort();
      return recorded;
    };
    const result = await s.run();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.manifests.map((m) => m.path)).toEqual(['Cargo.toml']);
    expect(result.value.notes).toEqual([manifestFetchFailedNote('package.json')]);
    expect(s.ledger.entries[1]?.outcome).toEqual({ ok: false, reason: 'deadline' });
  });

  describe('notes of the selection', () => {
    it('adds tree-truncated first (R4.6)', async () => {
      const s = setup(discovered([{ path: 'package.json' }], true));
      const result = await s.run();
      expect(result.ok && result.value.notes).toEqual([treeTruncatedNote()]);
    });

    it('adds no-manifests when nothing was discovered (R4.8)', async () => {
      const s = setup(discovered([{ path: 'README.md' }]));
      const result = await s.run();
      expect(result).toEqual({
        ok: true,
        value: { selected: [], manifests: [], notes: [noManifestsNote()] },
      });
      expect(s.getManifestText).not.toHaveBeenCalled();
    });

    it('adds tree-truncated before no-manifests', async () => {
      const result = await setup(discovered([], true)).run();
      expect(result.ok && result.value.notes).toEqual([treeTruncatedNote(), noManifestsNote()]);
    });

    it('adds no-root-manifest with the candidate paths and fetches nothing (R5.2)', async () => {
      const s = setup(discovered([{ path: 'b/package.json' }, { path: 'a/Cargo.toml' }]));
      const result = await s.run();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.selected).toEqual([]);
      expect(result.value.notes).toEqual([
        noRootManifestNote(
          discovered([{ path: 'b/package.json' }, { path: 'a/Cargo.toml' }]).discovery.candidates.map(
            (c) => c.path,
          ),
        ),
      ]);
      expect(s.getManifestText).not.toHaveBeenCalled();
    });

    it('adds neither no-manifests nor no-root-manifest for an explicit list', async () => {
      const s = setup(discovered([{ path: 'a/package.json' }]), ['a/package.json']);
      const result = await s.run();
      expect(result.ok && result.value.notes).toEqual([]);
    });
  });
});

describe('selectManifestStage', () => {
  it('returns the selection and sizes without any request', () => {
    const result = selectManifestStage({
      discovered: discovered([{ path: 'package.json', size: 42 }]),
      requested: [],
      limits: LIMITS,
      webHost: WEB_HOST,
    });
    expect(result).toEqual({
      ok: true,
      value: { selected: ['package.json'], notes: [], sizes: new Map([['package.json', 42]]) },
    });
  });
});
