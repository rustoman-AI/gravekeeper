import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../../../pipeline/constants';
import {
  mapDepsDevPackage,
  mapDepsDevVersion,
  mapDepsDevVersionBatch,
} from '../../../pipeline/mapping/deps-dev';
import { ef1Body, ef1Version } from '../../support/arbitraries/shapes/ef-1';
import { ef2Body, ef2Project } from '../../support/arbitraries/shapes/ef-2';
import { ef3Body, ef3Response } from '../../support/arbitraries/shapes/ef-3';

const ASOF = '2024-03-10T12:00:00Z';
const ASOF_MS = Date.parse(ASOF);
const ago = (days: number): string => new Date(ASOF_MS - days * DAY_MS).toISOString();
const HOST = 'github.com';

describe('mapDepsDevPackage', () => {
  it('takes the minimum Day_Count over valid timestamps', () => {
    const body = ef1Body([
      ef1Version({ version: '1.0.0', publishedAt: ago(100) }),
      ef1Version({ version: '1.1.0', publishedAt: ago(10), isDefault: true }),
      ef1Version({ version: '0.9.0', publishedAt: ago(400) }),
    ]);
    const facts = mapDepsDevPackage(body, '1.1.0', ASOF);
    expect(facts.daysSinceLastRelease).toBe(10);
    expect(facts.defaultVersion).toBe('1.1.0');
    expect(facts.versions).toEqual(['1.0.0', '1.1.0', '0.9.0']);
  });

  it('skips invalid timestamps; null when none valid; future clamps to 0', () => {
    const body = ef1Body([
      ef1Version({ version: '1.0.0', publishedAt: 'nope' }),
      ef1Version({ version: '1.1.0', publishedAt: 5 }),
      ef1Version({ version: '1.3.0' }),
    ]);
    const future = ef1Body([ef1Version({ version: '1.2.0', publishedAt: ago(-3) })]);
    expect(mapDepsDevPackage(future, null, ASOF).daysSinceLastRelease).toBe(0);
    expect(mapDepsDevPackage(body, null, ASOF).daysSinceLastRelease).toBeNull();
    const mixed = ef1Body([
      ef1Version({ version: '1.0.0', publishedAt: 'nope' }),
      ef1Version({ version: '1.1.0', publishedAt: ago(7) }),
    ]);
    expect(mapDepsDevPackage(mixed, null, ASOF).daysSinceLastRelease).toBe(7);
  });

  it('reads isDeprecated of the Selected_Version only', () => {
    const body = ef1Body([
      ef1Version({ version: '1.0.0', isDeprecated: true }),
      ef1Version({ version: '2.0.0', isDeprecated: false }),
    ]);
    expect(mapDepsDevPackage(body, '1.0.0', ASOF).deprecated).toBe(true);
    expect(mapDepsDevPackage(body, '2.0.0', ASOF).deprecated).toBe(false);
    expect(mapDepsDevPackage(body, '3.0.0', ASOF).deprecated).toBeNull();
    expect(mapDepsDevPackage(body, null, ASOF).deprecated).toBeNull();
  });

  it('gives null deprecated for a missing or non-boolean flag', () => {
    expect(mapDepsDevPackage(ef1Body([ef1Version({ version: '1.0.0' })]), '1.0.0', ASOF).deprecated).toBeNull();
    expect(
      mapDepsDevPackage(ef1Body([ef1Version({ version: '1.0.0', isDeprecated: 'true' })]), '1.0.0', ASOF)
        .deprecated,
    ).toBeNull();
  });

  it('uses the first entry for a duplicated Selected_Version', () => {
    const body = ef1Body([
      ef1Version({ version: '1.0.0', isDeprecated: true }),
      ef1Version({ version: '1.0.0', isDeprecated: false }),
    ]);
    expect(mapDepsDevPackage(body, '1.0.0', ASOF).deprecated).toBe(true);
  });

  it('is total on non-object bodies and non-object entries', () => {
    const empty = { daysSinceLastRelease: null, deprecated: null, defaultVersion: null, versions: [] };
    for (const body of [null, undefined, 1, 'x', [], {}, { versions: 'x' }, { versions: {} }]) {
      expect(mapDepsDevPackage(body, '1.0.0', ASOF)).toEqual(empty);
    }
    const facts = mapDepsDevPackage(ef1Body([null, 3, ef1Version({ version: '1.0.0', publishedAt: ago(2) })]), null, ASOF);
    expect(facts.daysSinceLastRelease).toBe(2);
  });

  it('gives null release age for an invalid asOf', () => {
    const body = ef1Body([ef1Version({ version: '1.0.0', publishedAt: ago(2) })]);
    expect(mapDepsDevPackage(body, null, 'garbage').daysSinceLastRelease).toBeNull();
  });
});

describe('mapDepsDevVersion', () => {
  it('returns the Source_Repo of a SOURCE_REPO entry', () => {
    const body = ef2Body([ef2Project('github.com/Owner/Repo')]);
    expect(mapDepsDevVersion(body, HOST)).toEqual({ owner: 'Owner', name: 'Repo' });
  });

  it('compares the host case-insensitively with Web_Host', () => {
    const body = ef2Body([ef2Project('GitHub.com/o/r')]);
    expect(mapDepsDevVersion(body, 'GITHUB.COM')).toEqual({ owner: 'o', name: 'r' });
  });

  it('is absent when the host differs from Web_Host', () => {
    const body = ef2Body([ef2Project('github.com/o/r')]);
    expect(mapDepsDevVersion(body, 'ghe.example.com')).toBeNull();
    expect(mapDepsDevVersion(ef2Body([ef2Project('gitlab.com/o/r')]), HOST)).toBeNull();
  });

  it('ignores non SOURCE_REPO entries and malformed ids', () => {
    const body = ef2Body([
      ef2Project('github.com/a/b', 'ISSUE_TRACKER'),
      ef2Project(5),
      ef2Project('github.com/a'),
      ef2Project('github.com/a/b/c'),
      ef2Project('github.com//b'),
      ef2Project('github.com/a/'),
      null,
      ef2Project('github.com/o/r'),
    ]);
    expect(mapDepsDevVersion(body, HOST)).toEqual({ owner: 'o', name: 'r' });
  });

  it('uses the first usable SOURCE_REPO entry', () => {
    const body = ef2Body([ef2Project('github.com/a/b'), ef2Project('github.com/c/d')]);
    expect(mapDepsDevVersion(body, HOST)).toEqual({ owner: 'a', name: 'b' });
  });

  it('is total on hostile bodies', () => {
    for (const body of [null, undefined, 1, [], {}, { relatedProjects: 'x' }, { relatedProjects: [] }]) {
      expect(mapDepsDevVersion(body, HOST)).toBeNull();
    }
  });
});

describe('mapDepsDevVersionBatch', () => {
  const req = (name: string, version = '1.0.0', system = 'npm') => ({ system, name, version });
  const key = (name: string, version = '1.0.0', system = 'NPM') => ({ system, name, version });

  it('returns one entry per request in request order', () => {
    const body = ef3Body([
      ef3Response(key('a'), [ef2Project('github.com/o/a')]),
      ef3Response(key('b'), []),
    ]);
    expect(mapDepsDevVersionBatch(body, [req('a'), req('b')], HOST)).toEqual([
      { found: true, sourceRepo: { owner: 'o', name: 'a' } },
      { found: true, sourceRepo: null },
    ]);
  });

  it('matches reordered responses by key, not position', () => {
    const body = ef3Body([
      ef3Response(key('b'), [ef2Project('github.com/o/b')]),
      ef3Response(key('a'), [ef2Project('github.com/o/a')]),
    ]);
    expect(mapDepsDevVersionBatch(body, [req('a'), req('b')], HOST)).toEqual([
      { found: true, sourceRepo: { owner: 'o', name: 'a' } },
      { found: true, sourceRepo: { owner: 'o', name: 'b' } },
    ]);
  });

  it('reports a missing response as not found and ignores extra responses', () => {
    const body = ef3Body([
      ef3Response(key('extra'), [ef2Project('github.com/o/x')]),
      ef3Response(key('a'), [ef2Project('github.com/o/a')]),
    ]);
    expect(mapDepsDevVersionBatch(body, [req('a'), req('missing')], HOST)).toEqual([
      { found: true, sourceRepo: { owner: 'o', name: 'a' } },
      { found: false },
    ]);
  });

  it('matches system case-insensitively but name and version exactly', () => {
    const body = ef3Body([ef3Response(key('Pkg', '1.0.0', 'NPM'), [ef2Project('github.com/o/p')])]);
    expect(mapDepsDevVersionBatch(body, [req('Pkg', '1.0.0', 'Npm')], HOST)).toEqual([
      { found: true, sourceRepo: { owner: 'o', name: 'p' } },
    ]);
    expect(mapDepsDevVersionBatch(body, [req('pkg')], HOST)).toEqual([{ found: false }]);
    expect(mapDepsDevVersionBatch(body, [req('Pkg', '1.0.1')], HOST)).toEqual([{ found: false }]);
  });

  it('lets the first matching response win', () => {
    const body = ef3Body([
      ef3Response(key('a'), [ef2Project('github.com/o/first')]),
      ef3Response(key('a'), [ef2Project('github.com/o/second')]),
    ]);
    expect(mapDepsDevVersionBatch(body, [req('a')], HOST)).toEqual([
      { found: true, sourceRepo: { owner: 'o', name: 'first' } },
    ]);
  });

  it('gives a null Source_Repo for a found response without a version document', () => {
    const body = ef3Body([ef3Response(key('a'))]);
    expect(mapDepsDevVersionBatch(body, [req('a')], HOST)).toEqual([{ found: true, sourceRepo: null }]);
  });

  it('skips responses with unusable keys', () => {
    const body = ef3Body([null, { request: {} }, ef3Response({ system: 'NPM', name: 'a', version: 1 })]);
    expect(mapDepsDevVersionBatch(body, [req('a')], HOST)).toEqual([{ found: false }]);
  });

  it('returns null when responses is not an array, and [] for no requests', () => {
    for (const body of [null, 1, {}, { responses: {} }, { responses: 'x' }]) {
      expect(mapDepsDevVersionBatch(body, [req('a')], HOST)).toBeNull();
    }
    expect(mapDepsDevVersionBatch(ef3Body([]), [], HOST)).toEqual([]);
  });
});
