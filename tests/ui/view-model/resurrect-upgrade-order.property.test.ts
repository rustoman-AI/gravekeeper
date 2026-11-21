// Feature: resurrect-upgrade, Property RU-P6: Section order is fixed and an upgrade suppresses the fallback
// Validates: Requirements 6.2, 6.11, 6.12
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isStrictVersion } from '../../../core/versions/strict-version';
import { buildResurrectModel, type CuratedLookup } from '../../../view-model/resurrect';
import type { ParsedScanResult, ResurrectModel } from '../../../view-model/types';
import { arbEcosystem, arbHint, makeRow, SLOT_CASES } from '../../support/arbitraries/resurrect';
import { cfg } from '../../support/fc-config';
import { buildScanResult } from '../../support/ui/scan-result-builder';

const emptyResult = buildScanResult([]) as unknown as ParsedScanResult;
const SECTIONS = ['urgent', 'upgrade', 'hints', 'suggestions', 'fallback'] as const;

const arbUpgradeVersion = fc.oneof(
  fc.constantFrom('2.0.0', '1.2.3', '3.1.4-beta.1', '1.0.post1', '0.9'),
  fc.constantFrom('1.2.3;rm', '1.2.3 4', '', '$(x)', '1.0+local', '`x`', 'a'.repeat(70)),
);
const arbUpgrade = fc.option(
  arbUpgradeVersion.map((version) => ({ version, basis: 'registry-default' as const })),
  { nil: null },
);

const arbScenario = fc
  .record({
    ecosystem: arbEcosystem,
    plotCase: fc.constantFrom(...SLOT_CASES),
    name: fc.constantFrom('request', 'got', 'bincode', 'a-b', 'x'),
    hints: fc.array(arbHint, { maxLength: 3 }),
    withCurated: fc.boolean(),
    upgrade: arbUpgrade,
  })
  .map((o) => {
    const row = { ...makeRow({ ecosystem: o.ecosystem, plotCase: o.plotCase, name: o.name, hints: o.hints }), upgrade: o.upgrade };
    const entry = {
      ecosystem: o.ecosystem,
      from: o.name,
      to: ['axios', 'node-fetch'],
      why: 'why',
      source: 'https://example.com/source',
      evidence: 'https://example.com/evidence',
    };
    const curated: CuratedLookup = (eco, n) => (o.withCurated && eco === o.ecosystem && n === o.name ? entry : null);
    return { row, curated, upgrade: o.upgrade, ecosystem: o.ecosystem };
  });

function present(m: ResurrectModel): string[] {
  const out: string[] = [];
  if (m.urgent !== null) out.push('urgent');
  if (m.upgrade !== null) out.push('upgrade');
  if (m.hints.length > 0) out.push('hints');
  if (m.suggestions.length > 0) out.push('suggestions');
  if (m.fallback !== null) out.push('fallback');
  return out;
}

describe('RU-P6 section order is fixed and an upgrade suppresses the fallback', () => {
  it('RU-P6 sections are a subsequence of urgent, upgrade, hints, suggestions, fallback, urgent only for restless rows', () => {
    fc.assert(
      fc.property(arbScenario, ({ row, curated }) => {
        const m = buildResurrectModel(row, emptyResult, curated) as ResurrectModel;
        expect(m).not.toBeNull();
        expect(m.urgent !== null).toBe(row.kind === 'restless');
        const got = present(m);
        const idx = got.map((k) => SECTIONS.indexOf(k as (typeof SECTIONS)[number]));
        for (let i = 1; i < idx.length; i += 1) expect(idx[i]!).toBeGreaterThan(idx[i - 1]!);
        if (row.kind === 'restless') expect(got[0]).toBe('urgent');
      }),
      cfg(),
    );
  });

  it('RU-P6 the upgrade is present iff the row carries an upgrade with a strict version', () => {
    fc.assert(
      fc.property(arbScenario, ({ row, curated, upgrade, ecosystem }) => {
        const m = buildResurrectModel(row, emptyResult, curated) as ResurrectModel;
        const expected = upgrade !== null && isStrictVersion(ecosystem, upgrade.version);
        expect(m.upgrade !== null).toBe(expected);
        if (m.upgrade !== null && upgrade !== null) expect(m.upgrade.version).toBe(upgrade.version);
      }),
      cfg(),
    );
  });

  it('RU-P6 the fallback is present iff there is no upgrade, no hint and no suggestion', () => {
    fc.assert(
      fc.property(arbScenario, ({ row, curated }) => {
        const m = buildResurrectModel(row, emptyResult, curated) as ResurrectModel;
        expect(m.fallback !== null).toBe(m.upgrade === null && m.hints.length === 0 && m.suggestions.length === 0);
      }),
      cfg(),
    );
  });
});
