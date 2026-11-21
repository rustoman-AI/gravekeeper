import { describe, expect, it } from 'vitest';
import { buildResurrectModel } from '../../../view-model/resurrect';
import type { CuratedEntry } from '../../../view-model/resurrections';
import type { PackageRow, ParsedHint, ParsedScanResult } from '../../../view-model/types';
import { makeRow } from '../../support/arbitraries/resurrect';
import { buildScanResult } from '../../support/ui/scan-result-builder';

// resurrect-upgrade Requirements 6.1, 6.2, 6.11, 6.12, 6.13: the Upgrade_Section in the model.
const result = buildScanResult([]) as unknown as ParsedScanResult;
const SENTENCE = 'The registry lists this newer version as its default and does not mark it deprecated.';
const NOTICE: ParsedHint = {
  kind: 'deprecation-notice',
  text: 'Please use uuid@11 or later.',
  sourceUrl: null,
  link: null,
};

function withUpgrade(row: PackageRow, version: string | null): PackageRow {
  return { ...row, upgrade: version === null ? null : { version, basis: 'registry-default' } };
}

describe('buildResurrectModel upgrade section', () => {
  it('uuid-like row: upgrade and hint, no fallback, no urgent sentence', () => {
    const row = withUpgrade(makeRow({ name: 'uuid', plotCase: 'buried-deprecated', hints: [NOTICE] }), '11.1.0');
    const m = buildResurrectModel(row, result, () => null)!;
    expect(m.urgent).toBeNull();
    expect(m.upgrade).toMatchObject({
      label: 'From the registry',
      title: 'Upgrade to 11.1.0',
      sentence: SENTENCE,
      version: '11.1.0',
    });
    expect(m.upgrade!.blocks.map((b) => b.lines)).toEqual([['npm install uuid@11.1.0']]);
    expect(m.upgrade!.blocks[0]!.copyName).toBe('uuid');
    expect(m.hints).toHaveLength(1);
    expect(m.fallback).toBeNull();
  });

  it('restless row: urgent sentence plus upgrade', () => {
    const row = withUpgrade(makeRow({ name: 'uuid', plotCase: 'restless-deprecated', openVulnerabilityCount: 2 }), '11.1.0');
    const m = buildResurrectModel(row, result, () => null)!;
    expect(m.urgent).toContain('2 open vulnerabilities');
    expect(m.upgrade?.title).toBe('Upgrade to 11.1.0');
    expect(m.fallback).toBeNull();
  });

  it('upgrade with a curated entry: both are shown', () => {
    const entry: CuratedEntry = {
      ecosystem: 'npm',
      from: 'request',
      to: ['got'],
      why: 'Unmaintained.',
      source: 'https://example.com/why',
      evidence: 'https://example.com/evidence',
    };
    const row = withUpgrade(makeRow({ name: 'request', plotCase: 'buried-deprecated' }), '3.0.0');
    const m = buildResurrectModel(row, result, () => entry)!;
    expect(m.upgrade?.title).toBe('Upgrade to 3.0.0');
    expect(m.suggestions).toHaveLength(1);
    expect(m.suggestions[0]!.alternatives.map((a) => a.name)).toEqual(['got']);
    expect(m.fallback).toBeNull();
  });

  it('upgrade with a non-command-safe name keeps the title and sentence but has no blocks', () => {
    const row = withUpgrade(makeRow({ name: 'bad name;x', plotCase: 'buried-deprecated' }), '1.2.3');
    const m = buildResurrectModel(row, result, () => null)!;
    expect(m.upgrade?.title).toBe('Upgrade to 1.2.3');
    expect(m.upgrade?.sentence).toBe(SENTENCE);
    expect(m.upgrade?.blocks).toEqual([]);
    expect(m.fallback).toBeNull();
  });

  it('upgrade with a non-strict version gives no section and shows the fallback', () => {
    const row = withUpgrade(makeRow({ name: 'uuid', plotCase: 'buried-deprecated' }), '1.2.3;rm');
    const m = buildResurrectModel(row, result, () => null)!;
    expect(m.upgrade).toBeNull();
    expect(m.fallback).not.toBeNull();
  });

  it('har-validator-like row: no upgrade, hint, no fallback', () => {
    const row = withUpgrade(makeRow({ name: 'har-validator', plotCase: 'buried-deprecated', hints: [NOTICE] }), null);
    const m = buildResurrectModel(row, result, () => null)!;
    expect(m.upgrade).toBeNull();
    expect(m.hints).toHaveLength(1);
    expect(m.fallback).toBeNull();
  });
});
