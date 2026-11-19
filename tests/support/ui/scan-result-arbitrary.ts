// The Scan_Result arbitrary of design D10 (graveyard-ui R19.2). Built through the real core classify and summarize.
import * as fc from 'fast-check';
import type { Ecosystem, Scope, Severity } from '../../../core';
import type { ScanResult, SourceStatus } from '../../../pipeline/scan/types';
import {
  ALL_NOTE_CODES,
  ALL_SOURCES,
  PLOT_CASES,
  buildScanResult,
  legacyAdvisory,
  makeAdvisory,
  noteOf,
  type RowSpec,
  type VersionBasis,
} from './scan-result-builder';
import type { AdvisoryEntry } from '../../../pipeline/mapping';

export interface ScanResultArbitraryOptions {
  /** Up to 1000 rows instead of 300 (Requirement 8 properties). */
  readonly large?: boolean;
}

const MAX_ROWS = 300;
const MAX_ROWS_LARGE = 1000;

const arbSeverity: fc.Arbitrary<Severity | null> = fc.constantFrom<Severity | null>(null, 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

const arbAdvisory: fc.Arbitrary<AdvisoryEntry> = fc
  .tuple(
    fc.nat({ max: 20 }),
    fc.constantFrom<AdvisoryEntry['excluded'] | 'absent'>(null, 'informational', 'withdrawn', 'absent'),
    arbSeverity,
    fc.array(fc.constantFrom('CVE-2024-1', 'CVE-2024-2', 'GHSA-x'), { maxLength: 2 }),
  )
  .map(([n, excluded, severity, aliases]) =>
    excluded === 'absent' ? legacyAdvisory(`GHSA-${n}`) : makeAdvisory(`GHSA-${n}`, excluded, { severity, aliases }),
  );

const arbBasis: fc.Arbitrary<VersionBasis> = fc.constantFrom<VersionBasis>('pinned', 'resolved', 'default', null);

const arbRowKind = fc.constantFrom(...PLOT_CASES);

/** Names come from a small pool plus unique suffixes so Package_Keys repeat across scopes and manifests. */
const arbRow = (index: number, manifestCount: number): fc.Arbitrary<RowSpec> =>
  fc
    .tuple(
      arbRowKind,
      fc.constantFrom<Ecosystem>('npm', 'pypi', 'cargo'),
      fc.constantFrom<Scope>('runtime', 'dev', 'build', 'optional', 'peer'),
      fc.boolean(),
      fc.nat({ max: Math.max(manifestCount - 1, 0) }),
      arbBasis,
      arbSeverity,
      fc.array(arbAdvisory, { maxLength: 3 }),
      fc.option(fc.nat({ max: 3 }), { nil: undefined }),
    )
    .map(([kind, ecosystem, scope, repeat, manifest, versionBasis, severity, advisories, repeatOf]) => {
      const nameIndex = repeat && repeatOf !== undefined ? Math.max(index - repeatOf, 0) : index;
      return {
        name: `pkg-${nameIndex}`,
        ecosystem,
        scope,
        kind,
        versionBasis,
        manifestPath: `m${manifest}/package.json`,
        ...(severity === null ? {} : { severity }),
        ...(advisories.length > 0 ? { advisories } : {}),
      };
    });

const arbSources: fc.Arbitrary<Partial<Record<(typeof ALL_SOURCES)[number], SourceStatus>>> = fc
  .array(fc.constantFrom<SourceStatus>('ok', 'ok', 'partial', 'failed'), { minLength: 6, maxLength: 6 })
  .map((statuses) => Object.fromEntries(ALL_SOURCES.map((s, i) => [s, statuses[i]])));

/** A structurally valid Scan_Result with up to 300 rows (1000 with `large`). */
export function arbScanResult(options: ScanResultArbitraryOptions = {}): fc.Arbitrary<ScanResult> {
  const max = options.large === true ? MAX_ROWS_LARGE : MAX_ROWS;
  return fc
    .tuple(fc.integer({ min: 0, max }), fc.integer({ min: 1, max: 3 }))
    .chain(([count, manifestCount]) =>
      fc.tuple(
        fc.tuple(...Array.from({ length: count }, (_, i) => arbRow(i, manifestCount))),
        arbSources,
        fc.subarray([...ALL_NOTE_CODES]),
        fc.array(fc.record({ ecosystem: fc.constantFrom<Ecosystem>('npm', 'pypi', 'cargo'), name: fc.stringMatching(/^[a-z]{1,6}$/) }), {
          maxLength: 3,
        }),
        fc.constant(manifestCount),
      ),
    )
    .map(([rows, sources, codes, skipped, manifestCount]) =>
      buildScanResult(rows, {
        manifestPaths: Array.from({ length: manifestCount }, (_, i) => `m${i}/package.json`),
        sources,
        notes: codes.map((code) => noteOf(code)),
        skipped,
        cappedTotal: rows.length + skipped.length,
      }),
    );
}
