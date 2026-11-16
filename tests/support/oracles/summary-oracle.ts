// Independent oracle for the Summarizer (requirement 12). It does not import production summarizer code: only types,
// constants and nothing else from /core. Grouping uses a Map keyed by the Package_Key, merging follows the total
// order of criterion 12.22 with its own canonical JSON writer, and the mean is computed in integer arithmetic.
import type {
  AssessedDependency,
  Classification,
  Ecosystem,
  Grade,
  RankedPackage,
  RepoSummary,
  Scope,
  SourceKind,
  Status,
  UnassessedItem,
} from '../../../core/model';
import { GRADE_A_MAX, GRADE_B_MAX, GRADE_C_MAX, GRADE_D_MAX, SCOPE_ORDER, WORST_LIST_SIZE } from '../../../core/model';

/** Code point order comparison of two strings (not UTF-16 code unit order). */
export function oracleCompareCodePoints(a: string, b: string): number {
  const x = Array.from(a, (c) => c.codePointAt(0) as number);
  const y = Array.from(b, (c) => c.codePointAt(0) as number);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return x.length === y.length ? 0 : x.length < y.length ? -1 : 1;
}

/** grade(score) with the four thresholds (criterion 12.15). */
export function oracleGrade(score: number): Grade {
  if (score <= GRADE_A_MAX) return 'A';
  if (score <= GRADE_B_MAX) return 'B';
  if (score <= GRADE_C_MAX) return 'C';
  if (score <= GRADE_D_MAX) return 'D';
  return 'F';
}

export const GRADE_ORDER: readonly Grade[] = ['A', 'B', 'C', 'D', 'F'];

/** True when grade `a` is strictly better than grade `b`. */
export const oracleGradeIsBetter = (a: Grade, b: Grade): boolean => GRADE_ORDER.indexOf(a) < GRADE_ORDER.indexOf(b);

/** Canonical JSON: no whitespace, object keys in code point order at every depth, array order kept. */
export function oracleCanonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((v) => oracleCanonicalJson(v)).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .sort(oracleCompareCodePoints);
  return `{${keys.map((k) => `${JSON.stringify(k)}:${oracleCanonicalJson(record[k])}`).join(',')}}`;
}

const STATUS_PRECEDENCE: readonly Status[] = ['HAUNTED', 'DEAD', 'ALIVE'];
const statusRank = (s: Status): number => STATUS_PRECEDENCE.indexOf(s);

/** Classification_Tie_Key compared as: three flags (false before true), then the ruleIds joined by ','. */
function compareTieKey(a: Classification, b: Classification): number {
  const flags: ('vulnerable' | 'abandoned' | 'dormant')[] = ['vulnerable', 'abandoned', 'dormant'];
  for (const f of flags) {
    if (a[f] !== b[f]) return a[f] ? 1 : -1;
  }
  const ids = (c: Classification): string => c.reasons.map((r) => r.ruleId).join(',');
  return oracleCompareCodePoints(ids(a), ids(b));
}

/** Criterion 12.22: negative when `a` is the higher-risk (earlier) classification. */
function compareMerge(a: Classification, b: Classification): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.status !== b.status) return statusRank(a.status) - statusRank(b.status);
  const tie = compareTieKey(a, b);
  if (tie !== 0) return tie;
  return oracleCompareCodePoints(oracleCanonicalJson(a), oracleCanonicalJson(b));
}

interface OraclePackage {
  name: string;
  ecosystem: Ecosystem;
  sourceKind: SourceKind;
  scopes: Scope[];
  classification: Classification | null;
}

/** Criterion 12.1 and 12.22: one package per (ecosystem, name, sourceKind), scopes in SCOPE_ORDER, merged classification. */
export function oracleUniquePackages(list: readonly AssessedDependency[]): OraclePackage[] {
  const groups = new Map<string, AssessedDependency[]>();
  for (const entry of list) {
    const d = entry.dependency;
    const key = JSON.stringify([d.ecosystem, d.name, d.sourceKind]);
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  const packages: OraclePackage[] = [];
  for (const group of groups.values()) {
    const first = group[0].dependency;
    const scopeSet = new Set<Scope>(group.map((e) => e.dependency.scope));
    const scopes = SCOPE_ORDER.filter((s) => scopeSet.has(s));
    let merged: Classification | null = null;
    for (const e of group) {
      const c = e.classification;
      if (c !== null && (merged === null || compareMerge(c, merged) < 0)) merged = c;
    }
    packages.push({ name: first.name, ecosystem: first.ecosystem, sourceKind: first.sourceKind, scopes, classification: merged });
  }
  return packages;
}

/** Arithmetic mean of integers rounded to the nearest integer, halves up, in integer arithmetic. */
export function oracleHalfUpMean(values: readonly number[]): number {
  const sum = values.reduce((a, b) => a + b, 0);
  const n = values.length;
  return Math.floor((2 * sum + n) / (2 * n));
}

/** Criterion 12.6 order over assessed packages. */
function compareRanked(a: RankedPackage, b: RankedPackage): number {
  return (
    b.classification.score - a.classification.score ||
    statusRank(a.classification.status) - statusRank(b.classification.status) ||
    oracleCompareCodePoints(a.name, b.name) ||
    oracleCompareCodePoints(a.ecosystem, b.ecosystem) ||
    oracleCompareCodePoints(a.sourceKind, b.sourceKind) ||
    compareTieKey(a.classification, b.classification)
  );
}

/** The expected Repo_Summary of requirement 12, computed without production summarizer code. */
export function oracleSummarize(list: readonly AssessedDependency[]): RepoSummary {
  const packages = oracleUniquePackages(list);

  const assessed: RankedPackage[] = [];
  const unassessedItems: UnassessedItem[] = [];
  for (const p of packages) {
    if (p.sourceKind !== 'registry') {
      unassessedItems.push({ name: p.name, ecosystem: p.ecosystem, sourceKind: p.sourceKind, scopes: p.scopes, unassessedReason: 'non-registry-source' });
    } else if (p.classification === null) {
      unassessedItems.push({ name: p.name, ecosystem: p.ecosystem, sourceKind: p.sourceKind, scopes: p.scopes, unassessedReason: 'no-health-data' });
    } else {
      assessed.push({ name: p.name, ecosystem: p.ecosystem, sourceKind: p.sourceKind, scopes: p.scopes, classification: p.classification });
    }
  }
  unassessedItems.sort(
    (a, b) =>
      oracleCompareCodePoints(a.ecosystem, b.ecosystem) ||
      oracleCompareCodePoints(a.name, b.name) ||
      oracleCompareCodePoints(a.sourceKind, b.sourceKind),
  );
  assessed.sort(compareRanked);

  const counts = { ALIVE: 0, HAUNTED: 0, DEAD: 0 };
  for (const p of assessed) counts[p.classification.status] += 1;

  const base = { total: packages.length, assessed: assessed.length, unassessed: unassessedItems.length, counts, unassessedItems };
  if (assessed.length === 0) {
    return { ...base, averageScore: null, maxScore: null, maxScorePackage: null, grade: null, worst: [] };
  }
  const top = assessed[0];
  const maxScore = Math.max(...assessed.map((p) => p.classification.score));
  return {
    ...base,
    averageScore: oracleHalfUpMean(assessed.map((p) => p.classification.score)),
    maxScore,
    maxScorePackage: { name: top.name, ecosystem: top.ecosystem },
    grade: oracleGrade(maxScore),
    worst: assessed.filter((p) => !(p.classification.status === 'ALIVE' && p.classification.score === 0)).slice(0, WORST_LIST_SIZE),
  };
}
