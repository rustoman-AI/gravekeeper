// Requirement 12.1, 12.3, 12.4, 12.5, 12.14, 12.15, 8.6
import type { Scope } from '@/core';
import { compareCodePoints } from './compare-code-points';
import { readOwn } from './read-own';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Reads `value` as an array, or returns null. Never throws. */
function asArray(value: unknown): readonly unknown[] | null {
  try {
    return Array.isArray(value) ? (value as readonly unknown[]) : null;
  } catch {
    return null;
  }
}

/** Reads every entry of an array through `readOwn`-safe indexing. */
function entries(list: readonly unknown[]): unknown[] {
  const out: unknown[] = [];
  try {
    for (let i = 0; i < list.length; i += 1) out.push(list[i]);
  } catch {
    return out;
  }
  return out;
}

/**
 * EF-20. `maintainerCount` is the number of distinct non-empty
 * `maintainers[].name` strings (0 for an empty list, null for a missing or
 * non-array field or a non-empty list without a valid name). `deprecated` is
 * true for a non-empty string, false for an absent or empty field, null for a
 * non-object body or any other type.
 */
export function mapNpmLatest(body: unknown): {
  maintainerCount: number | null;
  deprecated: boolean | null;
} {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { maintainerCount: null, deprecated: null };
  }
  let maintainerCount: number | null = null;
  const list = asArray(readOwn(body, 'maintainers'));
  if (list !== null) {
    const names = new Set<string>();
    for (const item of entries(list)) {
      const name = readOwn(item, 'name');
      if (isNonEmptyString(name)) names.add(name);
    }
    maintainerCount = list.length === 0 ? 0 : names.size === 0 ? null : names.size;
  }
  const dep = readOwn(body, 'deprecated');
  let deprecated: boolean | null;
  if (dep === undefined) deprecated = false;
  else if (typeof dep === 'string') deprecated = dep.length > 0;
  else deprecated = null;
  return { maintainerCount, deprecated };
}

/**
 * EF-21. Distinct non-empty logins of `kind` `user`. A team-only list and a
 * non-empty list without valid entries give null. `lowerBound` is true when
 * the list holds at least one valid user and at least one team.
 */
export function mapCratesOwners(body: unknown): {
  maintainerCount: number | null;
  lowerBound: boolean;
} {
  const list = asArray(readOwn(body, 'users'));
  if (list === null) return { maintainerCount: null, lowerBound: false };
  if (list.length === 0) return { maintainerCount: 0, lowerBound: false };
  const logins = new Set<string>();
  let teams = 0;
  for (const item of entries(list)) {
    const kind = readOwn(item, 'kind');
    if (kind === 'user') {
      const login = readOwn(item, 'login');
      if (isNonEmptyString(login)) logins.add(login);
    } else if (kind === 'team') {
      teams += 1;
    }
  }
  if (logins.size === 0) return { maintainerCount: null, lowerBound: false };
  return { maintainerCount: logins.size, lowerBound: teams > 0 };
}

/**
 * EF-22. Takes the per-version document `GET /pypi/{name}/{version}/json`
 * (Requirement 12.5, 12.16). Distinct string `ownership.roles[].user` values. Empty roles give 0
 * when `organization` is null or missing, otherwise null.
 */
export function mapPypiOwnership(body: unknown): { maintainerCount: number | null } {
  const ownership = readOwn(body, 'ownership');
  const roles = asArray(readOwn(ownership, 'roles'));
  if (roles === null) return { maintainerCount: null };
  if (roles.length === 0) {
    const org = readOwn(ownership, 'organization');
    return { maintainerCount: org === null || org === undefined ? 0 : null };
  }
  const users = new Set<string>();
  for (const item of entries(roles)) {
    const user = readOwn(item, 'user');
    if (typeof user === 'string') users.add(user);
  }
  return { maintainerCount: users.size === 0 ? null : users.size };
}

const CRATES_SCOPE_ORDER: readonly Scope[] = ['runtime', 'build', 'dev', 'optional', 'peer'];

/**
 * R12.14: crate names in lookup order. Each name sorts by the first of its
 * scopes in the order runtime, build, dev, optional, peer, then by name in
 * code point order. Duplicate names are listed once.
 */
export function orderCratesLookups(
  targets: readonly { name: string; scopes: readonly Scope[] }[],
): readonly string[] {
  const rankOf = new Map<string, number>();
  for (const target of targets) {
    let rank = CRATES_SCOPE_ORDER.length;
    for (const scope of target.scopes) {
      const r = CRATES_SCOPE_ORDER.indexOf(scope);
      if (r >= 0 && r < rank) rank = r;
    }
    const known = rankOf.get(target.name);
    if (known === undefined || rank < known) rankOf.set(target.name, rank);
  }
  return [...rankOf.keys()].sort((a, b) => {
    const ra = rankOf.get(a) as number;
    const rb = rankOf.get(b) as number;
    return ra !== rb ? ra - rb : compareCodePoints(a, b);
  });
}
