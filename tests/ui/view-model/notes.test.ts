import { describe, expect, it } from 'vitest';
import { buildNotesModel, NOTE_SECTIONS, OTHER_NOTES_TITLE } from '../../../view-model/notes';
import { parseScanResponse } from '../../../view-model/parse-response';
import type { ParsedScanResult } from '../../../view-model/types';
import { ALL_NOTE_CODES, buildScanResult, manyRows, noteOf } from '../../support/ui/scan-result-builder';
import type { ResultOptions } from '../../support/ui/scan-result-builder';

// Requirement 11, criterion 7: the section table, written out here and not read from the source.
const SPEC_SECTIONS: Record<string, readonly string[]> = {
  "The caretaker's own limits": [
    'github-token-missing',
    'github-budget-low',
    'dependency-cap-exceeded',
    'scan-deadline-reached',
    'source-partial',
    'source-failed',
    'batch-fallback',
  ],
  'Missing records': [
    'package-not-found',
    'no-default-version',
    'pin-not-found',
    'conflicting-pins',
    'range-unresolved',
    'advisory-details-incomplete',
    'osv-pagination-ignored',
    'maintainers-lower-bound',
  ],
  'Unverified links and special cases': [
    'source-repo-unverified',
    'informational-advisory-excluded',
    'unmaintained-advisory',
  ],
  'The plot map': ['tree-truncated', 'no-manifests', 'no-root-manifest', 'manifest-too-large', 'manifest-fetch-failed'],
};

const SECTION_ORDER = Object.keys(SPEC_SECTIONS);

const parse = (
  options: ResultOptions & { warnings?: Record<string, string[]> } = {},
  rows = manyRows(3),
): ParsedScanResult => {
  const raw = JSON.parse(JSON.stringify(buildScanResult(rows, options))) as {
    manifests: { path: string; warnings: string[] }[];
  };
  for (const m of raw.manifests) m.warnings = options.warnings?.[m.path] ?? [];
  const out = parseScanResponse(200, { get: () => null }, raw);
  if (out.kind !== 'result') throw new Error('result did not parse');
  return out.result;
};

describe('buildNotesModel sections (R11.7, R11.8)', () => {
  it('uses the four section titles in the order of the requirement', () => {
    expect(NOTE_SECTIONS.map((s) => s.title)).toEqual(SECTION_ORDER);
    expect(OTHER_NOTES_TITLE).toBe('Other notes');
  });

  for (const [title, codes] of Object.entries(SPEC_SECTIONS)) {
    for (const code of codes) {
      it(`puts ${code} in "${title}"`, () => {
        const model = buildNotesModel(parse({ notes: [noteOf(code as never)] }));
        expect(model.sections.map((s) => s.title)).toEqual([title]);
        expect(model.sections[0].groups).toHaveLength(1);
        expect(model.sections[0].groups[0].code).toBe(code);
        expect(model.sections[0].groups[0].messages).toEqual([`Synthetic note ${code}.`]);
      });
    }
  }

  it('covers every note code the pipeline emits, each in exactly one section', () => {
    const listed = Object.values(SPEC_SECTIONS).flat();
    expect([...listed].sort()).toEqual([...ALL_NOTE_CODES].sort());
  });

  it('puts an unknown code in "Other notes" with its plain message', () => {
    const unknown = { code: 'brand-new-code', message: 'Something new happened.' };
    const result = parse();
    const model = buildNotesModel({ ...result, notes: [unknown as never] });
    expect(model.sections).toHaveLength(1);
    expect(model.sections[0].title).toBe('Other notes');
    expect(model.sections[0].groups[0].messages).toEqual(['Something new happened.']);
    expect(model.sections[0].groups[0].count).toBe(1);
  });

  it('puts "Other notes" after the themed sections', () => {
    const result = parse({ notes: [noteOf('no-manifests'), noteOf('pin-not-found')] });
    const model = buildNotesModel({
      ...result,
      notes: [...result.notes, { code: 'zzz', message: 'odd' } as never],
    });
    expect(model.sections.map((s) => s.title)).toEqual(['Missing records', 'The plot map', 'Other notes']);
  });

  it('gives count 40 and previewCount 5 for 40 notes of one code', () => {
    const notes = Array.from({ length: 40 }, (_, i) => ({
      code: 'pin-not-found' as const,
      message: `Pin ${i} not found.`,
    }));
    const model = buildNotesModel(parse({ notes }));
    const group = model.sections[0].groups[0];
    expect(group.count).toBe(40);
    expect(group.messages).toHaveLength(40);
    expect(group.messages[0]).toBe('Pin 0 not found.');
    expect(group.previewCount).toBe(5);
  });

  it('shows all notes in the preview when a group has fewer than 5', () => {
    const model = buildNotesModel(parse({ notes: [noteOf('pin-not-found'), noteOf('pin-not-found')] }));
    expect(model.sections[0].groups[0].previewCount).toBe(2);
  });

  it('has no sections without notes', () => {
    expect(buildNotesModel(parse()).sections).toEqual([]);
  });
});

describe('buildNotesModel sources (R11.2, R11.3)', () => {
  it('lists the six sources in order with names', () => {
    const model = buildNotesModel(parse());
    expect(model.sources.map((s) => s.name)).toEqual(['github', 'depsdev', 'osv', 'npm', 'cratesio', 'pypi']);
    expect(model.sources.map((s) => s.label)).toEqual([
      'GitHub',
      'deps.dev',
      'OSV',
      'npm registry',
      'crates.io',
      'PyPI',
    ]);
  });

  it('gives the three statuses three distinct symbols', () => {
    const model = buildNotesModel(parse({ sources: { osv: 'partial', github: 'failed' } }));
    const by = (n: string) => model.sources.find((s) => s.name === n)!;
    expect(by('npm').status).toBe('ok');
    expect(by('osv').status).toBe('partial');
    expect(by('github').status).toBe('failed');
    const symbols = [by('npm').symbol, by('osv').symbol, by('github').symbol];
    expect(new Set(symbols).size).toBe(3);
    expect(symbols.every((s) => s.length > 0)).toBe(true);
  });

  it('shows the alert line for partial and failed sources only', () => {
    const model = buildNotesModel(parse({ sources: { osv: 'partial', depsdev: 'failed' } }));
    const by = (n: string) => model.sources.find((s) => s.name === n)!;
    expect(by('osv').alert).toBe('OSV: partial, some facts that depend on it are unknown');
    expect(by('depsdev').alert).toBe('deps.dev: failed, some facts that depend on it are unknown');
    expect(by('github').alert).toBeNull();
  });
});

describe('buildNotesModel cap banner (R11.9)', () => {
  it('is null when nothing was skipped', () => {
    expect(buildNotesModel(parse()).capBanner).toBeNull();
  });

  it('carries the cap note message and the skipped count', () => {
    const skipped = [
      { ecosystem: 'npm' as const, name: 'a' },
      { ecosystem: 'pypi' as const, name: 'b' },
    ];
    const model = buildNotesModel(parse({ skipped, notes: [noteOf('dependency-cap-exceeded')] }));
    expect(model.capBanner).toEqual({ message: 'Synthetic note dependency-cap-exceeded.', skippedCount: 2 });
  });
});

describe('buildNotesModel empty state (R11.10)', () => {
  it('shows the no-manifests message', () => {
    const model = buildNotesModel(
      parse({ manifestPaths: [], notes: [noteOf('no-manifests')], discovery: { candidates: [] } }, []),
    );
    expect(model.empty).toEqual({ message: 'Synthetic note no-manifests.' });
  });

  it('shows an empty state when manifests is empty without the note', () => {
    const model = buildNotesModel(parse({ manifestPaths: [], discovery: { candidates: [] } }, []));
    expect(model.empty).not.toBeNull();
    expect(model.empty!.message.length).toBeGreaterThan(0);
  });

  it('is null when manifests exist', () => {
    expect(buildNotesModel(parse()).empty).toBeNull();
  });
});

describe('buildNotesModel discovery note (R11.12)', () => {
  it('falls back to "The manifest list may be incomplete" without a matching note', () => {
    for (const flag of ['truncatedTree', 'depthLimited', 'countLimited'] as const) {
      const model = buildNotesModel(parse({ discovery: { [flag]: true } }));
      expect(model.discoveryNote).toBe('The manifest list may be incomplete');
    }
  });

  it('uses the plain tree-truncated note when present', () => {
    const model = buildNotesModel(parse({ discovery: { truncatedTree: true }, notes: [noteOf('tree-truncated')] }));
    expect(model.discoveryNote).toBe('Synthetic note tree-truncated.');
  });

  it('is null when discovery is complete', () => {
    expect(buildNotesModel(parse()).discoveryNote).toBeNull();
  });
});

describe('buildNotesModel manifest warnings (R11.13)', () => {
  it('lists the warnings of each manifest under its path, and skips clean manifests', () => {
    const model = buildNotesModel(
      parse({
        manifestPaths: ['package.json', 'a/package.json'],
        warnings: { 'a/package.json': ['first warning', 'second warning'] },
      }),
    );
    expect(model.manifestWarnings).toEqual([
      { path: 'a/package.json', warnings: ['first warning', 'second warning'] },
    ]);
  });
});

describe('buildNotesModel picker (R11.11)', () => {
  it('is null without the no-root-manifest note', () => {
    expect(buildNotesModel(parse()).picker).toBeNull();
  });

  it('lists the discovery candidates when the note is present', () => {
    const model = buildNotesModel(
      parse({
        manifestPaths: ['a/package.json', 'b/Cargo.toml'],
        notes: [noteOf('no-root-manifest')],
      }),
    );
    expect(model.picker).not.toBeNull();
    expect(model.picker!.candidates.map((c) => c.path)).toEqual(['a/package.json', 'b/Cargo.toml']);
    expect(model.picker!.candidates.map((c) => c.format)).toEqual(['package.json', 'Cargo.toml']);
    expect(model.picker!.scanUrl).toBeNull();
  });
});
