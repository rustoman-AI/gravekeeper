// Independent oracle for manifest properties (design: Generator strategy: manifests).
// Deliberately imports only TYPES from core: ordering, normalization, classification and
// Representable rules are re-implemented here so that a bug in core cannot hide itself.
import type {
  Dependency,
  DependencyIdentity,
  Ecosystem,
  ManifestFormat,
  Scope,
  SerializableDependency,
  SourceKind,
} from '../../../core/model';

const SCOPE_RANK: Readonly<Record<Scope, number>> = { runtime: 0, dev: 1, build: 2, optional: 3, peer: 4 };

const ECOSYSTEM_OF: Readonly<Record<ManifestFormat, Ecosystem>> = {
  'package.json': 'npm',
  'requirements.txt': 'pypi',
  'Cargo.toml': 'cargo',
};

const SCOPES_OF: Readonly<Record<ManifestFormat, readonly Scope[]>> = {
  'package.json': ['runtime', 'dev', 'optional', 'peer'],
  'requirements.txt': ['runtime'],
  'Cargo.toml': ['runtime', 'dev', 'build'],
};

// ---------------------------------------------------------------------------
// Code point comparison (never localeCompare, never `<` on strings)
// ---------------------------------------------------------------------------

/** Negative, zero or positive: `a` against `b` by Unicode code point (a lone surrogate counts as its own code point). */
export function cmpCodePoints(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const cx = x[i].codePointAt(0) as number;
    const cy = y[i].codePointAt(0) as number;
    if (cx !== cy) return cx < cy ? -1 : 1;
  }
  return x.length === y.length ? 0 : x.length < y.length ? -1 : 1;
}

interface OrderKey {
  readonly name: string;
  readonly scope: Scope;
  readonly ecosystem: Ecosystem;
  readonly versionSpec: string;
  readonly sourceKind: SourceKind;
  readonly rawName?: string;
}

const SOURCE_RANK: Readonly<Record<SourceKind, number>> = { registry: 0, git: 1, path: 2 };

/** Dependency_Order: name, scope in Scope_Order, then ecosystem, versionSpec, sourceKind, rawName (absent first). */
export function cmpDependencyOrder(a: OrderKey, b: OrderKey): number {
  let c = cmpCodePoints(a.name, b.name);
  if (c !== 0) return c;
  c = SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope];
  if (c !== 0) return c;
  c = cmpCodePoints(a.ecosystem, b.ecosystem);
  if (c !== 0) return c;
  c = cmpCodePoints(a.versionSpec, b.versionSpec);
  if (c !== 0) return c;
  c = SOURCE_RANK[a.sourceKind] - SOURCE_RANK[b.sourceKind];
  if (c !== 0) return c;
  if (a.rawName === undefined || b.rawName === undefined) {
    return a.rawName === b.rawName ? 0 : a.rawName === undefined ? -1 : 1;
  }
  return cmpCodePoints(a.rawName, b.rawName);
}

/** A sorted copy in Dependency_Order. */
export function sortInDependencyOrder<T extends OrderKey>(deps: readonly T[]): T[] {
  return [...deps].sort(cmpDependencyOrder);
}

/** True when `deps` is sorted by (name, scope) only, which is all a parser output can be checked on. */
export function isSortedByNameAndScope(deps: readonly { name: string; scope: Scope }[]): boolean {
  for (let i = 1; i < deps.length; i++) {
    const p = deps[i - 1];
    const q = deps[i];
    const c = cmpCodePoints(p.name, q.name) || SCOPE_RANK[p.scope] - SCOPE_RANK[q.scope];
    if (c > 0) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// PEP 503 normalization, written independently
// ---------------------------------------------------------------------------

/** ASCII A-Z to lower case, each run of `-`, `_`, `.` to one `-`, all else unchanged. */
export function oracleNormalize(s: string): string {
  let out = '';
  let inRun = false;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code === 0x2d || code === 0x5f || code === 0x2e) {
      if (!inRun) out += '-';
      inRun = true;
      continue;
    }
    inRun = false;
    out += code >= 0x41 && code <= 0x5a ? String.fromCharCode(code + 32) : s.charAt(i);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Projection and set comparison
// ---------------------------------------------------------------------------

/** The five Dependency_Set fields; `rawName` is dropped. */
export function project(d: SerializableDependency | Dependency): DependencyIdentity {
  return {
    name: d.name,
    ecosystem: d.ecosystem,
    versionSpec: d.versionSpec,
    scope: d.scope,
    sourceKind: d.sourceKind,
  };
}

export function projectionKey(d: SerializableDependency | Dependency): string {
  return JSON.stringify([d.name, d.ecosystem, d.versionSpec, d.scope, d.sourceKind]);
}

/** Dependency_Set as a set of projection keys. */
export function dependencySet(deps: readonly (SerializableDependency | Dependency)[]): Set<string> {
  return new Set(deps.map(projectionKey));
}

export function dependencySetsEqual(
  a: readonly (SerializableDependency | Dependency)[],
  b: readonly (SerializableDependency | Dependency)[],
): boolean {
  const x = dependencySet(a);
  const y = dependencySet(b);
  if (x.size !== y.size) return false;
  for (const k of x) if (!y.has(k)) return false;
  return true;
}

/** Readable difference for failure messages: empty arrays mean equal sets. */
export function diffDependencySets(
  expected: readonly (SerializableDependency | Dependency)[],
  actual: readonly (SerializableDependency | Dependency)[],
): { missing: string[]; unexpected: string[] } {
  const x = dependencySet(expected);
  const y = dependencySet(actual);
  return {
    missing: [...x].filter((k) => !y.has(k)),
    unexpected: [...y].filter((k) => !x.has(k)),
  };
}

// ---------------------------------------------------------------------------
// restrict(deps, format): the expected output of the serializer (criteria 5.1, 5.2, 5.13)
// ---------------------------------------------------------------------------

function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) i++;
      else return true;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function startsWithAny(s: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => s.startsWith(p));
}

/** Criterion 1.9, applied in order to the exact value. */
export function oracleNpmSourceKind(spec: string): SourceKind {
  if (startsWithAny(spec, ['file:', 'link:', 'workspace:'])) return 'path';
  if (startsWithAny(spec, ['git+', 'git://', 'github:', 'gitlab:', 'bitbucket:'])) return 'git';
  const hash = spec.indexOf('#');
  const body = hash === -1 ? spec : spec.slice(0, hash);
  // After the first `#` the ref is 0 or more arbitrary characters (`a/b#` and `a/b#c/d` are git).
  const parts = body.split('/');
  if (parts.length === 2 && parts.every((p) => /^[A-Za-z0-9._-]+$/.test(p))) return 'git';
  return 'registry';
}

const NAME_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const COMPARISON_OPERATORS = ['===', '==', '!=', '<=', '>=', '~=', '<', '>'] as const;

function isRepresentable(d: SerializableDependency, format: ManifestFormat): boolean {
  if (d.ecosystem !== ECOSYSTEM_OF[format]) return false;
  if (!SCOPES_OF[format].includes(d.scope)) return false;
  if (d.name.length === 0) return false;

  if (format === 'package.json') return oracleNpmSourceKind(d.versionSpec) === d.sourceKind;

  if (format === 'Cargo.toml') return !hasLoneSurrogate(d.name) && !hasLoneSurrogate(d.versionSpec);

  // requirements.txt
  const written = d.rawName !== undefined && oracleNormalize(d.rawName) === d.name ? d.rawName : d.name;
  if (!NAME_TOKEN.test(written) || oracleNormalize(written) !== d.name) return false;
  const v = d.versionSpec;
  const isGit = v.startsWith('git+');
  const isPath = startsWithAny(v, ['file:', './', '../', '/']);
  if (isGit !== (d.sourceKind === 'git')) return false;
  if (isPath !== (d.sourceKind === 'path')) return false;
  if (/[\r\n\\]/.test(v)) return false;
  if (v !== v.trim()) return false;
  if (d.sourceKind === 'registry') {
    if (!(v === '*' || startsWithAny(v, COMPARISON_OPERATORS))) return false;
    if (v.includes(';') || /\s#/.test(v)) return false;
  } else if (/\s[;#]/.test(v)) {
    return false;
  }
  return true;
}

/**
 * Filter by ecosystem, supported scope and Representable, sort in Dependency_Order, then keep the first
 * Dependency of each (name, scope). Input objects are returned as they are (rawName kept).
 */
export function restrict(deps: readonly SerializableDependency[], format: ManifestFormat): SerializableDependency[] {
  const kept = sortInDependencyOrder(deps.filter((d) => isRepresentable(d, format)));
  const seen = new Set<string>();
  const out: SerializableDependency[] = [];
  for (const d of kept) {
    const key = JSON.stringify([d.name, d.scope]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Model-based manifests: firstOccurrence(model)
// ---------------------------------------------------------------------------

/**
 * One entry of a model, in text order within `ManifestModel.entries`.
 * - `name`: the package name as written (pypi: any spelling; cargo: the `package` value or the key).
 * - `key`: the table key under which a Cargo entry is written (defaults to `name`).
 * - `table`: Cargo only. `null` is the top-level table of the scope, a string is the `<cfg>` of a
 *   `[target.<cfg>.*]` table.
 */
export interface ModelEntry {
  readonly name: string;
  readonly key?: string;
  readonly scope: Scope;
  readonly versionSpec: string;
  readonly sourceKind: SourceKind;
  readonly table?: string | null;
}

export interface ManifestModel {
  readonly format: ManifestFormat;
  readonly entries: readonly ModelEntry[];
}

export interface ExpectedParse {
  /** Expected dependencies in Dependency_Order. `rawName` is that of the kept entry. */
  readonly dependencies: Dependency[];
  /** Expected number of "duplicate" warnings. */
  readonly discarded: number;
}

/** Array-index-like keys (canonical decimal below 2^32 - 1) enumerate first, in numeric order. */
function isIntegerLike(k: string): boolean {
  return /^(0|[1-9][0-9]*)$/.test(k) && Number(k) < 4294967295;
}

/** Enumeration order of a list of keys given in insertion order: integer-like ascending, then the rest as inserted. */
function enumerationOrder(insertion: readonly string[]): string[] {
  const unique = Array.from(new Set(insertion));
  const ints = unique.filter(isIntegerLike).sort((a, b) => Number(a) - Number(b));
  return [...ints, ...unique.filter((k) => !isIntegerLike(k))];
}

/**
 * Expected Dependencies and discard count for a model, from the rule of the format:
 * - package.json: the same key in one section is not a duplicate for the parser, the last value wins, no warning;
 * - requirements.txt: the earliest entry in text order wins;
 * - Cargo.toml (criterion 3.18): per scope the top-level table first, then target tables in enumeration order
 *   of their cfg keys, then entries in enumeration order of their keys.
 */
export function firstOccurrence(model: ManifestModel): ExpectedParse {
  const { format, entries } = model;
  const ecosystem = ECOSYSTEM_OF[format];
  const normName = (n: string) => (format === 'requirements.txt' ? oracleNormalize(n) : n);

  // Rank of each entry under the format's "first" notion: smaller rank wins.
  const rank = new Map<number, readonly number[]>();
  if (format === 'Cargo.toml') {
    const cfgOrder = enumerationOrder(entries.flatMap((e) => (typeof e.table === 'string' ? [e.table] : [])));
    const keysByTable = new Map<string, string[]>();
    for (const e of entries) {
      const t = JSON.stringify([e.scope, e.table ?? null]);
      const list = keysByTable.get(t) ?? [];
      list.push(e.key ?? e.name);
      keysByTable.set(t, list);
    }
    const keyOrder = new Map<string, string[]>();
    for (const [t, list] of keysByTable) keyOrder.set(t, enumerationOrder(list));
    entries.forEach((e, i) => {
      const t = JSON.stringify([e.scope, e.table ?? null]);
      const tableOrdinal = typeof e.table === 'string' ? 1 + cfgOrder.indexOf(e.table) : 0;
      const enumIndex = (keyOrder.get(t) as string[]).indexOf(e.key ?? e.name);
      rank.set(i, [tableOrdinal, enumIndex, i]);
    });
  }

  const winners = new Map<string, number>();
  entries.forEach((e, i) => {
    const k = JSON.stringify([normName(e.name), e.scope]);
    const cur = winners.get(k);
    if (cur === undefined) {
      winners.set(k, i);
      return;
    }
    if (format === 'package.json') {
      winners.set(k, i); // last wins
    } else if (format === 'Cargo.toml') {
      const a = rank.get(i) as readonly number[];
      const b = rank.get(cur) as readonly number[];
      const better = a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] < b[2];
      if (better) winners.set(k, i);
    }
    // requirements.txt: first in text order stays
  });

  const dependencies: Dependency[] = [...winners.values()].map((i) => {
    const e = entries[i];
    return {
      name: normName(e.name),
      rawName: e.name,
      ecosystem,
      versionSpec: e.versionSpec,
      scope: e.scope,
      sourceKind: e.sourceKind,
    };
  });
  const discarded = format === 'package.json' ? 0 : entries.length - winners.size;
  return { dependencies: sortInDependencyOrder(dependencies), discarded };
}
