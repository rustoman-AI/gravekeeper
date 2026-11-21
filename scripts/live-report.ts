import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createProductionDeps } from '../adapters/composition';
import { readRuntimeEnv } from '../adapters/runtime/env';
import { readGithubToken } from '../adapters/runtime/token-reader';
import { mergeClassifications, uniquePackages } from '../core';
import type { AssessedDependency } from '../core';
import { createScanCache, handleScanRequest } from '../pipeline';
import type { ApiDeps, ApiResponse, RawScanRequest, ScanResult } from '../pipeline';
import { readGithubConfig } from '../pipeline/config/github-config';
import { CACHE_STATUS_HEADER, SCAN_MAX_DEPENDENCIES, SCAN_MAX_MANIFESTS } from '../pipeline/constants';
import type { Deferrer } from '../pipeline/ports/runtime';

// Requirement 3.12, 7.3, 6.2, 10.3 (scan-accuracy)
// Live report: runs real scans with the production stack. Flag-gated: needs
// GRAVEKEEPER_LIVE_TESTS=1 and GITHUB_TOKEN. The token is only read by readGithubToken and is
// never printed or written. The counting fetch records method, host and path pattern only.

const DEFAULT_REPOS = ['request/request', 'expressjs/express', 'psf/requests', 'BurntSushi/ripgrep'];
const DEFAULT_OUT = 'docs/scan-accuracy-live-report.md';
const DEFAULT_PER_PACKAGE_REPO = 'request/request';
const DEFAULT_TITLE = 'Scan accuracy live report';
const L1_KEYS = [
  Symbol.for('gravekeeper.l1.upstream-cache'),
  Symbol.for('gravekeeper.l1.scan-cache'),
] as const;
const SOURCES = ['github', 'depsdev', 'osv', 'npm', 'cratesio', 'pypi'] as const;
type Source = (typeof SOURCES)[number] | 'other';

// --- Request counting ---------------------------------------------------------------------

type Counts = Map<string, number>;

function sourceOf(host: string): Source {
  if (host === 'api.deps.dev') return 'depsdev';
  if (host === 'api.osv.dev') return 'osv';
  if (host === 'registry.npmjs.org') return 'npm';
  if (host === 'crates.io') return 'cratesio';
  if (host === 'pypi.org') return 'pypi';
  if (host.includes('github')) return 'github';
  return 'other';
}

function replaceAfter(segs: string[], keyword: string, label: string): void {
  const i = segs.indexOf(keyword);
  if (i >= 0 && i + 1 < segs.length) segs[i + 1] = label;
}

function patternOf(source: Source, host: string, path: string): string {
  const segs = path.split('/').filter((s) => s !== '');
  switch (source) {
    case 'github': {
      if (host.startsWith('raw.') || host.startsWith('codeload.')) {
        return `/{owner}/{repo}/{ref}/{path}`;
      }
      if (segs[0] === 'repos' && segs.length >= 3) {
        const rest = segs.slice(3);
        if (rest[0] === 'git' && rest[1] === 'trees') rest.splice(2, rest.length, '{ref}');
        if (rest[0] === 'contents') rest.splice(1, rest.length, '{path}');
        if (rest[0] === 'commits' || rest[0] === 'branches') rest.splice(1, 1, '{ref}');
        return `/repos/{owner}/{repo}${rest.length > 0 ? `/${rest.join('/')}` : ''}`;
      }
      return `/${segs.join('/')}`;
    }
    case 'depsdev': {
      replaceAfter(segs, 'systems', '{system}');
      replaceAfter(segs, 'packages', '{name}');
      replaceAfter(segs, 'versions', '{version}');
      replaceAfter(segs, 'advisories', '{id}');
      return `/${segs.join('/')}`;
    }
    case 'osv': {
      replaceAfter(segs, 'vulns', '{id}');
      return `/${segs.join('/')}`;
    }
    case 'npm': {
      const scoped = segs[0]?.startsWith('@') === true && !segs[0].includes('%');
      const nameLen = scoped ? 2 : 1;
      const rest = segs.slice(nameLen);
      return `/{package}${rest.length > 0 ? `/{version}` : ''}`;
    }
    case 'cratesio': {
      replaceAfter(segs, 'crates', '{crate}');
      const i = segs.indexOf('crates');
      if (i >= 0 && i + 2 < segs.length) {
        const tail = segs.slice(i + 2);
        if (tail[0] !== 'owners' && tail[0] !== 'versions' && tail[0] !== 'owner_user') {
          tail[0] = '{version}';
        }
        return `/${[...segs.slice(0, i + 2), ...tail].join('/')}`;
      }
      return `/${segs.join('/')}`;
    }
    case 'pypi': {
      // /pypi/{name}/json or /pypi/{name}/{version}/json
      if (segs[0] === 'pypi' && segs.length === 3) return '/pypi/{name}/json';
      if (segs[0] === 'pypi' && segs.length === 4) return '/pypi/{name}/{version}/json';
      return `/${segs.join('/')}`;
    }
    default:
      return `/${segs.join('/')}`;
  }
}

function describeRequest(input: unknown, init: unknown): string | null {
  try {
    let url: URL;
    let method = 'GET';
    if (typeof input === 'string') url = new URL(input);
    else if (input instanceof URL) url = input;
    else if (input instanceof Request) {
      url = new URL(input.url);
      method = input.method;
    } else return null;
    const initMethod = (init as { method?: unknown } | undefined)?.method;
    if (typeof initMethod === 'string') method = initMethod;
    const source = sourceOf(url.hostname);
    return `${source}\t${method.toUpperCase()} ${url.hostname}${patternOf(source, url.hostname, url.pathname)}`;
  } catch {
    return null;
  }
}

function installCountingFetch(counts: { current: Counts }): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: unknown, init?: unknown) => {
    const key = describeRequest(input, init) ?? 'other\tUNKNOWN';
    counts.current.set(key, (counts.current.get(key) ?? 0) + 1);
    return original(input as Parameters<typeof fetch>[0], init as Parameters<typeof fetch>[1]);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

// --- Scan ---------------------------------------------------------------------------------

const deferrer: Deferrer = {
  defer(work) {
    work.catch(() => undefined);
  },
};

function clearL1(): void {
  const holder = globalThis as unknown as Record<symbol, unknown>;
  for (const key of L1_KEYS) delete holder[key];
}

function buildDeps(): ApiDeps {
  const env = readRuntimeEnv();
  const parsed = readGithubConfig(env);
  if (!parsed.ok) throw new Error('invalid GitHub configuration');
  const { scanStore, ...rest } = createProductionDeps(env, deferrer, parsed.value);
  return { ...rest, scanCache: createScanCache(scanStore) };
}

function postRequest(repo: string): RawScanRequest {
  const text = JSON.stringify({ repoUrl: `https://github.com/${repo}` });
  const request = new Request('http://localhost/api/scan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: text,
  });
  return {
    method: 'POST',
    contentType: 'application/json',
    contentLength: String(new TextEncoder().encode(text).byteLength),
    body: request.body,
  };
}

interface RepoRun {
  readonly repo: string;
  readonly cold: ApiResponse;
  readonly coldMs: number;
  readonly repeat: ApiResponse | null;
  readonly coldCounts: Counts;
  readonly repeatCounts: Counts;
}

function headerOf(response: ApiResponse): string {
  const wanted = CACHE_STATUS_HEADER.toLowerCase();
  for (const [name, value] of Object.entries(response.headers)) {
    if (name.toLowerCase() === wanted) return value;
  }
  return response.cache ?? '(absent)';
}

async function runRepo(repo: string, counts: { current: Counts }): Promise<RepoRun> {
  clearL1();
  const deps = buildDeps();
  counts.current = new Map();
  const coldCounts = counts.current;
  const started = Date.now();
  const cold = await handleScanRequest(postRequest(repo), deps);
  const coldMs = Date.now() - started;
  let repeat: ApiResponse | null = null;
  counts.current = new Map();
  const repeatCounts = counts.current;
  if (cold.status === 200) repeat = await handleScanRequest(postRequest(repo), deps);
  return { repo, cold, coldMs, repeat, coldCounts, repeatCounts };
}

// --- Markdown -----------------------------------------------------------------------------

const cell = (v: string | number | null): string => String(v ?? 'null').replace(/\|/g, '\\|');

function table(header: readonly string[], rows: readonly (readonly (string | number | null)[])[]): string {
  if (rows.length === 0) return '_none_\n';
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
  ];
  return `${lines.join('\n')}\n`;
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
  const out = new Map<string, number>();
  for (const item of items) out.set(key(item), (out.get(key(item)) ?? 0) + 1);
  return out;
}

const pkgKey = (d: { ecosystem: string; name: string; sourceKind: string }): string =>
  JSON.stringify([d.ecosystem, d.name, d.sourceKind]);

function uniqueDeps(result: ScanResult): Map<string, ScanResult['dependencies'][number][]> {
  const groups = new Map<string, ScanResult['dependencies'][number][]>();
  for (const dep of result.dependencies) {
    const key = pkgKey(dep.dependency);
    const list = groups.get(key) ?? [];
    list.push(dep);
    groups.set(key, list);
  }
  return groups;
}

function advisoriesOf(deps: readonly ScanResult['dependencies'][number][]): Map<string, string> {
  const out = new Map<string, string>();
  for (const dep of deps) {
    for (const a of dep.advisories) out.set(a.id, a.severity ?? 'severity unknown');
  }
  return out;
}

function totalAdvisories(result: ScanResult): number {
  const seen = new Map<string, Set<string>>();
  for (const dep of result.dependencies) {
    const target = JSON.stringify([dep.dependency.ecosystem, dep.dependency.name, dep.lookupVersion]);
    const ids = seen.get(target) ?? new Set<string>();
    for (const a of dep.advisories) ids.add(a.id);
    seen.set(target, ids);
  }
  let total = 0;
  for (const ids of seen.values()) total += ids.size;
  return total;
}

function perPackageTable(result: ScanResult): string {
  const groups = uniqueDeps(result);
  const assessedByKey = new Map<string, AssessedDependency[]>();
  for (const item of result.assessed) {
    const key = pkgKey(item.dependency);
    const list = assessedByKey.get(key) ?? [];
    list.push(item);
    assessedByKey.set(key, list);
  }
  const rows: (string | number | null)[][] = [];
  for (const pkg of uniquePackages(result.assessed)) {
    const key = pkgKey(pkg);
    const items = assessedByKey.get(key) ?? [];
    const merged = mergeClassifications(
      items.flatMap((i) => (i.classification === null ? [] : [i.classification])),
    );
    const deps = groups.get(key) ?? [];
    const versions = [...new Set(deps.map((d) => d.lookupVersion ?? 'null'))].join(', ');
    const bases = [...new Set(deps.map((d) => d.versionBasis ?? 'null'))].join(', ');
    rows.push([
      pkg.name,
      merged?.status ?? 'unassessed',
      merged?.score ?? null,
      merged === null ? '' : [...new Set(merged.reasons.map((r) => r.ruleId))].join(', '),
      versions,
      bases,
    ]);
  }
  return table(['name', 'status', 'score', 'ruleIds', 'checked version', 'versionBasis'], rows);
}

function manifestsSection(result: ScanResult): string {
  const rows = result.manifests.map((m) => [
    m.path,
    m.format,
    result.dependencies.filter((d) => d.manifestPath === m.path).length,
  ]);
  return ['### Manifests read\n', table(['path', 'format', 'dependencies'], rows)].join('\n');
}

function repoSection(run: RepoRun, withPackages: boolean): string {
  const out: string[] = [`## ${run.repo}\n`];
  const body = run.cold.body;
  out.push(
    table(
      ['field', 'value'],
      [
        ['HTTP status', run.cold.status],
        [`${CACHE_STATUS_HEADER} (cold)`, headerOf(run.cold)],
        [
          `${CACHE_STATUS_HEADER} (immediate repeat)`,
          run.repeat === null ? 'not run' : `${headerOf(run.repeat)} (HTTP ${run.repeat.status})`,
        ],
        ['cold duration ms', run.coldMs],
      ],
    ),
  );
  if (!body.ok) {
    out.push(`Scan error: \`${body.error.code}\`\n`);
    out.push(requestsSection(run));
    return out.join('\n');
  }
  const result = body as ScanResult;
  const { summary } = result;
  const unassessed = result.assessed.filter((a) => a.classification === null).length;
  const byBasis = countBy(result.dependencies, (d) => d.versionBasis ?? 'null');
  const noteCounts = countBy(result.notes, (n) => n.code);
  const rangeUnresolved = noteCounts.get('range-unresolved') ?? 0;
  const anyBad = Object.values(result.sources).some((s) => s !== 'ok');
  out.push(
    table(
      ['field', 'value'],
      [
        ['grade', summary.grade],
        ['counts (ALIVE / HAUNTED / DEAD)', `${summary.counts.ALIVE} / ${summary.counts.HAUNTED} / ${summary.counts.DEAD}`],
        ['unassessed (dependency entries with no classification)', unassessed],
        ['unique packages / assessed / unassessed (summary)', `${summary.total} / ${summary.assessed} / ${summary.unassessed}`],
        ['dependencies', result.dependencies.length],
        [
          'dependencies by versionBasis',
          ['pinned', 'resolved', 'default', 'null'].map((b) => `${b}: ${byBasis.get(b) ?? 0}`).join(', '),
        ],
        ['`range-unresolved` notes', rangeUnresolved],
        ['total advisories', totalAdvisories(result)],
        ['`capped.skipped` non-empty', result.capped.skipped.length > 0 ? `yes (${result.capped.skipped.length}; limit ${result.capped.limit}, total ${result.capped.total})` : 'no'],
        ['any source partial or failed', anyBad ? 'yes' : 'no'],
      ],
    ),
  );

  out.push(manifestsSection(result));

  out.push('### Source statuses\n');
  out.push(table(['source', 'status'], SOURCES.map((s) => [s, result.sources[s]])));

  out.push('### Notes by code\n');
  out.push(table(['code', 'count'], [...noteCounts].sort(([a], [b]) => (a < b ? -1 : 1))));

  out.push('### HAUNTED packages\n');
  const groups = uniqueDeps(result);
  const haunted: (string | number | null)[][] = [];
  for (const pkg of uniquePackages(result.assessed)) {
    if (pkg.classification?.status !== 'HAUNTED') continue;
    const advisories = advisoriesOf(groups.get(pkgKey(pkg)) ?? []);
    haunted.push([
      pkg.name,
      pkg.classification.score,
      [...advisories].map(([id, sev]) => `${id} (${sev})`).join(', ') || 'none listed',
    ]);
  }
  out.push(table(['package', 'score', 'advisories (severity)'], haunted));

  if (withPackages) {
    out.push('### Per-package results\n');
    out.push(perPackageTable(result));
  }
  out.push(requestsSection(run));
  return out.join('\n');
}

function requestRows(counts: Counts): (string | number)[][] {
  const rows: (string | number)[][] = [];
  for (const [key, n] of [...counts].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const [source = '', endpoint = ''] = key.split('\t');
    rows.push([source, endpoint, n]);
  }
  return rows;
}

function requestsSection(run: RepoRun): string {
  const total = (c: Counts): number => [...c.values()].reduce((a, b) => a + b, 0);
  const perSource = SOURCES.map((s) => {
    let n = 0;
    for (const [key, count] of run.coldCounts) if (key.startsWith(`${s}\t`)) n += count;
    return [s, n];
  });
  return [
    '### Requests (cold scan, counted at fetch)\n',
    table(['source', 'endpoint pattern', 'requests'], requestRows(run.coldCounts)),
    table(['source', 'cold requests'], [...perSource, ['total', total(run.coldCounts)]]),
    `Requests during the immediate repeat: ${total(run.repeatCounts)}.\n`,
  ].join('\n');
}

function summaryRequestTable(runs: readonly RepoRun[]): string {
  const keys = new Set<string>();
  for (const run of runs) for (const k of run.coldCounts.keys()) keys.add(k);
  const rows = [...keys].sort().map((key) => {
    const [source = '', endpoint = ''] = key.split('\t');
    return [source, endpoint, ...runs.map((r) => r.coldCounts.get(key) ?? 0)];
  });
  return table(['source', 'endpoint pattern', ...runs.map((r) => r.repo)], rows);
}

// --- Main ---------------------------------------------------------------------------------

interface Args {
  readonly out: string;
  readonly repos: string[];
  readonly title: string;
  readonly perPackage: string;
}

function parseArgs(argv: readonly string[]): Args {
  let out = DEFAULT_OUT;
  let title = DEFAULT_TITLE;
  let perPackage = DEFAULT_PER_PACKAGE_REPO;
  const repos: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '--out') out = argv[++i] ?? DEFAULT_OUT;
    else if (arg.startsWith('--out=')) out = arg.slice('--out='.length);
    else if (arg === '--title') title = argv[++i] ?? DEFAULT_TITLE;
    else if (arg.startsWith('--title=')) title = arg.slice('--title='.length);
    else if (arg === '--per-package') perPackage = argv[++i] ?? DEFAULT_PER_PACKAGE_REPO;
    else if (arg.startsWith('--per-package=')) perPackage = arg.slice('--per-package='.length);
    else if (/^[\w.-]+\/[\w.-]+$/.test(arg)) repos.push(arg);
  }
  return { out, repos: repos.length > 0 ? repos : DEFAULT_REPOS, title, perPackage };
}

async function main(): Promise<number> {
  if (process.env.GRAVEKEEPER_LIVE_TESTS !== '1' || readGithubToken() === null) {
    console.error(
      'live:report refused: it sends live requests. Set GRAVEKEEPER_LIVE_TESTS=1 and GITHUB_TOKEN to run it.',
    );
    return 1;
  }
  const { out, repos, title, perPackage } = parseArgs(process.argv.slice(2));
  process.env.GRAVEKEEPER_RUNTIME_CACHE = 'off';

  const counts = { current: new Map<string, number>() as Counts };
  const restore = installCountingFetch(counts);
  const runs: RepoRun[] = [];
  try {
    for (const repo of repos) {
      console.error(`scanning ${repo} ...`);
      runs.push(await runRepo(repo, counts));
    }
  } finally {
    restore();
    clearL1();
  }

  const doc = [
    `# ${title}\n`,
    `Generated ${new Date().toISOString()} with the production stack, the L2 cache off and empty L1 caches before each cold scan. Request counts are taken at \`fetch\` (method, host and path pattern only).\n`,
    `Pipeline limits: at most ${SCAN_MAX_MANIFESTS} manifests and ${SCAN_MAX_DEPENDENCIES} dependencies per scan.\n`,
    '## Requests per source and endpoint (cold scans)\n',
    summaryRequestTable(runs),
    ...runs.map((r) => repoSection(r, r.repo === perPackage)),
  ].join('\n');

  const token = readGithubToken();
  if (token !== null && doc.includes(token)) {
    console.error('live:report aborted: the report text contains the token; nothing was written.');
    return 1;
  }
  const target = resolve(process.cwd(), out);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, doc, 'utf8');
  console.log(doc);
  console.error(`report written to ${out}`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  () => {
    console.error('live:report failed');
    process.exitCode = 1;
  },
);
