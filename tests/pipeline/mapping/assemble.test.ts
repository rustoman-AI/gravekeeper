import { describe, expect, it } from 'vitest';
import { assembleFacts } from '../../../pipeline/mapping/assemble';
import type { Fetched, RawTargetInputs } from '../../../pipeline/mapping/types';

const AS_OF = '2024-01-01T00:00:00Z';
const ok = <T>(body: T): Fetched<T> => ({ state: 'ok', body });
const unavailable: Fetched<never> = { state: 'unavailable' };

function pkg(isDeprecated?: boolean) {
  return {
    versions: [
      {
        versionKey: { version: '1.0.0' },
        publishedAt: '2023-12-22T00:00:00Z',
        isDefault: false,
      },
      {
        versionKey: { version: '2.0.0' },
        publishedAt: '2023-12-27T00:00:00Z',
        isDefault: true,
        ...(isDeprecated === undefined ? {} : { isDeprecated }),
      },
    ],
  };
}

function osvBody(id: string, extra: Record<string, unknown> = {}) {
  return { id, ...extra };
}

function advisories(entries: Record<string, unknown>) {
  return new Map(
    Object.entries(entries).map(([id, body]) => [
      id,
      { osv: ok(body), depsdev: unavailable as Fetched<unknown> },
    ]),
  );
}

function unmaintainedAdvisory(id: string, extra: Record<string, unknown> = {}) {
  return osvBody(id, { affected: [{ database_specific: { informational: 'unmaintained' } }], ...extra });
}

function inputs(overrides: Partial<RawTargetInputs> = {}): RawTargetInputs {
  return {
    ecosystem: 'npm',
    name: 'left-pad',
    versionSpecs: [],
    depsdevPackage: ok(pkg(false)),
    npmLatest: ok({ maintainers: [{ name: 'a' }, { name: 'b' }] }),
    maintainers: ok({ maintainers: [{ name: 'a' }, { name: 'b' }] }),
    osv: {
      queryResult: { kind: 'ids', ids: ['GHSA-1'], truncated: false },
      advisories: advisories({ 'GHSA-1': osvBody('GHSA-1') }),
      unfetchedIds: [],
    },
    repository: ok({ alias: 'r0', kind: 'ok', archived: false, daysSinceLastCommit: 3 }),
    webHost: 'github.com',
    ...overrides,
  };
}

function cargo(osv: RawTargetInputs['osv'], pkgDeprecated?: boolean): RawTargetInputs {
  return inputs({
    ecosystem: 'cargo',
    name: 'crate',
    depsdevPackage: ok(pkg(pkgDeprecated)),
    maintainers: ok({ users: [{ kind: 'user', login: 'u' }] }),
    osv,
  });
}

function idsOsv(ids: string[], bodies: Record<string, unknown>): RawTargetInputs['osv'] {
  return {
    queryResult: { kind: 'ids', ids, truncated: false },
    advisories: advisories(bodies),
    unfetchedIds: [],
  };
}

describe('assembleFacts: all sources ok', () => {
  it('fills the seven facts and no notes', () => {
    const { facts, selection, notes } = assembleFacts(inputs(), AS_OF);
    expect(facts).toEqual({
      daysSinceLastRelease: 5,
      daysSinceLastCommit: 3,
      archived: false,
      deprecated: false,
      openVulnerabilityCount: 1,
      maxSeverity: null,
      maintainerCount: 2,
    });
    expect(selection).toEqual({ selected: '2.0.0', basis: 'default', notes: [] });
    expect(notes).toEqual([]);
  });
});

describe('assembleFacts: unavailable sources null only their own facts', () => {
  it('deps.dev package unavailable', () => {
    const { facts, notes } = assembleFacts(inputs({ depsdevPackage: unavailable }), AS_OF);
    expect(facts.daysSinceLastRelease).toBeNull();
    expect(facts.deprecated).toBeNull();
    expect(facts.openVulnerabilityCount).toBeNull();
    expect(facts.daysSinceLastCommit).toBeNull();
    expect(facts.archived).toBeNull();
    expect(facts.maintainerCount).toBe(2);
    expect(notes).toEqual([]);
  });

  it('package absent adds package-not-found', () => {
    const { facts, notes } = assembleFacts(inputs({ depsdevPackage: { state: 'absent' } }), AS_OF);
    expect(notes).toEqual([
      { code: 'package-not-found', details: { ecosystem: 'npm', name: 'left-pad' } },
    ]);
    expect(facts.openVulnerabilityCount).toBeNull();
    expect(facts.maintainerCount).toBe(2);
  });

  it('maintainers unavailable', () => {
    const { facts } = assembleFacts(inputs({ maintainers: unavailable }), AS_OF);
    expect(facts.maintainerCount).toBeNull();
    expect(facts.daysSinceLastRelease).toBe(5);
    expect(facts.openVulnerabilityCount).toBe(1);
    expect(facts.archived).toBe(false);
  });

  it('OSV unavailable', () => {
    const base = inputs();
    const { facts } = assembleFacts(
      inputs({ osv: { ...base.osv, queryResult: 'unavailable' } }),
      AS_OF,
    );
    expect(facts.openVulnerabilityCount).toBeNull();
    expect(facts.maxSeverity).toBeNull();
    expect(facts.daysSinceLastRelease).toBe(5);
    expect(facts.maintainerCount).toBe(2);
  });

  it('repository unavailable', () => {
    const { facts } = assembleFacts(inputs({ repository: unavailable }), AS_OF);
    expect(facts.archived).toBeNull();
    expect(facts.daysSinceLastCommit).toBeNull();
    expect(facts.openVulnerabilityCount).toBe(1);
  });

  it('repository not-found leaves repository facts null', () => {
    const { facts } = assembleFacts(
      inputs({ repository: ok({ alias: 'r0', kind: 'not-found' }) }),
      AS_OF,
    );
    expect(facts.archived).toBeNull();
    expect(facts.daysSinceLastCommit).toBeNull();
  });

  it('no-source-repo leaves repository facts null', () => {
    const { facts } = assembleFacts(inputs({ repository: 'no-source-repo' }), AS_OF);
    expect(facts.archived).toBeNull();
    expect(facts.daysSinceLastCommit).toBeNull();
    expect(facts.daysSinceLastRelease).toBe(5);
  });
});

describe('assembleFacts: deprecated composition', () => {
  it('uses deps.dev isDeprecated for the Selected_Version', () => {
    expect(assembleFacts(inputs({ depsdevPackage: ok(pkg(true)) }), AS_OF).facts.deprecated).toBe(true);
    expect(assembleFacts(inputs({ depsdevPackage: ok(pkg(false)) }), AS_OF).facts.deprecated).toBe(false);
  });

  it('npm default selection fills a missing flag from npm latest', () => {
    const { facts } = assembleFacts(
      inputs({
        depsdevPackage: ok(pkg()),
        npmLatest: ok({ deprecated: 'use other' }),
      }),
      AS_OF,
    );
    expect(facts.deprecated).toBe(true);
  });

  it('npm default selection stays null when npm latest is unavailable', () => {
    const { facts } = assembleFacts(
      inputs({ depsdevPackage: ok(pkg()), npmLatest: unavailable }),
      AS_OF,
    );
    expect(facts.deprecated).toBeNull();
  });

  it('npm pinned selection does not consult npm latest', () => {
    const { facts, selection } = assembleFacts(
      inputs({
        versionSpecs: ['1.0.0'],
        depsdevPackage: ok(pkg()),
        npmLatest: ok({ deprecated: 'use other' }),
      }),
      AS_OF,
    );
    expect(selection.basis).toBe('pinned');
    expect(facts.deprecated).toBeNull();
  });

  it('does not override a deps.dev false with npm latest', () => {
    const { facts } = assembleFacts(inputs({ npmLatest: ok({ deprecated: 'x' }) }), AS_OF);
    expect(facts.deprecated).toBe(false);
  });
});

describe('assembleFacts: unmaintained advisories (R9.6)', () => {
  const body = { A: unmaintainedAdvisory('RUSTSEC-1') };

  it('cargo with deps.dev deprecated false becomes true and gets the note', () => {
    const { facts, notes } = assembleFacts(cargo(idsOsv(['A'], body), false), AS_OF);
    expect(facts.deprecated).toBe(true);
    expect(notes.filter((n) => n.code === 'unmaintained-advisory')).toEqual([
      {
        code: 'unmaintained-advisory',
        details: { ecosystem: 'cargo', name: 'crate', ids: ['RUSTSEC-1'] },
      },
    ]);
    expect(notes.some((n) => n.code === 'informational-advisory-excluded')).toBe(true);
    expect(facts.openVulnerabilityCount).toBe(0);
  });

  it('cargo with deprecated already true stays true and still gets the note', () => {
    const { facts, notes } = assembleFacts(cargo(idsOsv(['A'], body), true), AS_OF);
    expect(facts.deprecated).toBe(true);
    expect(notes.filter((n) => n.code === 'unmaintained-advisory')).toHaveLength(1);
  });

  it('cargo with deprecated null becomes true', () => {
    const { facts } = assembleFacts(cargo(idsOsv(['A'], body)), AS_OF);
    expect(facts.deprecated).toBe(true);
  });

  it('npm target gets no override and no unmaintained note', () => {
    const { facts, notes } = assembleFacts(
      inputs({ osv: idsOsv(['A'], body) }),
      AS_OF,
    );
    expect(facts.deprecated).toBe(false);
    expect(notes.some((n) => n.code === 'unmaintained-advisory')).toBe(false);
    expect(notes.some((n) => n.code === 'informational-advisory-excluded')).toBe(true);
  });

  it('withdrawn unmaintained advisory changes nothing', () => {
    const withdrawn = { A: unmaintainedAdvisory('RUSTSEC-1', { withdrawn: '2023-01-01T00:00:00Z' }) };
    const { facts, notes } = assembleFacts(cargo(idsOsv(['A'], withdrawn), false), AS_OF);
    expect(facts.deprecated).toBe(false);
    expect(notes).toEqual([]);
    expect(facts.openVulnerabilityCount).toBe(0);
  });

  it('unsound and notice advisories do not set deprecated or add the note', () => {
    const other = {
      U: osvBody('RUSTSEC-2', { affected: [{ database_specific: { informational: 'unsound' } }] }),
      N: osvBody('RUSTSEC-3', { affected: [{ database_specific: { informational: 'notice' } }] }),
    };
    const { facts, notes } = assembleFacts(cargo(idsOsv(['U', 'N'], other), false), AS_OF);
    expect(facts.deprecated).toBe(false);
    expect(notes.map((n) => n.code)).toEqual(['informational-advisory-excluded']);
    expect(notes[0]?.details['ids']).toEqual(['RUSTSEC-2', 'RUSTSEC-3']);
  });
});

describe('assembleFacts: OSV edge cases', () => {
  it('truncated result adds osv-pagination-ignored', () => {
    const base = inputs();
    const { notes } = assembleFacts(
      inputs({ osv: { ...base.osv, queryResult: { kind: 'ids', ids: ['GHSA-1'], truncated: true } } }),
      AS_OF,
    );
    expect(notes.map((n) => n.code)).toEqual(['osv-pagination-ignored']);
  });

  it('unfetched and unusable advisories count and add advisory-details-incomplete', () => {
    const { facts, notes } = assembleFacts(
      inputs({
        osv: {
          queryResult: { kind: 'ids', ids: ['GHSA-1', 'GHSA-2'], truncated: false },
          advisories: advisories({ 'GHSA-1': osvBody('GHSA-1') }),
          unfetchedIds: ['GHSA-3'],
        },
      }),
      AS_OF,
    );
    expect(facts.openVulnerabilityCount).toBe(3);
    expect(notes).toEqual([
      {
        code: 'advisory-details-incomplete',
        details: { ecosystem: 'npm', name: 'left-pad', ids: ['GHSA-2', 'GHSA-3'] },
      },
    ]);
  });

  it('skips OSV entirely when the package is not found', () => {
    const { facts, advisories: list } = assembleFacts(inputs({ depsdevPackage: { state: 'absent' } }), AS_OF);
    expect(facts.openVulnerabilityCount).toBeNull();
    expect(list).toEqual([]);
  });
});

describe('assembleFacts: advisories field (R6)', () => {
  const url = (id: string) => `https://osv.dev/vulnerability/${id}`;

  it('lists fetched and unfetched ids ascending, with aliases and severity for fetched ones', () => {
    const { advisories: list } = assembleFacts(
      inputs({
        osv: {
          queryResult: { kind: 'ids', ids: ['GHSA-2', 'GHSA-1', 'GHSA-1', 'GHSA-3'], truncated: false },
          advisories: advisories({
            'GHSA-1': osvBody('GHSA-1', { aliases: ['CVE-1', 'GHSA-1'], database_specific: { severity: 'HIGH' } }),
          }),
          unfetchedIds: ['GHSA-3'],
        },
      }),
      AS_OF,
    );
    expect(list).toEqual([
      { id: 'GHSA-1', aliases: ['CVE-1'], severity: 'HIGH', url: url('GHSA-1') },
      { id: 'GHSA-2', aliases: [], severity: null, url: url('GHSA-2') },
      { id: 'GHSA-3', aliases: [], severity: null, url: url('GHSA-3') },
    ]);
  });
  it('lists withdrawn and informational advisories while the count excludes them', () => {
    const { facts, advisories: list } = assembleFacts(
      cargo(
        idsOsv(['R-1', 'R-2', 'R-3'], {
          'R-1': osvBody('R-1', { withdrawn: '2023-01-01T00:00:00Z' }),
          'R-2': unmaintainedAdvisory('R-2'),
          'R-3': osvBody('R-3'),
        }),
      ),
      AS_OF,
    );
    expect(facts.openVulnerabilityCount).toBe(1);
    expect(list.map((e) => e.id)).toEqual(['R-1', 'R-2', 'R-3']);
  });
  it('lists both ids of an alias group while counting one vulnerability', () => {
    const { facts, advisories: list } = assembleFacts(
      inputs({
        osv: idsOsv(['A', 'B'], {
          A: osvBody('A', { aliases: ['B'] }),
          B: osvBody('B', { aliases: ['A'] }),
        }),
      }),
      AS_OF,
    );
    expect(facts.openVulnerabilityCount).toBe(1);
    expect(list).toHaveLength(2);
  });
  it('is empty when the result has no ids, OSV is unavailable, or nothing is selected', () => {
    expect(assembleFacts(inputs({ osv: idsOsv([], {}) }), AS_OF).advisories).toEqual([]);
    const base = inputs();
    expect(assembleFacts(inputs({ osv: { ...base.osv, queryResult: 'unavailable' } }), AS_OF).advisories).toEqual([]);
    expect(assembleFacts(inputs({ depsdevPackage: ok({ versions: [] }) }), AS_OF).advisories).toEqual([]);
  });
});

describe('assembleFacts: selection notes and maintainers', () => {
  it('reports pin-not-found and falls back to the default version', () => {
    const { selection, notes } = assembleFacts(inputs({ versionSpecs: ['9.9.9'] }), AS_OF);
    expect(selection).toMatchObject({ selected: '2.0.0', basis: 'default' });
    expect(notes).toEqual([
      { code: 'pin-not-found', details: { ecosystem: 'npm', name: 'left-pad', pinned: '9.9.9' } },
    ]);
  });

  it('reports no-default-version', () => {
    const { selection, facts, notes } = assembleFacts(
      inputs({ depsdevPackage: ok({ versions: [{ versionKey: { version: '1.0.0' } }] }) }),
      AS_OF,
    );
    expect(selection.selected).toBeNull();
    expect(facts.deprecated).toBeNull();
    expect(notes.map((n) => n.code)).toEqual(['no-default-version']);
  });

  it('crates owners with users and teams add maintainers-lower-bound', () => {
    const { facts, notes } = assembleFacts(
      {
        ...cargo(idsOsv([], {})),
        maintainers: ok({ users: [{ kind: 'user', login: 'u' }, { kind: 'team', login: 't' }] }),
      },
      AS_OF,
    );
    expect(facts.maintainerCount).toBe(1);
    expect(notes.map((n) => n.code)).toEqual(['maintainers-lower-bound']);
  });

  it('PyPI maintainerCount comes from ownership roles', () => {
    const { facts } = assembleFacts(
      inputs({
        ecosystem: 'pypi',
        maintainers: ok({ ownership: { roles: [{ user: 'x' }, { user: 'y' }, { user: 'x' }] } }),
      }),
      AS_OF,
    );
    expect(facts.maintainerCount).toBe(2);
  });

  it('PyPI maintainerCount is null when there is no Selected_Version (R12.16)', () => {
    const { facts, selection } = assembleFacts(
      inputs({
        ecosystem: 'pypi',
        depsdevPackage: ok({ versions: [{ versionKey: { version: '1.0' } }] }),
        maintainers: unavailable,
      }),
      AS_OF,
    );
    expect(selection.selected).toBeNull();
    expect(facts.maintainerCount).toBeNull();
  });
});
