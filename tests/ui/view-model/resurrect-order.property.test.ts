// Feature: resurrect, Property RS-P11: Section order is fixed and the fallback is exclusive
// Validates: Requirements 9.3, 9.4, 9.6, 9.7, 9.11
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildResurrectModel, type CuratedLookup } from '../../../view-model/resurrect';
import type { PackageRow, ParsedScanResult, ResurrectModel } from '../../../view-model/types';
import { arbEcosystem, arbHint, makeRow, SLOT_CASES } from '../../support/arbitraries/resurrect';
import { cfg } from '../../support/fc-config';
import { buildScanResult } from '../../support/ui/scan-result-builder';

const emptyResult = buildScanResult([]) as unknown as ParsedScanResult;
const SECTIONS = ['urgent', 'hints', 'suggestions', 'fallback'] as const;

type CuratedKind = 'none' | 'valid' | 'all-self' | 'all-invalid';
const VALID_TO = ['axios', 'node-fetch'];
const INVALID_TO = ['Bad Name!', '', '../x', 'a b'];

const arbScenario = fc
  .record({
    ecosystem: arbEcosystem,
    plotCase: fc.constantFrom(...SLOT_CASES),
    name: fc.constantFrom('request', 'got', 'bincode', 'a-b', 'x'),
    hints: fc.array(arbHint, { minLength: 0, maxLength: 3 }),
    curatedKind: fc.constantFrom<CuratedKind>('none', 'valid', 'all-self', 'all-invalid'),
    withSelf: fc.boolean(),
    openVulnerabilityCount: fc.option(fc.integer({ min: -2, max: 50 }), { nil: null }),
  })
  .map((o) => {
    const row = makeRow({
      ecosystem: o.ecosystem,
      plotCase: o.plotCase,
      name: o.name,
      hints: o.hints,
      openVulnerabilityCount: o.openVulnerabilityCount,
    });
    const to =
      o.curatedKind === 'valid'
        ? o.withSelf
          ? [o.name, ...VALID_TO]
          : VALID_TO
        : o.curatedKind === 'all-self'
          ? [o.name]
          : INVALID_TO;
    const entry = { ecosystem: o.ecosystem, from: o.name, to, why: 'why', source: 'https://example.com/source', evidence: 'https://example.com/evidence' };
    const curated: CuratedLookup = (eco, n) =>
      o.curatedKind !== 'none' && eco === o.ecosystem && n === o.name ? entry : null;
    return { row, curated, curatedKind: o.curatedKind, plotCase: o.plotCase, hintCount: o.hints.length, names: to };
  });

function present(model: ResurrectModel): string[] {
  return Object.keys(model).filter((k) => {
    if (k === 'urgent') return model.urgent !== null;
    if (k === 'hints') return model.hints.length > 0;
    if (k === 'suggestions') return model.suggestions.length > 0;
    if (k === 'fallback') return model.fallback !== null;
    return false;
  });
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isRestless = (row: PackageRow): boolean => row.kind === 'restless';

describe('RS-P11 section order is fixed and the fallback is exclusive', () => {
  it('RS-P11 urgent exists iff the row is restless, and sections follow urgent, hints, suggestions, fallback', () => {
    fc.assert(
      fc.property(arbScenario, ({ row, curated, hintCount, curatedKind }) => {
        const model = buildResurrectModel(row, emptyResult, curated);
        expect(model).not.toBeNull();
        const m = model as ResurrectModel;
        expect(m.urgent !== null).toBe(isRestless(row));
        expect(m.hints.length).toBe(hintCount);
        expect(m.suggestions.length).toBe(curatedKind === 'valid' ? 1 : 0);
        const got = present(m);
        const indexes = got.map((k) => SECTIONS.indexOf(k as (typeof SECTIONS)[number]));
        expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
        if (isRestless(row)) expect(got[0]).toBe('urgent');
        const hintsAt = got.indexOf('hints');
        const suggestionsAt = got.indexOf('suggestions');
        if (hintsAt >= 0 && suggestionsAt >= 0) expect(hintsAt).toBeLessThan(suggestionsAt);
      }),
      cfg(),
    );
  });

  it('RS-P11 the fallback is present iff there are no hints and no suggestions', () => {
    fc.assert(
      fc.property(arbScenario, ({ row, curated }) => {
        const m = buildResurrectModel(row, emptyResult, curated) as ResurrectModel;
        expect(m.fallback !== null).toBe(m.hints.length === 0 && m.suggestions.length === 0);
      }),
      cfg(),
    );
  });

  it('RS-P11 the fallback is forgotten-type for forgotten rows and buried-type otherwise', () => {
    fc.assert(
      fc.property(arbScenario, ({ row, curated, plotCase }) => {
        const m = buildResurrectModel(row, emptyResult, curated) as ResurrectModel;
        if (m.fallback === null) return;
        expect(m.fallback.kind).toBe(plotCase === 'forgotten' ? 'forgotten' : 'buried');
      }),
      cfg(),
    );
  });

  it('RS-P11 the fallback names no package: no code segments, no alternatives, no curated name', () => {
    fc.assert(
      fc.property(arbScenario, ({ row, curated, names }) => {
        const m = buildResurrectModel(row, emptyResult, curated) as ResurrectModel;
        if (m.fallback === null) return;
        expect(Object.keys(m.fallback).sort()).toEqual(['kind', 'links', 'paragraph']);
        const json = JSON.stringify(m.fallback);
        for (const forbidden of ['"alternatives"', '"blocks"', '"lead"', '"code"']) {
          expect(json).not.toContain(forbidden);
        }
        for (const name of names.filter((n) => n.length > 0)) {
          expect(m.fallback.paragraph).not.toMatch(new RegExp(`(^|[^A-Za-z0-9_-])${escape(name)}($|[^A-Za-z0-9_-])`));
        }
      }),
      cfg(),
    );
  });

  it('RS-P11 every combination of hint count and curated kind occurs for each slot case', () => {
    for (const plotCase of SLOT_CASES) {
      for (const curatedKind of ['none', 'valid', 'all-self', 'all-invalid'] as const) {
        for (let n = 0; n <= 3; n += 1) {
          const hints = Array.from({ length: n }, () => ({
            kind: 'deprecation-notice' as const,
            text: 't',
            sourceUrl: null,
            link: null,
          }));
          const row = makeRow({ plotCase, hints });
          const to = curatedKind === 'valid' ? VALID_TO : curatedKind === 'all-self' ? ['request'] : INVALID_TO;
          const entry = { ecosystem: 'npm' as const, from: 'request', to, why: 'w', source: 'https://example.com/s', evidence: 'https://example.com/evidence' };
          const m = buildResurrectModel(row, emptyResult, () => (curatedKind === 'none' ? null : entry)) as ResurrectModel;
          expect(m.fallback !== null).toBe(n === 0 && curatedKind !== 'valid');
        }
      }
    }
  });
});
