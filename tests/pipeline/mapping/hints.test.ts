import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { advisoryUrl } from '../../../pipeline/mapping/advisories';
import { advisoryNoticeHints, npmDeprecationHint } from '../../../pipeline/mapping/hints';
import type { AdvisoryRecord } from '../../../pipeline/mapping/types';

const fixtureDir = join(process.cwd(), 'tests/fixtures/request__request');

const harValidatorLatest = (): unknown => {
  const index = JSON.parse(readFileSync(join(fixtureDir, 'index.json'), 'utf8')) as {
    url: string;
    file: string;
  }[];
  const entry = index.find((e) => e.url === 'https://registry.npmjs.org/har-validator/latest');
  expect(entry).toBeDefined();
  const recorded = JSON.parse(readFileSync(join(fixtureDir, entry!.file), 'utf8')) as {
    response: { bodyText: string };
  };
  return JSON.parse(recorded.response.bodyText);
};

const record = (over: Partial<AdvisoryRecord> & { id: string }): AdvisoryRecord => ({
  aliases: [],
  withdrawn: false,
  informational: true,
  unmaintained: true,
  severity: null,
  details: null,
  summary: null,
  ...over,
});

describe('npmDeprecationHint', () => {
  it('reads the recorded har-validator latest body', () => {
    expect(npmDeprecationHint(harValidatorLatest())).toEqual([
      {
        kind: 'deprecation-notice',
        text: 'this library is no longer supported',
        sourceUrl: null,
      },
    ]);
  });

  it.each([
    ['empty string', { deprecated: '' }],
    ['false', { deprecated: false }],
    ['no field', { name: 'x' }],
    ['array', ['deprecated']],
    ['null', null],
  ])('gives no hint for %s', (_label, body) => {
    expect(npmDeprecationHint(body)).toEqual([]);
  });
});

describe('advisoryNoticeHints', () => {
  it('uses details when present', () => {
    const hints = advisoryNoticeHints([record({ id: 'RUSTSEC-1', details: ' a\nb ', summary: 's' })]);
    expect(hints).toEqual([
      { kind: 'advisory-notice', text: 'a b', sourceUrl: advisoryUrl('RUSTSEC-1') },
    ]);
  });

  it('falls back to summary when details is blank', () => {
    const hints = advisoryNoticeHints([record({ id: 'RUSTSEC-1', details: '  ', summary: 'sum' })]);
    expect(hints.map((h) => h.text)).toEqual(['sum']);
  });

  it('gives no hint without details and summary', () => {
    expect(advisoryNoticeHints([record({ id: 'RUSTSEC-1' })])).toEqual([]);
  });

  it('skips withdrawn and not-unmaintained records', () => {
    expect(
      advisoryNoticeHints([
        record({ id: 'A', details: 'x', withdrawn: true }),
        record({ id: 'B', details: 'x', unmaintained: false }),
      ]),
    ).toEqual([]);
  });

  it('keeps three hints in ascending id order and drops duplicate ids', () => {
    const hints = advisoryNoticeHints([
      record({ id: 'RUSTSEC-4', details: 'd4' }),
      record({ id: 'RUSTSEC-2', details: 'd2' }),
      record({ id: 'RUSTSEC-3', details: 'd3' }),
      record({ id: 'RUSTSEC-1', details: 'd1' }),
      record({ id: 'RUSTSEC-1', details: 'again' }),
    ]);
    expect(hints.map((h) => h.text)).toEqual(['d1', 'd2', 'd3']);
    expect(hints.map((h) => h.sourceUrl)).toEqual(
      ['RUSTSEC-1', 'RUSTSEC-2', 'RUSTSEC-3'].map(advisoryUrl),
    );
  });
});
