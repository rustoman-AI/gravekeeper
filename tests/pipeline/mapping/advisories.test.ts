import { describe, expect, it } from 'vitest';
import { advisoryUrl, buildAdvisoryEntries } from '../../../pipeline/mapping/advisories';
import type { AdvisoryRecord } from '../../../pipeline/mapping/types';

const PREFIX = 'https://osv.dev/vulnerability/';

function record(id: string, extra: Partial<AdvisoryRecord> = {}): AdvisoryRecord {
  return {
    id,
    aliases: [],
    withdrawn: false,
    informational: false,
    unmaintained: false,
    severity: null,
    ...extra,
  };
}

describe('advisoryUrl', () => {
  it('appends a normal id unchanged', () => {
    expect(advisoryUrl('GHSA-xxxx-1234')).toBe(`${PREFIX}GHSA-xxxx-1234`);
  });
  it('keeps ":", "." and "_"', () => {
    expect(advisoryUrl('A:b.c_d')).toBe(`${PREFIX}A:b.c_d`);
  });
  it('encodes "/", "?", "#", "%" and spaces', () => {
    expect(advisoryUrl('a/b?c#d%e f')).toBe(`${PREFIX}a%2Fb%3Fc%23d%25e%20f`);
  });
  it('encodes non-ASCII as UTF-8 bytes', () => {
    expect(advisoryUrl('é')).toBe(`${PREFIX}%C3%A9`);
    expect(advisoryUrl('😀')).toBe(`${PREFIX}%F0%9F%98%80`);
  });
  it('does not throw on a lone surrogate and encodes U+FFFD', () => {
    expect(advisoryUrl('a\ud800b')).toBe(`${PREFIX}a%EF%BF%BDb`);
  });
});

describe('buildAdvisoryEntries', () => {
  it('drops duplicates, empty strings and non-strings, and sorts by code point', () => {
    const entries = buildAdvisoryEntries(['B', 'A', 'B', '', 1, null, '\u{1F600}', '\uFF5E'], new Map());
    expect(entries.map((e) => e.id)).toEqual(['A', 'B', '\uFF5E', '\u{1F600}']);
  });
  it('gives unfetched ids no aliases and null severity', () => {
    expect(buildAdvisoryEntries(['GHSA-1'], new Map())).toEqual([
      { id: 'GHSA-1', aliases: [], severity: null, url: `${PREFIX}GHSA-1` },
    ]);
  });
  it('lists aliases distinct, ascending, without the id and without empty strings', () => {
    const records = new Map([
      ['GHSA-1', record('GHSA-1', { aliases: ['CVE-2', 'GHSA-1', 'CVE-1', 'CVE-2', ''], severity: 'HIGH' })],
    ]);
    expect(buildAdvisoryEntries(['GHSA-1'], records)).toEqual([
      { id: 'GHSA-1', aliases: ['CVE-1', 'CVE-2'], severity: 'HIGH', url: `${PREFIX}GHSA-1` },
    ]);
  });
  it('keeps an alias that happens to spell the severity', () => {
    const records = new Map([['A', record('A', { aliases: ['HIGH'], severity: 'HIGH' })]]);
    expect(buildAdvisoryEntries(['A'], records)[0]?.aliases).toEqual(['HIGH']);
  });
  it('lists withdrawn and informational advisories', () => {
    const records = new Map([
      ['W', record('W', { withdrawn: true })],
      ['I', record('I', { informational: true })],
    ]);
    expect(buildAdvisoryEntries(['W', 'I'], records).map((e) => e.id)).toEqual(['I', 'W']);
  });
  it('returns an empty list for no ids', () => {
    expect(buildAdvisoryEntries([], new Map())).toEqual([]);
  });
});
