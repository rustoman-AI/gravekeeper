// Requirements 19.27, 19.31
import { describe, expect, it } from 'vitest';
import {
  compactCratesOwners,
  compactDepsDevAdvisory,
  compactOsvAdvisory,
} from '../../pipeline/ports/l2-entries';
import { mapCratesOwners, mapDepsDevAdvisory, mapOsvAdvisory, severityOf } from '../../pipeline/mapping';
import { assembleResult } from '../../pipeline/scan/assemble-result';
import { planLookupTargets } from '../../pipeline/scan/targets';
import { osvAdvisoryBody, RUSTSEC_2020_0036 } from '../support/arbitraries/shapes/ef-6';

const CVSS = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H';
const json = (v: unknown): string => JSON.stringify(v);

/** What the OSV Mapper yields for a body text: record plus the severity read from the same body. */
function osvOutput(text: string, score: number | null): unknown {
  const body: unknown = JSON.parse(text);
  return { record: mapOsvAdvisory(body, score), severity: severityOf(score, body) };
}

describe('compactOsvAdvisory', () => {
  it('keeps exactly the members a Mapper reads (fixed body)', () => {
    const full = {
      id: 'GHSA-xxxx',
      summary: 'x'.repeat(500),
      details: 'y'.repeat(2000),
      modified: '2024-01-01T00:00:00Z',
      aliases: ['CVE-2024-1', 7],
      withdrawn: '2024-02-02T00:00:00Z',
      database_specific: { severity: 'HIGH', cwe_ids: ['CWE-1'], github_reviewed: true },
      affected: [
        { package: { name: 'a' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }] }], database_specific: { informational: 'unmaintained', source: 's' } },
        { database_specific: { informational: 'unmaintained' } },
        { database_specific: { informational: 'notice' } },
        { database_specific: { informational: 5 } },
      ],
      severity: [{ type: 'CVSS_V3', score: CVSS }, { type: 'CVSS_V2', score: 'AV:N' }, { type: 'CVSS_V3', score: 9 }],
      references: [{ type: 'WEB', url: 'https://example.com' }],
    };
    const compact = compactOsvAdvisory(json(full));
    expect(JSON.parse(compact)).toEqual({
      id: 'GHSA-xxxx',
      summary: 'x'.repeat(500),
      details: 'y'.repeat(2000),
      aliases: ['CVE-2024-1'],
      withdrawn: '2024-02-02T00:00:00Z',
      database_specific: { severity: 'HIGH' },
      affected: [
        { database_specific: { informational: 'unmaintained' } },
        { database_specific: { informational: 'notice' } },
      ],
      severity: [{ type: 'CVSS_V3', score: CVSS }],
    });
    expect(compact.length).toBeLessThan(json(full).length);
  });

  // Requirement 3.8
  it('keeps summary and details when strings, including empty, and drops them when absent or not strings', () => {
    expect(JSON.parse(compactOsvAdvisory(json({ id: 'a', summary: '' })))).toEqual({ id: 'a', summary: '' });
    expect(JSON.parse(compactOsvAdvisory(json({ id: 'a', details: 'd' })))).toEqual({ id: 'a', details: 'd' });
    expect(JSON.parse(compactOsvAdvisory(json({ id: 'a' })))).toEqual({ id: 'a' });
    expect(JSON.parse(compactOsvAdvisory(json({ id: 'a', summary: 1, details: ['x'] })))).toEqual({ id: 'a' });
    expect(JSON.parse(compactOsvAdvisory(json({ id: 'a', summary: null, details: {} })))).toEqual({ id: 'a' });
  });

  it('is smaller than a realistic EF-6 body and no larger for a minimal one', () => {
    const realistic = { ...RUSTSEC_2020_0036, details: 'd'.repeat(1000), references: [{ url: 'https://example.com' }] };
    expect(compactOsvAdvisory(json(realistic)).length).toBeLessThan(json(realistic).length);
    // Already minimal: equal length is acceptable (the encoder only drops members).
    const minimal = json({ id: 'A-1' });
    expect(compactOsvAdvisory(minimal).length).toBeLessThanOrEqual(minimal.length);
  });

  const cases: [string, unknown][] = [
    ['plain id only', { id: 'A-1' }],
    ['aliases with non-strings', osvAdvisoryBody('A-2', { aliases: ['x', 1, null] })],
    ['aliases not an array', osvAdvisoryBody('A-3', { aliases: 'x' })],
    ['withdrawn set', osvAdvisoryBody('A-4', { withdrawn: '2024-01-01T00:00:00Z' })],
    ['withdrawn empty string', osvAdvisoryBody('A-5', { withdrawn: '' })],
    ['informational unmaintained', RUSTSEC_2020_0036],
    ['informational other string', osvAdvisoryBody('A-6', { informational: 'notice' })],
    ['informational non-string', osvAdvisoryBody('A-7', { informational: 3 })],
    ['label MODERATE', osvAdvisoryBody('A-8', { databaseSeverity: 'MODERATE' })],
    ['label unknown', osvAdvisoryBody('A-9', { databaseSeverity: 'WEIRD' })],
    ['cvss vector', osvAdvisoryBody('A-10', { cvss: [CVSS] })],
    ['cvss invalid vector', osvAdvisoryBody('A-11', { cvss: ['nope'] })],
    ['label and cvss', osvAdvisoryBody('A-12', { databaseSeverity: 'LOW', cvss: [CVSS] })],
    ['empty id', { id: '', aliases: ['x'] }],
    ['missing id', { aliases: ['x'] }],
    ['non-string id', { id: 4 }],
    ['array body', [{ id: 'x' }]],
    ['null body', null],
    ['number body', 3],
  ];
  it.each(cases)('Mapper output is equal on compact and full text: %s', (_name, body) => {
    const full = json(body);
    const compact = compactOsvAdvisory(full);
    for (const score of [null, 8.1]) {
      expect(osvOutput(compact, score)).toEqual(osvOutput(full, score));
    }
  });

  it('returns unparsable text unchanged', () => {
    expect(compactOsvAdvisory('{not json')).toBe('{not json');
    expect(compactOsvAdvisory('')).toBe('');
  });
});

describe('compactDepsDevAdvisory', () => {
  it('keeps only cvss3Score (fixed body)', () => {
    const full = { advisoryKey: { id: 'GHSA-1' }, title: 't'.repeat(300), cvss3Score: 7.5, aliases: ['CVE-1'] };
    const compact = compactDepsDevAdvisory(json(full));
    expect(compact).toBe('{"cvss3Score":7.5}');
    expect(compact.length).toBeLessThan(json(full).length);
  });

  const cases: [string, unknown][] = [
    ['valid score', { cvss3Score: 7.5, title: 'x' }],
    ['zero', { cvss3Score: 0 }],
    ['ten', { cvss3Score: 10 }],
    ['above range', { cvss3Score: 10.1 }],
    ['negative', { cvss3Score: -0.1 }],
    ['string score', { cvss3Score: '7.5' }],
    ['null score', { cvss3Score: null }],
    ['missing score', { title: 'x' }],
    ['array body', [1]],
    ['null body', null],
  ];
  it.each(cases)('Mapper output is equal on compact and full text: %s', (_name, body) => {
    const full = json(body);
    const compact = compactDepsDevAdvisory(full);
    expect(mapDepsDevAdvisory(JSON.parse(compact))).toEqual(mapDepsDevAdvisory(JSON.parse(full)));
  });

  it('returns unparsable text unchanged', () => {
    expect(compactDepsDevAdvisory('oops')).toBe('oops');
  });
});

describe('compactCratesOwners', () => {
  const user = (login: unknown, extra: Record<string, unknown> = {}) => ({
    id: 1,
    login,
    kind: 'user',
    url: `https://github.com/${String(login)}`,
    name: 'Some Name',
    avatar: 'https://example.com/a.png',
    ...extra,
  });

  it('keeps one user entry per distinct login and one per team (fixed body)', () => {
    const full = {
      users: [
        user('alice'),
        user('alice'),
        user('bob'),
        { id: 2, login: 'github:org:team', kind: 'team', url: 'u', name: 'Team' },
        { id: 3, login: 'github:org:team2', kind: 'team' },
      ],
    };
    const compact = compactCratesOwners(json(full));
    expect(JSON.parse(compact)).toEqual({
      users: [
        { login: 'alice', kind: 'user' },
        { login: 'bob', kind: 'user' },
        { kind: 'team' },
        { kind: 'team' },
      ],
    });
    expect(compact.length).toBeLessThan(json(full).length);
  });

  const cases: [string, unknown][] = [
    ['empty list', { users: [] }],
    ['one user', { users: [user('a')] }],
    ['duplicate logins', { users: [user('a'), user('a'), user('b')] }],
    ['user and team (lower bound)', { users: [user('a'), { kind: 'team', login: 't' }] }],
    ['team only', { users: [{ kind: 'team', login: 't' }] }],
    ['empty login', { users: [user('')] }],
    ['non-string login', { users: [user(5)] }],
    ['unknown kind', { users: [{ kind: 'robot', login: 'r' }] }],
    ['non-object entries', { users: [1, null, 'x'] }],
    ['mixed valid and invalid', { users: [user('a'), user(''), { kind: 'team' }, 7] }],
    ['users not an array', { users: 'a' }],
    ['users missing', { teams: [] }],
    ['array body', [user('a')]],
    ['null body', null],
  ];
  it.each(cases)('Mapper output is equal on compact and full text: %s', (_name, body) => {
    const full = json(body);
    const compact = compactCratesOwners(full);
    expect(mapCratesOwners(JSON.parse(compact))).toEqual(mapCratesOwners(JSON.parse(full)));
  });

  it('returns unparsable text unchanged', () => {
    expect(compactCratesOwners('[')).toBe('[');
  });
});

describe('Scan_Result top-level keys (R18.1)', () => {
  it('has exactly the fields of R18.1', () => {
    const result = assembleResult({
      repo: { host: 'github.com', owner: 'o', repo: 'r', branch: 'main', defaultBranch: 'main', commitSha: 'abc' },
      discovery: { candidates: [], truncatedTree: false, depthLimited: false, countLimited: false },
      manifests: [],
      plan: planLookupTargets([], 100),
      raw: new Map(),
      stageNotes: [],
      asOf: '2025-01-01T00:00:00Z',
      ledger: [],
      deadlineReached: false,
    });
    expect(Object.keys(result).sort()).toEqual(
      ['ok', 'asOf', 'repo', 'discovery', 'manifests', 'dependencies', 'assessed', 'summary', 'sources', 'capped', 'notes'].sort(),
    );
    for (const value of Object.values(result)) expect(value).not.toBeUndefined();
  });
});
