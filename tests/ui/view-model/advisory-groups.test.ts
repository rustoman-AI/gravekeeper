import { describe, expect, it } from 'vitest';
import {
  ALIAS_SENTENCE,
  UNCLASSIFIED_SENTENCE,
  buildAdvisoryGroups,
} from '../../../view-model/advisory-groups';
import type { AdvisoryExclusion, ParsedAdvisory } from '../../../view-model/types';

// Expected texts come from requirements.md Requirement 10 criteria 16 to 19, not from the source.
const WITHDRAWN_SENTENCE = 'This scan result does not say which of these advisories are withdrawn';
const ALIAS_TEXT = 'Advisories that are aliases of each other count once';

const adv = (id: string, exclusion: AdvisoryExclusion, over: Partial<ParsedAdvisory> = {}): ParsedAdvisory => ({
  id,
  aliases: [],
  severity: 'HIGH',
  url: `https://osv.dev/vulnerability/${id}`,
  exclusion,
  ...over,
});

const none: ReadonlySet<string> = new Set();

describe('exported sentences (R10.16, R10.19)', () => {
  it('match the requirement text', () => {
    expect(ALIAS_SENTENCE).toBe(ALIAS_TEXT);
    expect(UNCLASSIFIED_SENTENCE).toBe(WITHDRAWN_SENTENCE);
  });
});

describe('buildAdvisoryGroups (R10.16)', () => {
  it('gives three labelled groups, in order, for one counted, one informational and one withdrawn entry', () => {
    const groups = buildAdvisoryGroups(
      [adv('W-1', 'withdrawn', { severity: 'LOW' }), adv('I-1', 'informational', { severity: null }), adv('C-1', 'counted')],
      1,
      none,
    );
    expect(groups.map((g) => g.heading)).toEqual([
      'Counted as open',
      'Informational, not counted',
      'Withdrawn, not counted',
    ]);
    expect(groups.map((g) => g.countText)).toEqual(['1 listed, 1 counted', '1 listed', '1 listed']);
    expect(groups[0]!.explanation).toBe(ALIAS_TEXT);
    expect(groups[1]!.explanation).toBe('not part of the 1 open vulnerability'); // R20
    expect(groups[2]!.explanation).toBe('not part of the 1 open vulnerability'); // R20
    expect(groups[0]!.entries.map((e) => e.id)).toEqual(['C-1']);
    expect(groups[1]!.entries[0]!.severityText).toBe('severity unknown');
    expect(groups[2]!.entries[0]!.severityText).toBe('LOW');
  });

  it('states "2 listed, 1 counted" when aliases make the list longer than the count', () => {
    const groups = buildAdvisoryGroups(
      [adv('GHSA-1', 'counted', { aliases: ['CVE-1'] }), adv('CVE-1-twin', 'counted', { aliases: ['GHSA-1'] })],
      1,
      none,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.heading).toBe('Counted as open');
    expect(groups[0]!.countText).toBe('2 listed, 1 counted');
    expect(groups[0]!.explanation).toBe(ALIAS_TEXT);
    expect(groups[0]!.entries[0]!.aliases).toEqual(['CVE-1']);
  });

  it('keeps the API order inside a group and omits empty groups', () => {
    const groups = buildAdvisoryGroups([adv('B', 'counted'), adv('A', 'counted'), adv('C', 'counted')], 3, none);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.entries.map((e) => e.id)).toEqual(['B', 'A', 'C']);
  });

  it('shows "Counted as open" with "0 listed" when the count is above 0 and no entry is counted', () => {
    const groups = buildAdvisoryGroups([adv('I-1', 'informational')], 2, none);
    expect(groups.map((g) => g.heading)).toEqual(['Counted as open', 'Informational, not counted']);
    expect(groups[0]!.countText).toBe('0 listed, 2 counted');
    expect(groups[0]!.entries).toEqual([]);
  });

  it('shows no group for an empty list when the count is 0', () => {
    expect(buildAdvisoryGroups([], 0, none)).toEqual([]);
  });
});

describe('absent excluded (R10.19)', () => {
  it('puts the note-named id under "Informational, not counted" and the rest under "Not classified"', () => {
    const groups = buildAdvisoryGroups(
      [adv('NOTE-1', 'unknown'), adv('OTHER-1', 'unknown'), adv('OTHER-2', 'unknown')],
      0,
      new Set(['NOTE-1']),
    );
    expect(groups.map((g) => g.heading)).toEqual(['Informational, not counted', 'Not classified']);
    expect(groups[0]!.entries.map((e) => e.id)).toEqual(['NOTE-1']);
    expect(groups[1]!.entries.map((e) => e.id)).toEqual(['OTHER-1', 'OTHER-2']);
    expect(groups[1]!.countText).toBe('2 listed');
    expect(groups[1]!.explanation).toBe(WITHDRAWN_SENTENCE);
  });

  it('does not reclassify an entry that has its own excluded value', () => {
    const groups = buildAdvisoryGroups([adv('X', 'counted')], 1, new Set(['X']));
    expect(groups.map((g) => g.heading)).toEqual(['Counted as open']);
  });

  it('counts every entry in exactly one group', () => {
    const list = [adv('a', 'unknown'), adv('b', 'unknown'), adv('c', 'withdrawn'), adv('d', 'counted')];
    const groups = buildAdvisoryGroups(list, 1, new Set(['a']));
    expect(groups.reduce((n, g) => n + g.entries.length, 0)).toBe(list.length);
  });
});

describe('hostile ids and urls (R10.12, R10.18)', () => {
  it('gives href null for urls that fail the pattern and keeps the id as text', () => {
    const hostile = [
      adv('<img onerror=x>', 'counted', { url: 'javascript:alert(1)' }),
      adv('B', 'counted', { url: 'http://osv.dev/vulnerability/B' }),
      adv('C', 'counted', { url: 'https://evil.example/https://osv.dev/vulnerability/C' }),
      adv('D', 'counted', { url: 'https://osv.dev/vulnerability/<script>' }),
      adv('E', 'counted', { url: '' }),
    ];
    const entries = buildAdvisoryGroups(hostile, 5, none)[0]!.entries;
    expect(entries.map((e) => e.href)).toEqual([null, null, null, null, null]);
    expect(entries[0]!.id).toBe('<img onerror=x>');
  });

  it('keeps the url unchanged when it passes the pattern', () => {
    const entries = buildAdvisoryGroups([adv('GHSA-ok', 'counted')], 1, none)[0]!.entries;
    expect(entries[0]!.href).toBe('https://osv.dev/vulnerability/GHSA-ok');
  });
});
