// Feature: resurrect-upgrade, Property RU-P8: The curated loader enforces the six-key schema and links only the human page
// Validates: Requirements 7.1, 7.2, 7.3, 7.6, 7.7
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Ecosystem } from '../../../core';
import { buildResurrectModel, type CuratedLookup } from '../../../view-model/resurrect';
import { loadCurated } from '../../../view-model/resurrections';
import type { ParsedScanResult } from '../../../view-model/types';
import { arbEcosystem, arbHint, makeRow } from '../../support/arbitraries/resurrect';
import { cfg } from '../../support/fc-config';
import { buildScanResult } from '../../support/ui/scan-result-builder';

type Mutation =
  | 'none'
  | 'missing-evidence'
  | 'missing-source'
  | 'extra-key'
  | 'evidence-not-string'
  | 'source-not-string'
  | 'evidence-http'
  | 'source-http'
  | 'evidence-credentials'
  | 'source-credentials'
  | 'source-machine';

const MUTATIONS: readonly Mutation[] = [
  'none',
  'none',
  'none',
  'missing-evidence',
  'missing-source',
  'extra-key',
  'evidence-not-string',
  'source-not-string',
  'evidence-http',
  'source-http',
  'evidence-credentials',
  'source-credentials',
  'source-machine',
];

const SOURCES: readonly string[] = [
  'https://example.com/source',
  'https://www.npmjs.com/package/some-pkg',
  'https://github.com/example/project/issues/7',
];
const EVIDENCES: readonly string[] = [
  'https://example.org/evidence',
  'https://registry.npmjs.org/some-pkg/latest',
  'https://pypi.org/pypi/some-pkg/json',
  'https://crates.io/api/v1/crates/some-pkg',
];
const MACHINE_SOURCES: readonly string[] = [
  'https://registry.npmjs.org/some-pkg/latest',
  'https://api.osv.dev/v1/vulns/GHSA-aaaa-bbbb-cccc',
  'https://api.deps.dev/v3/systems/npm/packages/some-pkg',
  'https://pypi.org/pypi/some-pkg/json',
  'https://crates.io/api/v1/crates/some-pkg',
];

interface Raw {
  readonly mutation: Mutation;
  readonly ecosystem: Ecosystem;
  readonly source: string;
  readonly evidence: string;
  readonly machine: string;
  readonly junk: unknown;
}

const arbRaw: fc.Arbitrary<Raw> = fc.record({
  mutation: fc.constantFrom(...MUTATIONS),
  ecosystem: arbEcosystem,
  source: fc.constantFrom(...SOURCES),
  evidence: fc.constantFrom(...EVIDENCES),
  machine: fc.constantFrom(...MACHINE_SOURCES),
  junk: fc.oneof(fc.constant(null), fc.integer(), fc.boolean(), fc.constant([]), fc.constant({})),
});

/** The raw object for index `i`; `from` is unique per index, so no entry is dropped as a duplicate. */
function rawOf(r: Raw, i: number): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ecosystem: r.ecosystem,
    from: `pkg${i}`,
    to: ['got', 'axios'],
    why: 'The maintainers point to alternatives.',
    source: r.source,
    evidence: r.evidence,
  };
  switch (r.mutation) {
    case 'none':
      return base;
    case 'missing-evidence':
      delete base['evidence'];
      return base;
    case 'missing-source':
      delete base['source'];
      return base;
    case 'extra-key':
      return { ...base, note: 'x' };
    case 'evidence-not-string':
      return { ...base, evidence: r.junk };
    case 'source-not-string':
      return { ...base, source: r.junk };
    case 'evidence-http':
      return { ...base, evidence: 'http://example.org/evidence' };
    case 'source-http':
      return { ...base, source: 'http://example.com/source' };
    case 'evidence-credentials':
      return { ...base, evidence: 'https://user:pw@example.org/evidence' };
    case 'source-credentials':
      return { ...base, source: 'https://user@example.com/source' };
    case 'source-machine':
      return { ...base, source: r.machine };
  }
}

const arbScenario = fc.record({
  raws: fc.array(arbRaw, { maxLength: 8 }),
  hints: fc.array(arbHint, { maxLength: 3 }),
});

describe('RU-P8 curated loader schema and the linked page', () => {
  it('RU-P8 keeps exactly the valid six-key entries, and the model links only the source, never a different evidence', () => {
    fc.assert(
      fc.property(arbScenario, ({ raws, hints }) => {
        const entries = raws.map(rawOf);
        const loaded = loadCurated({ entries });

        // Loader: exactly the unmutated entries survive, in order; never throws.
        const expected = entries.filter((_, i) => raws[i]!.mutation === 'none');
        expect(loaded.map((e) => e.from)).toEqual(expected.map((e) => e['from']));
        for (const e of loaded) {
          expect(Object.keys(e).sort()).toEqual(['ecosystem', 'evidence', 'from', 'source', 'to', 'why']);
          expect(e.source.startsWith('https://')).toBe(true);
          expect(e.evidence.startsWith('https://')).toBe(true);
          expect(MACHINE_SOURCES).not.toContain(e.source);
        }

        // Model: for every kept entry, the suggestion link is the source and no href is a differing evidence.
        const result = buildScanResult([]) as unknown as ParsedScanResult;
        for (const entry of loaded) {
          const curated: CuratedLookup = (eco, name) => (eco === entry.ecosystem && name === entry.from ? entry : null);
          const row = makeRow({ name: entry.from, ecosystem: entry.ecosystem, plotCase: 'buried', hints });
          const model = buildResurrectModel(row, result, curated);
          expect(model).not.toBeNull();
          expect(model!.suggestions).toHaveLength(1);
          const hrefs: string[] = [];
          for (const h of model!.hints) if (h.link !== null) hrefs.push(h.link.href);
          for (const s of model!.suggestions) hrefs.push(s.source.href);
          for (const l of model!.fallback?.links ?? []) hrefs.push(l.href);
          expect(model!.suggestions[0]!.source.href).toBe(entry.source);
          if (entry.evidence !== entry.source) expect(hrefs).not.toContain(entry.evidence);
        }
      }),
      cfg(),
    );
  });
});
