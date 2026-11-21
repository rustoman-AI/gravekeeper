import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { MemoryCacheStore } from '../../../adapters/cache/memory-cache-store';
import { CachingHttpClient } from '../../../adapters/http/caching-http-client';
import { createCratesIoSource } from '../../../adapters/cratesio/cratesio-source';
import { createDepsDevSource } from '../../../adapters/depsdev/depsdev-source';
import { createGithubSource } from '../../../adapters/github/github-source';
import { createNpmSource } from '../../../adapters/npm/npm-source';
import { createOsvSource } from '../../../adapters/osv/osv-source';
import { createPypiSource } from '../../../adapters/pypi/pypi-source';
import {
  GITHUB_DEFAULT_WEB_HOST,
  OSV_MAX_ADVISORY_DETAILS,
  SCAN_MAX_DEPENDENCIES,
  SCAN_MAX_MANIFESTS,
} from '../../../pipeline/constants';
import { readGithubConfig } from '../../../pipeline/config/github-config';
import { createScanCache } from '../../../pipeline/scan/scan-cache';
import { runScan } from '../../../pipeline/scan/run-scan';
import type { ScanDeps } from '../../../pipeline/scan/types';
import { buildPackageRows } from '../../../view-model/package-rows';
import { parseScanResponse } from '../../../view-model/parse-response';
import { buildResurrectModel } from '../../../view-model/resurrect';
import { lookupCurated } from '../../../view-model/resurrections';
import type { PackageRow, ParsedScanResult } from '../../../view-model/types';
import { createFakeRuntime } from '../../support/fake-runtime';
import { FixtureHttpClient } from '../../support/fixture-http-client';
import { makeRow } from '../../support/arbitraries/resurrect';
import { buildScanResult } from '../../support/ui/scan-result-builder';

// Resurrect Requirements 9.1, 9.3 to 9.11, 10.1, 12.4, 12.5.
const FIXTURES = join(__dirname, '..', '..', 'fixtures');

async function replay(name: string, owner: string, repo: string): Promise<ParsedScanResult> {
  const dir = join(FIXTURES, name);
  const meta = JSON.parse(readFileSync(join(dir, 'metadata.json'), 'utf8')) as { asOf: string };
  const parsedConfig = readGithubConfig({});
  if (!parsedConfig.ok) throw new Error('default GitHub configuration is invalid');
  const config = parsedConfig.value;
  const startedAtMs = Date.parse(meta.asOf);
  const runtime = createFakeRuntime(startedAtMs);
  const fixture = new FixtureHttpClient(dir);
  const http = new CachingHttpClient(fixture, new MemoryCacheStore(runtime.clock));
  const deps: ScanDeps = {
    sources: {
      github: createGithubSource(http, config, true),
      depsdev: createDepsDevSource(http),
      osv: createOsvSource(http),
      npm: createNpmSource(http),
      cratesio: createCratesIoSource({ http, userAgent: 'gravekeeper-fixture-replay' }),
      pypi: createPypiSource(http),
    },
    clock: runtime.clock,
    timer: runtime.timer,
    random: runtime.random,
    logger: { log: () => undefined },
    scanCache: createScanCache(new MemoryCacheStore(runtime.clock)),
    config,
    limits: {
      maxManifests: SCAN_MAX_MANIFESTS,
      maxDependencies: SCAN_MAX_DEPENDENCIES,
      maxAdvisoryDetails: OSV_MAX_ADVISORY_DETAILS,
    },
    deadlineMs: 300_000,
  };
  const outcome = await runScan(
    {
      repo: { host: GITHUB_DEFAULT_WEB_HOST, owner, repo, branch: null },
      manifests: [],
      asOf: meta.asOf,
      startedAtMs,
    },
    deps,
  );
  fixture.assertNoMisses();
  if (!outcome.ok) throw new Error(`scan failed: ${JSON.stringify(outcome.error)}`);
  const wire: unknown = JSON.parse(JSON.stringify({ ...outcome.value.result, ok: true }));
  const parsed = parseScanResponse(200, { get: () => null }, wire);
  if (parsed.kind !== 'result') throw new Error(`response did not parse: ${parsed.kind}`);
  return parsed.result;
}

const FALLBACK_WORDS = /archived|deprecated|forgotten|finished/;

describe('buildResurrectModel on the recorded request/request set', () => {
  let result: ParsedScanResult;
  let rows: readonly PackageRow[];
  const model = (name: string) => {
    const row = rows.find((r) => r.name === name && r.ecosystem === 'npm');
    expect(row, `row ${name}`).toBeDefined();
    return { row: row!, model: buildResurrectModel(row!, result) };
  };

  beforeAll(async () => {
    result = await replay('request__request', 'request', 'request');
    rows = buildPackageRows(result);
  }, 60_000);

  it('har-validator shows the deprecation hint, no suggestions and no fallback', () => {
    const { row, model: m } = model('har-validator');
    expect(row.hints.length).toBeGreaterThan(0);
    expect(m).not.toBeNull();
    expect(m!.heading).toBe('Resurrect');
    expect(m!.hints).toHaveLength(row.hints.length);
    expect(m!.hints[0]!.label).toBe("From the package's deprecation notice");
    expect(m!.hints[0]!.text).toBe(row.hints[0]!.text);
    expect(m!.hints[0]!.link).toEqual({
      href: 'https://www.npmjs.com/package/har-validator',
      label: 'Read it on the registry page',
    });
    expect(m!.suggestions).toEqual([]);
    expect(m!.fallback).toBeNull();
  });

  it('phantomjs-prebuilt shows the deprecation hint, no suggestions and no fallback', () => {
    const { row, model: m } = model('phantomjs-prebuilt');
    expect(row.hints.length).toBeGreaterThan(0);
    expect(m!.hints[0]!.label).toBe("From the package's deprecation notice");
    expect(m!.suggestions).toEqual([]);
    expect(m!.fallback).toBeNull();
  });

  it('aws-sign2 shows the forgotten paragraph and the unverified repository links', () => {
    const { model: m } = model('aws-sign2');
    expect(m!.urgent).toBeNull();
    expect(m!.hints).toEqual([]);
    expect(m!.suggestions).toEqual([]);
    expect(m!.fallback!.kind).toBe('forgotten');
    expect(m!.fallback!.paragraph).toContain('Pinning the version or vendoring the code is an option.');
    expect(m!.fallback!.paragraph).not.toContain('aws-sign2');
    const labels = m!.fallback!.links.map((l) => l.label);
    expect(labels).toEqual([
      'Read it on the registry page',
      'Source repository (listed by the package, not verified)',
      'Issues (listed by the package, not verified)',
    ]);
    const [, repo, issues] = m!.fallback!.links;
    expect(issues!.href).toBe(`${repo!.href}/issues`);
    expect(repo!.href).toMatch(/^https:\/\/github\.com\//);
  });

  it('uuid shows the urgent sentence and the buried paragraph and names no package', () => {
    const { row, model: m } = model('uuid');
    expect(row.kind).toBe('restless');
    expect(m!.urgent).toMatch(/^This (package has \d+ open vulnerabilit(y|ies)|package is haunted by open vulnerabilities), so moving off it is urgent\.$/);
    expect(m!.fallback!.kind).toBe('buried');
    expect(m!.fallback!.paragraph).toMatch(FALLBACK_WORDS);
    expect(m!.fallback!.paragraph).not.toContain('uuid');
    expect(m!.urgent).not.toContain('uuid');
  });
});

describe('buildResurrectModel on synthetic rows', () => {
  const emptyResult = buildScanResult([]) as unknown as ParsedScanResult;
  const requestEntry = lookupCurated('npm', 'request');

  it('shows the curated entry for a synthetic request row with the npm commands', () => {
    expect(requestEntry).not.toBeNull();
    const m = buildResurrectModel(makeRow({ name: 'request', plotCase: 'buried-deprecated' }), emptyResult);
    expect(m!.fallback).toBeNull();
    expect(m!.suggestions).toHaveLength(1);
    const s = m!.suggestions[0]!;
    expect(s.label).toBe("From the caretaker's list");
    expect(s.why).toBe(requestEntry!.why);
    expect(s.source).toEqual({ href: requestEntry!.source, label: 'Source for this suggestion' });
    expect(s.alternatives.map((a) => a.name)).toEqual([...requestEntry!.to]);
    for (const alt of s.alternatives) {
      expect(alt.blocks).toHaveLength(1);
      expect(alt.blocks[0]!.lines).toEqual(['npm uninstall request', `npm install ${alt.name}`]);
      expect(alt.blocks[0]!.copyLabel).toBe(`Copy commands for ${alt.name}`);
      expect(alt.blocks[0]!.copyText).toBe(alt.blocks[0]!.lines.join('\n'));
    }
  });

  it('adds the dev flag to the install line for a dev dependency', () => {
    const m = buildResurrectModel(makeRow({ name: 'request', scopes: ['dev'] }), emptyResult);
    const first = m!.suggestions[0]!.alternatives[0]!;
    expect(first.blocks[0]!.lines[1]).toBe(`npm install --save-dev ${first.name}`);
  });

  it('shows the advisory hint and the cargo commands for the alternatives of bincode', () => {
    const entry = lookupCurated('cargo', 'bincode');
    expect(entry).not.toBeNull();
    const hint = {
      kind: 'advisory-notice' as const,
      text: 'Bincode is unmaintained.',
      sourceUrl: 'https://osv.dev/vulnerability/RUSTSEC-2025-0141',
      link: null,
    };
    const m = buildResurrectModel(
      makeRow({ name: 'bincode', ecosystem: 'cargo', plotCase: 'buried-deprecated', hints: [hint] }),
      emptyResult,
    );
    expect(m!.hints).toEqual([
      {
        label: 'From an advisory that marks this crate unmaintained',
        text: 'Bincode is unmaintained.',
        link: { href: hint.sourceUrl, label: 'Read the advisory' },
      },
    ]);
    expect(m!.fallback).toBeNull();
    const alts = m!.suggestions[0]!.alternatives;
    expect(alts.map((a) => a.name)).toEqual([...entry!.to]);
    expect(alts[0]!.blocks[0]!.lines).toEqual(['cargo remove bincode', `cargo add ${entry!.to[0]}`]);
  });

  it('uses the generic urgent sentence when the count is unknown and the singular for one', () => {
    const generic = buildResurrectModel(
      makeRow({ plotCase: 'restless-archived', openVulnerabilityCount: null }),
      emptyResult,
    );
    expect(generic!.urgent).toBe('This package is haunted by open vulnerabilities, so moving off it is urgent.');
    const one = buildResurrectModel(makeRow({ plotCase: 'restless-archived', openVulnerabilityCount: 1 }), emptyResult);
    expect(one!.urgent).toBe('This package has 1 open vulnerability, so moving off it is urgent.');
    const many = buildResurrectModel(makeRow({ plotCase: 'restless-archived', openVulnerabilityCount: 3 }), emptyResult);
    expect(many!.urgent).toBe('This package has 3 open vulnerabilities, so moving off it is urgent.');
  });

  it('names the reason words in the buried paragraph', () => {
    const word = (plotCase: 'buried' | 'buried-deprecated' | 'restless-both') =>
      buildResurrectModel(makeRow({ name: 'zzz', plotCase }), emptyResult)!.fallback!.paragraph;
    expect(word('buried')).toContain('marked archived.');
    expect(word('buried-deprecated')).toContain('marked deprecated.');
    expect(word('restless-both')).toContain('marked archived and deprecated.');
  });

  it('drops a curated entry whose only alternative is the package itself', () => {
    const entry = {
      ecosystem: 'pypi' as const,
      from: 'foo-bar',
      to: ['foo-bar'],
      why: 'Self.',
      source: 'https://example.com/',
    };
    const row = makeRow({ name: 'foo-bar', ecosystem: 'pypi' });
    const m = buildResurrectModel(row, emptyResult, () => ({ ...entry, to: ['foo_bar', 'Foo.Bar'] }));
    expect(m!.suggestions).toEqual([]);
    expect(m!.fallback).not.toBeNull();
  });

  it('gives the fallback for an injected entry whose names are all invalid (R7.6, R10.10)', () => {
    const entry = { ecosystem: 'npm' as const, from: 'request', to: ['', 'a b'], why: 'Bad.', source: 'https://example.com/' };
    const m = buildResurrectModel(makeRow({ name: 'request', plotCase: 'buried-deprecated' }), emptyResult, () => entry);
    expect(m!.suggestions).toEqual([]);
    expect(m!.fallback).not.toBeNull();
  });

  it('gives null for a ghost, an ALIVE package and an unassessed package', () => {
    for (const plotCase of ['ghost', 'alive', 'unassessed-git'] as const) {
      expect(buildResurrectModel(makeRow({ plotCase }), emptyResult)).toBeNull();
    }
  });
});
