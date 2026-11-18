import { describe, expect, it } from 'vitest';
import {
  mapCratesOwners,
  mapNpmLatest,
  mapPypiOwnership,
  orderCratesLookups,
} from '../../../pipeline/mapping/maintainers';

describe('mapNpmLatest', () => {
  it('counts distinct non-empty names', () => {
    const r = mapNpmLatest({ maintainers: [{ name: 'a' }, { name: 'b' }, { name: 'a' }, { name: '' }] });
    expect(r).toEqual({ maintainerCount: 2, deprecated: false });
  });

  it('gives 0 for an empty list and null for missing, non-array or nameless lists', () => {
    expect(mapNpmLatest({ maintainers: [] }).maintainerCount).toBe(0);
    expect(mapNpmLatest({}).maintainerCount).toBeNull();
    expect(mapNpmLatest({ maintainers: 'x' }).maintainerCount).toBeNull();
    expect(mapNpmLatest({ maintainers: [{ name: 1 }, null] }).maintainerCount).toBeNull();
  });

  it('maps deprecated', () => {
    expect(mapNpmLatest({ deprecated: 'use y' }).deprecated).toBe(true);
    expect(mapNpmLatest({ deprecated: '' }).deprecated).toBe(false);
    expect(mapNpmLatest({ deprecated: true }).deprecated).toBeNull();
  });

  it('returns nulls for non-object bodies', () => {
    for (const body of [null, undefined, 'x', 3, []]) {
      expect(mapNpmLatest(body)).toEqual({ maintainerCount: null, deprecated: null });
    }
  });
});

describe('mapCratesOwners', () => {
  it('counts distinct user logins', () => {
    const body = { users: [{ kind: 'user', login: 'a' }, { kind: 'user', login: 'a' }, { kind: 'user', login: 'b' }] };
    expect(mapCratesOwners(body)).toEqual({ maintainerCount: 2, lowerBound: false });
  });

  it('flags lowerBound when users and teams are mixed', () => {
    const body = { users: [{ kind: 'user', login: 'a' }, { kind: 'team', login: 'github:x:y' }] };
    expect(mapCratesOwners(body)).toEqual({ maintainerCount: 1, lowerBound: true });
  });

  it('gives null for team-only and invalid lists, 0 for empty', () => {
    expect(mapCratesOwners({ users: [{ kind: 'team', login: 't' }] })).toEqual({ maintainerCount: null, lowerBound: false });
    expect(mapCratesOwners({ users: [{ kind: 'user', login: '' }] })).toEqual({ maintainerCount: null, lowerBound: false });
    expect(mapCratesOwners({ users: [] })).toEqual({ maintainerCount: 0, lowerBound: false });
    expect(mapCratesOwners({})).toEqual({ maintainerCount: null, lowerBound: false });
    expect(mapCratesOwners(null)).toEqual({ maintainerCount: null, lowerBound: false });
  });
});

describe('mapPypiOwnership (per-version document)', () => {
  it('sqlalchemy 2.0.36: two Owners -> 2', () => {
    const body = {
      info: { name: 'SQLAlchemy', version: '2.0.36' },
      ownership: {
        organization: 'sqlalchemy',
        roles: [
          { role: 'Owner', user: 'CaselIT' },
          { role: 'Owner', user: 'zzzeek' },
        ],
      },
    };
    expect(mapPypiOwnership(body)).toEqual({ maintainerCount: 2 });
  });

  it('aiohttp 3.9.5: five Maintainer users -> 5', () => {
    const users = ['asvetlov', 'webknjaz', 'Dreamsorcerer', 'bdraco', 'greshilov'];
    const body = {
      info: { name: 'aiohttp', version: '3.9.5' },
      ownership: { organization: null, roles: users.map((user) => ({ role: 'Maintainer', user })) },
    };
    expect(mapPypiOwnership(body)).toEqual({ maintainerCount: 5 });
  });

  it('counts a user with several roles once', () => {
    const body = { ownership: { organization: null, roles: [{ role: 'Owner', user: 'a' }, { role: 'Maintainer', user: 'a' }] } };
    expect(mapPypiOwnership(body)).toEqual({ maintainerCount: 1 });
  });

  it('empty roles: 0 without organization, null with one', () => {
    expect(mapPypiOwnership({ ownership: { organization: null, roles: [] } })).toEqual({ maintainerCount: 0 });
    expect(mapPypiOwnership({ ownership: { roles: [] } })).toEqual({ maintainerCount: 0 });
    expect(mapPypiOwnership({ ownership: { organization: 'org', roles: [] } })).toEqual({ maintainerCount: null });
  });

  it('gives null for missing or malformed ownership', () => {
    for (const body of [null, {}, { ownership: null }, { ownership: { roles: 'x' } }, { ownership: { roles: [{ user: 1 }, null] } }]) {
      expect(mapPypiOwnership(body)).toEqual({ maintainerCount: null });
    }
  });
});

describe('orderCratesLookups', () => {
  it('orders by best scope then code point name, listing duplicates once', () => {
    const out = orderCratesLookups([
      { name: 'zeta', scopes: ['dev'] },
      { name: 'beta', scopes: ['runtime'] },
      { name: 'alpha', scopes: ['dev', 'build'] },
      { name: 'zeta', scopes: ['runtime'] },
      { name: 'Alpha', scopes: ['build'] },
    ]);
    expect(out).toEqual(['beta', 'zeta', 'Alpha', 'alpha']);
  });

  it('returns an empty list for no targets', () => {
    expect(orderCratesLookups([])).toEqual([]);
  });
});
