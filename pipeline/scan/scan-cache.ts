// Scan_Cache store rule and typed cache (R19.5, R19.6, R19.7, R19.22, R19.28, R19.30).
import {
  HINT_TEXT_MAX_LENGTH,
  HINTS_MAX_PER_PACKAGE,
  L2_MAX_SCAN_BYTES,
  PARTIAL_SCAN_TTL_SECONDS,
  SCAN_CACHE_TTL_SECONDS,
} from '../constants';
import type { SourceName } from '../ports';
import type { CacheStore, JsonValue } from '../ports/cache';
import { registryUnitKeys } from './stage-registries';
import type { LedgerEntry, ScanNote, ScanResult, SourceStatus, TypedCache } from './types';

const SOURCE_NAMES: readonly SourceName[] = ['github', 'depsdev', 'osv', 'npm', 'cratesio', 'pypi'];

export type StoreDecision =
  | { readonly store: true; readonly ttlSeconds: number }
  | { readonly store: false };

const OWNERS_PREFIX = registryUnitKeys.cratesOwners('');

/** An owners lookup (unitKey `owners:{name}`) that was cancelled or never started by the deadline. */
function isDeadlineOwnersUnit(entry: LedgerEntry): boolean {
  return (
    entry.unitKey.startsWith(OWNERS_PREFIX) &&
    !entry.outcome.ok &&
    entry.outcome.reason === 'deadline'
  );
}

/**
 * Pure store rule (R19.5, R19.7, R19.22). `cratesioUnits` holds the crates.io ledger entries;
 * entries of other sources are ignored.
 */
export function storeDecision(
  statuses: { readonly [S in SourceName]: SourceStatus },
  notes: readonly ScanNote[],
  cratesioUnits: readonly LedgerEntry[],
): StoreDecision {
  if (notes.some((note) => note.code === 'github-token-missing')) return { store: false };
  const nonOk = SOURCE_NAMES.filter((source) => statuses[source] !== 'ok');
  if (nonOk.length === 0) return { store: true, ttlSeconds: SCAN_CACHE_TTL_SECONDS };
  if (nonOk.length === 1 && nonOk[0] === 'cratesio' && statuses.cratesio === 'partial') {
    const failedUnits = cratesioUnits.filter(
      (entry) => entry.source === 'cratesio' && !entry.outcome.ok,
    );
    if (failedUnits.every(isDeadlineOwnersUnit)) {
      return { store: true, ttlSeconds: PARTIAL_SCAN_TTL_SECONDS };
    }
  }
  return { store: false };
}

// --- Validation on read (R18.1) ---------------------------------------------------------------

type Rec = { readonly [key: string]: unknown };

function isRec(value: unknown): value is Rec {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasKeys(value: Rec, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isArr = (v: unknown): v is readonly unknown[] => Array.isArray(v);
const isStrArr = (v: unknown): boolean => isArr(v) && v.every(isStr);
const isEcosystem = (v: unknown): boolean => v === 'npm' || v === 'pypi' || v === 'cargo';
const isFormat = (v: unknown): boolean =>
  v === 'package.json' ||
  v === 'requirements.txt' ||
  v === 'Cargo.toml' ||
  v === 'pyproject.toml'; // R10.2
const isScope = (v: unknown): boolean =>
  v === 'runtime' || v === 'dev' || v === 'build' || v === 'optional' || v === 'peer';
const isSourceKind = (v: unknown): boolean => v === 'registry' || v === 'git' || v === 'path';
const isStatus = (v: unknown): boolean => v === 'ok' || v === 'partial' || v === 'failed';
const isIso = (v: unknown): boolean =>
  isStr(v) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(v);
const allOf = (v: unknown, test: (item: unknown) => boolean): boolean =>
  isArr(v) && v.every(test);

function isAdvisory(v: unknown): boolean {
  return (
    isRec(v) &&
    hasKeys(v, ['id', 'aliases', 'severity', 'url', 'excluded']) &&
    (v.excluded === null || v.excluded === 'withdrawn' || v.excluded === 'informational') &&
    isStr(v.id) &&
    isStrArr(v.aliases) &&
    (v.severity === null ||
      v.severity === 'LOW' ||
      v.severity === 'MEDIUM' ||
      v.severity === 'HIGH' ||
      v.severity === 'CRITICAL') &&
    isStr(v.url)
  );
}

/** Code points of a string, not UTF-16 units. */
function codePointCount(text: string): number {
  return Array.from(text).length;
}

function isHint(v: unknown): boolean {
  return (
    isRec(v) &&
    hasKeys(v, ['kind', 'text', 'sourceUrl']) &&
    (v.kind === 'deprecation-notice' || v.kind === 'advisory-notice') &&
    isStr(v.text) &&
    codePointCount(v.text) <= HINT_TEXT_MAX_LENGTH &&
    (v.sourceUrl === null || isStr(v.sourceUrl))
  );
}

/** `hints` is absent (a result stored before the field existed, R4.4) or a short list of hints. */
function isHintList(v: unknown): boolean {
  return v === undefined || (isArr(v) && v.length <= HINTS_MAX_PER_PACKAGE && v.every(isHint));
}

function isDependency(v: unknown): boolean {
  return (
    isRec(v) &&
    isStr(v.name) &&
    isStr(v.rawName) &&
    isEcosystem(v.ecosystem) &&
    isStr(v.versionSpec) &&
    isScope(v.scope) &&
    isSourceKind(v.sourceKind)
  );
}

function isClassification(v: unknown): boolean {
  return (
    isRec(v) &&
    (v.status === 'ALIVE' || v.status === 'HAUNTED' || v.status === 'DEAD') &&
    isNum(v.score) &&
    allOf(v.reasons, (r) => isRec(r) && isStr(r.ruleId) && isStr(r.message) && isArr(r.facts)) &&
    isBool(v.vulnerable) &&
    isBool(v.abandoned) &&
    isBool(v.dormant)
  );
}

function isRanked(v: unknown): boolean {
  return (
    isRec(v) &&
    isStr(v.name) &&
    isEcosystem(v.ecosystem) &&
    isSourceKind(v.sourceKind) &&
    allOf(v.scopes, isScope) &&
    isClassification(v.classification)
  );
}

function isUnassessed(v: unknown): boolean {
  return (
    isRec(v) &&
    isStr(v.name) &&
    isEcosystem(v.ecosystem) &&
    isSourceKind(v.sourceKind) &&
    allOf(v.scopes, isScope) &&
    (v.unassessedReason === 'non-registry-source' || v.unassessedReason === 'no-health-data')
  );
}

function isSummary(v: unknown): boolean {
  if (!isRec(v)) return false;
  const counts = v.counts;
  const top = v.maxScorePackage;
  return (
    isCount(v.total) &&
    isCount(v.assessed) &&
    isCount(v.unassessed) &&
    isRec(counts) &&
    isCount(counts.ALIVE) &&
    isCount(counts.HAUNTED) &&
    isCount(counts.DEAD) &&
    (v.averageScore === null || isNum(v.averageScore)) &&
    (v.maxScore === null || isNum(v.maxScore)) &&
    (top === null || (isRec(top) && isStr(top.name) && isEcosystem(top.ecosystem))) &&
    (v.grade === null || ['A', 'B', 'C', 'D', 'F'].includes(v.grade as string)) &&
    allOf(v.worst, isRanked) &&
    allOf(v.unassessedItems, isUnassessed)
  );
}

function isNote(v: unknown): boolean {
  return (
    isRec(v) &&
    isStr(v.code) &&
    isStr(v.message) &&
    (v.details === undefined || isRec(v.details))
  );
}

/** Strict structural check of the R18.1 Scan_Result shape. A failing value is a cache miss. */
export function isScanResult(value: unknown): value is ScanResult {
  if (!isRec(value)) return false;
  if (!hasKeys(value, [
    'ok', 'asOf', 'repo', 'discovery', 'manifests', 'dependencies', 'assessed',
    'summary', 'sources', 'capped', 'notes',
  ])) return false;
  if (value.ok !== true || !isIso(value.asOf)) return false;

  const repo = value.repo;
  if (
    !isRec(repo) ||
    !hasKeys(repo, ['host', 'owner', 'repo', 'branch', 'defaultBranch', 'commitSha']) ||
    !Object.values(repo).every(isStr)
  ) {
    return false;
  }

  const discovery = value.discovery;
  if (
    !isRec(discovery) ||
    !isBool(discovery.truncatedTree) ||
    !isBool(discovery.depthLimited) ||
    !isBool(discovery.countLimited) ||
    !allOf(
      discovery.candidates,
      (c) =>
        isRec(c) &&
        isStr(c.path) &&
        isFormat(c.format) &&
        isCount(c.depth) &&
        (c.sizeBytes === null || isCount(c.sizeBytes)),
    )
  ) {
    return false;
  }

  if (
    !allOf(
      value.manifests,
      (m) => isRec(m) && isStr(m.path) && isFormat(m.format) && isStrArr(m.warnings),
    )
  ) {
    return false;
  }

  if (
    !allOf(
      value.dependencies,
      (d) =>
        isRec(d) &&
        isDependency(d.dependency) &&
        isStr(d.manifestPath) &&
        (d.lookupVersion === null || isStr(d.lookupVersion)) &&
        (d.versionBasis === null || d.versionBasis === 'pinned' || d.versionBasis === 'resolved' || d.versionBasis === 'default') &&
        allOf(d.advisories, isAdvisory) &&
        isHintList(d.hints) &&
        isRec(d.facts) &&
        hasKeys(d.facts, [
          'daysSinceLastRelease', 'daysSinceLastCommit', 'archived', 'deprecated',
          'openVulnerabilityCount', 'maxSeverity', 'maintainerCount',
        ]),
    )
  ) {
    return false;
  }

  if (
    !allOf(
      value.assessed,
      (a) =>
        isRec(a) && isDependency(a.dependency) && (a.classification === null || isClassification(a.classification)),
    )
  ) {
    return false;
  }

  if (!isSummary(value.summary)) return false;

  const sources = value.sources;
  if (!isRec(sources) || !hasKeys(sources, SOURCE_NAMES) || !SOURCE_NAMES.every((s) => isStatus(sources[s]))) {
    return false;
  }

  const capped = value.capped;
  if (
    !isRec(capped) ||
    !isCount(capped.limit) ||
    !isCount(capped.total) ||
    !allOf(capped.skipped, (s) => isRec(s) && isEcosystem(s.ecosystem) && isStr(s.name))
  ) {
    return false;
  }

  return allOf(value.notes, isNote);
}

// --- Typed cache ------------------------------------------------------------------------------

/**
 * Scan_Cache over a CacheStore (a TieredCacheStore in production, design "Write path").
 * The tiered store writes L1 at once and passes the L2 write to the Deferrer itself, so this
 * class holds no Deferrer. It asks for L2 (`l2Kind: 'scan'`) only when the serialized result is
 * at most L2_MAX_SCAN_BYTES (R19.28); a larger result stays in L1. Never throws.
 */
export function createScanCache(store: CacheStore): TypedCache<ScanResult> {
  return {
    async get(key, signal) {
      try {
        const entry = await store.get(key, { signal, l2Kind: 'scan' });
        if (entry === null) return null;
        return isScanResult(entry.value) ? entry.value : null;
      } catch {
        return null;
      }
    },
    async set(key, value, ttlSeconds) {
      try {
        const json = JSON.stringify(value);
        const fitsL2 = new TextEncoder().encode(json).length <= L2_MAX_SCAN_BYTES;
        await store.set(key, JSON.parse(json) as JsonValue, ttlSeconds, {
          l2Kind: fitsL2 ? 'scan' : null,
        });
      } catch {
        // A failed store is a skipped store (R19.30).
      }
    },
  };
}
