// Feature: resurrect, Property RS-P7: Links come only from validated builders, never from hint text
// Validates: Requirements 12.2, 4.9, 4.10
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildResurrectModel } from '../../../view-model/resurrect';
import { loadCurated, type CuratedEntry } from '../../../view-model/resurrections';
import type { PackageRow, ParsedHint, ParsedScanResult, ResurrectModel } from '../../../view-model/types';
import { advisoryLink, registryLink, sourceRepoLink } from '../../../view-model/urls';
import { arbEcosystem, arbHint, HOSTILE_TEXTS, makeRow, SLOT_CASES } from '../../support/arbitraries/resurrect';
import { cfg } from '../../support/fc-config';

const TEXT_ONLY_URLS = [
  'https://osv.dev/vulnerability/TEXT-ONLY-1',
  'https://www.npmjs.com/package/text-only',
  'https://github.com/text/only',
  'https://evil.example/x',
];
const SOURCE_URLS: readonly unknown[] = [
  null,
  undefined,
  42,
  {},
  '',
  'javascript:alert(1)',
  'http://osv.dev/vulnerability/GHSA-x',
  'https://osv.dev/vulnerability/GHSA-aaaa-bbbb-cccc',
  'https://osv.dev/vulnerability/a/b',
  'https://osv.dev/vulnerability/x?y=1',
  'https://evil.example/',
  ' https://osv.dev/vulnerability/GHSA-x',
];
const CURATED_SOURCES: readonly unknown[] = [
  'https://example.com/source',
  'http://example.com/source',
  'javascript:alert(1)',
  'https://user:pw@example.com/x',
  'ftp://example.com/x',
  '',
  7,
  null,
  'https://evil.example/',
];
const SOURCE_REPOS: readonly unknown[] = [
  'github.com/owner/repo',
  'github.com/o/r/extra',
  'gitlab.com/o/r',
  'https://github.com/o/r',
  'javascript:alert(1)',
  null,
  5,
  'github.com/a b/c',
];
const NAMES = ['request', 'got', 'bincode', 'a-b', 'x', '@scope/pkg', 'javascript:x', 'a b', '<b>', ''];

const arbText: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(...HOSTILE_TEXTS),
  fc.tuple(fc.string({ maxLength: 15 }), fc.constantFrom(...TEXT_ONLY_URLS), fc.string({ maxLength: 15 })).map(
    ([a, u, b]) => `${a} ${u} ${b}`,
  ),
  fc.tuple(fc.constantFrom(...TEXT_ONLY_URLS)).map(([u]) => `[see](${u}) <a href="${u}">x</a> javascript:${u}`),
  fc.string({ minLength: 1, maxLength: 40 }),
);

const arbWildHint: fc.Arbitrary<ParsedHint> = fc.oneof(
  arbHint,
  fc
    .record({
      kind: fc.constantFrom<ParsedHint['kind']>('deprecation-notice', 'advisory-notice'),
      text: arbText,
      sourceUrl: fc.constantFrom(...SOURCE_URLS),
    })
    .map((h) => ({ ...h, link: null }) as unknown as ParsedHint),
);

interface Scenario {
  readonly row: PackageRow;
  readonly result: ParsedScanResult;
  readonly entries: readonly CuratedEntry[];
  readonly repo: unknown;
}

const arbScenario: fc.Arbitrary<Scenario> = fc
  .record({
    ecosystem: arbEcosystem,
    name: fc.constantFrom(...NAMES),
    plotCase: fc.constantFrom(...SLOT_CASES),
    hints: fc.array(arbWildHint, { maxLength: 3 }),
    repo: fc.constantFrom(...SOURCE_REPOS),
    source: fc.constantFrom(...CURATED_SOURCES),
    withEntry: fc.boolean(),
    to: fc.constantFrom('got', 'axios', 'request', 'bad name', 'node-fetch'),
  })
  .map(({ ecosystem, name, plotCase, hints, repo, source, withEntry, to }) => {
    const row = makeRow({ ecosystem, name, plotCase, hints });
    const raw = withEntry ? [{ ecosystem, from: name, to: [to], why: 'Use another one.', source }] : [];
    const entries = loadCurated({ entries: raw });
    const result = {
      notes: [{ code: 'source-repo-unverified', details: { ecosystem, name, sourceRepo: repo } }],
    } as unknown as ParsedScanResult;
    return { row, result, entries, repo };
  });

function hrefsOf(model: ResurrectModel): string[] {
  const out: string[] = [];
  for (const h of model.hints) if (h.link !== null) out.push(h.link.href);
  for (const s of model.suggestions) out.push(s.source.href);
  if (model.fallback !== null) for (const l of model.fallback.links) out.push(l.href);
  return out;
}

function extractUrls(text: string): string[] {
  return text.match(/(?:https?:\/\/|javascript:)[^\s)"'<>]*/gi) ?? [];
}

describe('RS-P7 resurrect links property', () => {
  it('RS-P7: every href comes from a validated builder or a validated curated source, is https, and is not taken from hint text', () => {
    fc.assert(
      fc.property(arbScenario, ({ row, result, entries, repo }) => {
        const model = buildResurrectModel(row, result, (eco, n) =>
          entries.find((e) => e.ecosystem === eco && e.from === n) ?? null,
        );
        expect(model).not.toBeNull();
        const allowed = new Set<string>();
        const reg = registryLink(row.ecosystem, row.name);
        if (reg !== null) allowed.add(reg);
        for (const h of row.hints) {
          const a = advisoryLink(h.sourceUrl);
          if (a !== null) allowed.add(a);
        }
        const repoHref = sourceRepoLink(repo);
        if (repoHref !== null) {
          allowed.add(repoHref);
          allowed.add(`${repoHref}/issues`);
        }
        for (const e of entries) allowed.add(e.source);

        const textUrls = row.hints.flatMap((h) => extractUrls(h.text));
        for (const href of hrefsOf(model!)) {
          expect(allowed.has(href)).toBe(true);
          expect(href.startsWith('https://')).toBe(true);
          // Short random texts (such as "/") are trivially substrings of any URL, so only texts of URL size count.
          for (const h of row.hints) if (h.text.length >= 8) expect(href.includes(h.text)).toBe(false);
          // A URL found only in text is never an href, unless a builder also produced it from a validated field.
          if (textUrls.includes(href)) {
            const viaBuilder =
              href === reg || href === repoHref || href === `${repoHref}/issues` ||
              row.hints.some((h) => advisoryLink(h.sourceUrl) === href) ||
              entries.some((e) => e.source === href);
            expect(viaBuilder).toBe(true);
          }
        }
      }),
      cfg(),
    );
  });

  it('RS-P7: a URL present only in hint text never appears as an href', () => {
    const url = 'https://osv.dev/vulnerability/TEXT-ONLY-1';
    for (const sourceUrl of [null, 'javascript:alert(1)', 'http://osv.dev/vulnerability/TEXT-ONLY-1']) {
      const row = makeRow({
        hints: [{ kind: 'advisory-notice', text: `see ${url} or [x](${url})`, sourceUrl, link: null } as ParsedHint],
      });
      const model = buildResurrectModel(row, { notes: [] } as unknown as ParsedScanResult, () => null);
      expect(model!.hints[0]!.link).toBeNull();
      expect(hrefsOf(model!)).not.toContain(url);
    }
  });
});
