import type { Severity } from '@/core';
import { compareCodePoints } from './compare-code-points';
import { readOwn } from './read-own';
import { severityOf } from './severity';
import type { AdvisoryRecord, VulnerabilityFacts } from './types';

// Requirement 9.5, 9.6, 9.7, 9.8, 9.9, 9.12, 9.13, 9.14, 10.17

const RANK: Readonly<Record<Severity, number>> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

/**
 * Maps one OSV advisory body (EF-6). Returns null for a body that is not an
 * object or has no non-empty string `id`. Never throws.
 */
export function mapOsvAdvisory(body: unknown, advisoryScore: number | null): AdvisoryRecord | null {
  try {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
    const id = readOwn(body, 'id');
    if (typeof id !== 'string' || id.length === 0) return null;

    const rawAliases = readOwn(body, 'aliases');
    const aliases: string[] = [];
    if (Array.isArray(rawAliases)) {
      for (let i = 0; i < rawAliases.length; i += 1) {
        const alias: unknown = rawAliases[i];
        if (typeof alias === 'string') aliases.push(alias);
      }
    }

    const withdrawn = readOwn(body, 'withdrawn');
    let informational = false;
    let unmaintained = false;
    const affected = readOwn(body, 'affected');
    if (Array.isArray(affected)) {
      for (let i = 0; i < affected.length; i += 1) {
        const value = readOwn(readOwn(affected[i], 'database_specific'), 'informational');
        if (typeof value === 'string') {
          informational = true;
          if (value === 'unmaintained') unmaintained = true;
        }
      }
    }

    return {
      id,
      aliases,
      withdrawn: typeof withdrawn === 'string' && withdrawn.length > 0,
      informational,
      unmaintained,
      severity: severityOf(advisoryScore, body),
    };
  } catch {
    return null;
  }
}

function find(parent: Map<string, string>, key: string): string {
  let root = key;
  for (let next = parent.get(root); next !== undefined && next !== root; next = parent.get(root)) {
    root = next;
  }
  let cursor = key;
  while (cursor !== root) {
    const next = parent.get(cursor) as string;
    parent.set(cursor, root);
    cursor = next;
  }
  return root;
}

/**
 * Aggregates the fetched advisories of one Lookup_Target. Counted_Advisories
 * (not withdrawn, not informational) are grouped by shared ids and aliases;
 * each unfetched id counts as its own vulnerability. Independent of record order.
 */
export function aggregateAdvisories(
  records: readonly AdvisoryRecord[],
  unfetchedIds: readonly string[],
): VulnerabilityFacts {
  const parent = new Map<string, string>();
  const union = (a: string, b: string): void => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const ra = find(parent, a);
    const rb = find(parent, b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const informationalIds = new Set<string>();
  const unmaintainedIds = new Set<string>();
  const roots: string[] = [];
  let maxSeverity: Severity | null = null;

  for (const record of records) {
    if (record.withdrawn) continue;
    if (record.informational) informationalIds.add(record.id);
    if (record.unmaintained) unmaintainedIds.add(record.id);
    if (record.informational) continue;
    union(record.id, record.id);
    roots.push(record.id);
    for (const alias of record.aliases) union(record.id, alias);
    if (record.severity !== null && (maxSeverity === null || RANK[record.severity] > RANK[maxSeverity])) {
      maxSeverity = record.severity;
    }
  }

  const groups = new Set<string>();
  for (const id of roots) groups.add(find(parent, id));

  return {
    openVulnerabilityCount: groups.size + new Set(unfetchedIds).size,
    maxSeverity,
    informationalIds: [...informationalIds].sort(compareCodePoints),
    unmaintainedIds: [...unmaintainedIds].sort(compareCodePoints),
  };
}
