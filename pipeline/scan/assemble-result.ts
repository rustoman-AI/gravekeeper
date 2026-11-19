// Requirement 13.5, 13.9, 13.14, 13.16, 16.5, 16.12, 17.7, 18.1, 18.2, 18.8, 18.9, 18.12
// Result assembly: one code path for the normal ending and for the margin fallback.
// Relative path: the alias `@/` is not resolved at runtime by Vitest, so values come in relatively.
import { classify, summarize } from '../../core';
import type { AssessedDependency, Dependency, ManifestFormat, RawHealthFacts } from '@/core';
import { guard } from '../internal/safe';
import { err, ok } from '../internal/result';
import type { Result } from '../internal/result';
import { assembleFacts } from '../mapping/assemble';
import { compareCodePoints } from '../mapping/compare-code-points';
import type { AssembledFacts, DiscoveryResult, RawTargetInputs, TargetNote } from '../mapping';
import { renderErrorMessage } from './messages';
import {
  conflictingPinsNote,
  dependencyCapExceededNote,
  informationalAdvisoryExcludedNote,
  advisoryDetailsIncompleteNote,
  maintainersLowerBoundNote,
  makeSourceNote,
  noDefaultVersionNote,
  osvPaginationIgnoredNote,
  packageNotFoundNote,
  pinNotFoundNote,
  scanDeadlineReachedNote,
  unmaintainedAdvisoryNote,
} from './notes';
import { buildSourceNotes, computeSourceStatuses } from './source-status';
import type { TargetPlan } from './targets';
import { targetKey } from './targets';
import type {
  LedgerEntry,
  LookupTarget,
  ScanDependency,
  ScanError,
  ScanInput,
  ScanNote,
  ScanProgress,
  ScanRepo,
  ScanResult,
} from './types';

/** One fetched and parsed manifest. `dependencies` are in core Dependency_Order. */
export interface AssemblyManifest {
  readonly path: string;
  readonly format: ManifestFormat;
  readonly warnings: readonly string[];
  readonly dependencies: readonly Dependency[];
}

/**
 * Everything the assembler needs once discovery is complete. Raw inputs are keyed by
 * `targetKey`; a planned target without an entry is assembled from all-`unavailable` inputs.
 */
export interface AssemblySnapshot {
  /** Canonical identity (R18.1). */
  readonly repo: ScanRepo;
  readonly discovery: DiscoveryResult;
  readonly manifests: readonly AssemblyManifest[];
  /** `plan.targets` are looked up, `plan.capped` is copied into the result. */
  readonly plan: TargetPlan;
  readonly raw: ReadonlyMap<string, RawTargetInputs>;
  /** Notes of the stages (discovery, manifests, tokens, budget, batch fallback, source repo, ...). */
  readonly stageNotes: readonly ScanNote[];
}

export interface AssembleInput extends AssemblySnapshot {
  readonly asOf: string;
  readonly ledger: readonly LedgerEntry[];
  /** True when the scan deadline was reached (adds exactly one `scan-deadline-reached`). */
  readonly deadlineReached: boolean;
}

/** A `ScanProgress` that also carries the assembly snapshot, fed by the stages as they finish. */
export interface PartialProgress extends ScanProgress {
  readonly snapshot?: AssemblySnapshot | null;
}

const NULL_FACTS = (): RawHealthFacts => ({
  daysSinceLastRelease: null,
  daysSinceLastCommit: null,
  archived: null,
  deprecated: null,
  openVulnerabilityCount: null,
  maxSeverity: null,
  maintainerCount: null,
});

const NO_SELECTION: AssembledFacts['selection'] = { selected: null, basis: null, notes: [] };

function unavailableInputs(target: LookupTarget, webHost: string): RawTargetInputs {
  return {
    ecosystem: target.ecosystem,
    name: target.name,
    versionSpecs: target.versionSpecs,
    depsdevPackage: { state: 'unavailable' },
    npmLatest: { state: 'unavailable' },
    maintainers: { state: 'unavailable' },
    osv: { queryResult: 'unavailable', advisories: new Map(), unfetchedIds: [] },
    repository: 'no-source-repo',
    webHost,
  };
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** TargetNote to ScanNote through the note builders (message text lives in messages.ts). */
function toScanNote(note: TargetNote): ScanNote {
  const d = note.details;
  const eco = d['ecosystem'] as 'npm' | 'pypi' | 'cargo';
  const name = str(d['name']);
  switch (note.code) {
    case 'package-not-found':
      return packageNotFoundNote(eco, name);
    case 'pin-not-found':
      return pinNotFoundNote(eco, name, str(d['pinned']));
    case 'no-default-version':
      return noDefaultVersionNote(eco, name);
    case 'conflicting-pins':
      return conflictingPinsNote(eco, name, strings(d['pins']));
    case 'informational-advisory-excluded':
      return informationalAdvisoryExcludedNote(eco, name, strings(d['ids']));
    case 'unmaintained-advisory':
      return unmaintainedAdvisoryNote(eco, name, strings(d['ids']));
    case 'advisory-details-incomplete':
      return advisoryDetailsIncompleteNote(eco, name, strings(d['ids']));
    case 'osv-pagination-ignored':
      return osvPaginationIgnoredNote(eco, name);
    case 'maintainers-lower-bound':
      return maintainersLowerBoundNote(eco, name);
  }
}

interface TargetOutcome {
  readonly facts: RawHealthFacts;
  readonly advisories: AssembledFacts['advisories'];
  readonly selection: AssembledFacts['selection'];
  readonly notes: readonly ScanNote[];
}

/** R13.14, R17.7: a throwing assembly turns the facts of that target all-null; the scan goes on. */
function assembleTarget(raw: RawTargetInputs, asOf: string): TargetOutcome {
  return guard(
    (): TargetOutcome => {
      const assembled = assembleFacts(raw, asOf);
      return {
        facts: assembled.facts,
        advisories: assembled.advisories,
        selection: assembled.selection,
        notes: assembled.notes.map(toScanNote),
      };
    },
    (): TargetOutcome => ({ facts: NULL_FACTS(), advisories: [], selection: NO_SELECTION, notes: [] }),
  );
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort(compareCodePoints);
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** R18.5: ascending `code`, then ascending canonical `details` text, both by code point. */
function sortNotes(notes: readonly ScanNote[]): ScanNote[] {
  return notes
    .map((note) => ({
      note,
      text: note.details === undefined ? '' : canonicalJson(note.details),
    }))
    .sort((a, b) => compareCodePoints(a.note.code, b.note.code) || compareCodePoints(a.text, b.text))
    .map((entry) => entry.note);
}

/** R18.1 to R18.12. Pure; the margin path and the normal ending both end here. */
export function assembleResult(input: AssembleInput): ScanResult {
  const { repo, plan, asOf } = input;
  const outcomes = new Map<string, TargetOutcome>();
  for (const target of plan.targets) {
    const key = targetKey(target.ecosystem, target.name);
    const raw = input.raw.get(key) ?? unavailableInputs(target, repo.host);
    // The planned target is authoritative for identity and version specs.
    outcomes.set(key, assembleTarget({ ...raw, ecosystem: target.ecosystem, name: target.name, versionSpecs: target.versionSpecs }, asOf));
  }
  // Classification once per target (R13.5, R13.9).
  const classified = new Map<string, ReturnType<typeof classify>>();
  for (const [key, outcome] of outcomes) classified.set(key, classify(outcome.facts));

  const manifests = [...input.manifests].sort((a, b) => compareCodePoints(a.path, b.path));
  const dependencies: ScanDependency[] = [];
  const assessed: AssessedDependency[] = [];
  for (const manifest of manifests) {
    for (const dependency of manifest.dependencies) {
      const key =
        dependency.sourceKind === 'registry' ? targetKey(dependency.ecosystem, dependency.name) : null;
      const outcome = key === null ? undefined : outcomes.get(key);
      if (key === null || outcome === undefined) {
        // git, path, or skipped by the cap (R13.16, R18.2): unassessed.
        dependencies.push({
          dependency,
          manifestPath: manifest.path,
          lookupVersion: null,
          versionBasis: null,
          facts: NULL_FACTS(),
          advisories: [],
        });
        assessed.push({ dependency, classification: null });
        continue;
      }
      const { selected, basis } = outcome.selection;
      const both = selected !== null && basis !== null; // R18.12
      dependencies.push({
        dependency,
        manifestPath: manifest.path,
        lookupVersion: both ? selected : null,
        versionBasis: both ? basis : null,
        facts: outcome.facts,
        advisories: outcome.advisories,
      });
      assessed.push({ dependency, classification: classified.get(key) ?? null });
    }
  }

  const osvTruncated = [...input.raw.values()].some(
    (r) => r.osv.queryResult !== 'unavailable' && r.osv.queryResult.kind === 'ids' && r.osv.queryResult.truncated,
  );
  const options = { osvTruncated };
  const sources = computeSourceStatuses(input.ledger, options);

  const notes: ScanNote[] = input.stageNotes.filter((n) => n.code !== 'scan-deadline-reached');
  for (const outcome of outcomes.values()) notes.push(...outcome.notes);
  notes.push(...buildSourceNotes(input.ledger, makeSourceNote, options));
  if (plan.capped.skipped.length > 0) notes.push(dependencyCapExceededNote(plan.capped));
  if (input.deadlineReached) notes.push(scanDeadlineReachedNote());

  return {
    ok: true,
    asOf,
    repo,
    discovery: input.discovery,
    manifests: manifests.map((m) => ({ path: m.path, format: m.format, warnings: m.warnings })),
    dependencies,
    assessed,
    summary: summarize(assessed),
    sources,
    capped: plan.capped,
    notes: sortNotes(notes),
  };
}

/**
 * Margin fallback: the same assembly fed from a `ScanProgress`. `deadline-exceeded` when
 * discovery is incomplete (no Commit_SHA and selection, or no snapshot yet). Missing target
 * inputs are `unavailable`; the deadline note is always added (R16.5).
 */
export function assemblePartial(
  progress: PartialProgress,
  input: Pick<ScanInput, 'asOf' | 'repo'>,
): Result<ScanResult, ScanError> {
  const snapshot = progress.snapshot ?? null;
  if (progress.discovery === null || snapshot === null) {
    return err({
      code: 'deadline-exceeded',
      message: renderErrorMessage('deadline-exceeded', undefined, input.repo.host),
    });
  }
  return ok(
    assembleResult({
      ...snapshot,
      asOf: input.asOf,
      ledger: [...progress.ledger],
      deadlineReached: true,
    }),
  );
}
