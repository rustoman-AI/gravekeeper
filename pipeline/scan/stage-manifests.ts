// Requirement 4.6, 4.8, 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12
// S2 selection and S3 manifest fetch and parse. Relative `core` import: Vitest has no `@/` alias at runtime.
import { CONSTANTS, detectPyprojectTool, parseManifest } from '../../core';
import { err, ok } from '../internal/result';
import type { Result } from '../internal/result';
import { compareCodePoints } from '../mapping/compare-code-points';
import { readOwn } from '../mapping/read-own';
import { selectManifests } from '../mapping';
import type { SelectionLimits } from '../mapping';
import type { GithubSource, RequestContext } from '../ports';
import type { GithubBudget } from './github-budget';
import { renderErrorMessage } from './messages';
import {
  manifestFetchFailedNote,
  manifestTooLargeNote,
  noManifestsNote,
  noRootManifestNote,
  treeTruncatedNote,
} from './notes';
import type { UnitRunner } from './run-unit';
import type { AssemblyManifest } from './assemble-result';
import type { DiscoveryStageOutput } from './stage-discovery';
import type { ScanError, ScanNote } from './types';

/** Work_Unit key of the manifest fetch of `path`. */
export const manifestUnitKey = (path: string): string => `github:manifest:${path}`;

export interface ManifestStageInput {
  readonly github: GithubSource;
  readonly runner: UnitRunner;
  /** Passed as the gate; raw-host requests ignore it, GHES blobs requests honour it (R14.3, R14.11). */
  readonly budget: GithubBudget;
  readonly ctx: RequestContext;
  readonly discovered: DiscoveryStageOutput;
  /** The `manifests` of the request; `[]` when omitted. */
  readonly requested: readonly string[];
  readonly limits: SelectionLimits;
  /** Web_Host of the validated configuration, used by the message renderer. */
  readonly webHost: string;
}

export interface ManifestStageOutput {
  /** Selected paths in ascending code point order (the Scan_Cache key input; includes skipped and failed ones). */
  readonly selected: readonly string[];
  /** Fetched and parsed manifests, in fetch order (ascending path). */
  readonly manifests: readonly AssemblyManifest[];
  /** tree-truncated, no-manifests, no-root-manifest, manifest-too-large, manifest-fetch-failed. */
  readonly notes: readonly ScanNote[];
}

/** S2 only: selection and its notes, with no request sent. */
export interface ManifestSelection {
  readonly selected: readonly string[];
  readonly notes: readonly ScanNote[];
  /** Byte `size` per candidate path (null when not an integer). */
  readonly sizes: ReadonlyMap<string, number | null>;
}

function selectionError(
  error:
    | { code: 'too-many-manifests'; details: { limit: number; candidates: readonly string[] } }
    | { code: 'manifest-not-found'; details: { path: string; candidates: readonly string[] } },
  webHost: string,
): ScanError {
  const message = renderErrorMessage(error.code, error.details, webHost);
  return { code: error.code, message, details: error.details } as ScanError;
}

/** Tree paths and blob shas of the tree body, for `manifest-not-found` and GHES blobs requests. */
function readTreeBlobs(treeBody: unknown): Map<string, string | null> {
  const blobs = new Map<string, string | null>();
  const tree = readOwn(treeBody, 'tree');
  if (!Array.isArray(tree)) return blobs;
  for (let i = 0; i < tree.length; i += 1) {
    let entry: unknown;
    try {
      entry = tree[i];
    } catch {
      continue;
    }
    const path = readOwn(entry, 'path');
    if (typeof path !== 'string' || readOwn(entry, 'type') !== 'blob') continue;
    const sha = readOwn(entry, 'sha');
    // First entry of a path wins, so the result does not depend on later duplicates.
    if (!blobs.has(path)) blobs.set(path, typeof sha === 'string' && sha !== '' ? sha : null);
  }
  return blobs;
}

function readSize(entry: unknown): number | null {
  const size = readOwn(entry, 'size');
  return typeof size === 'number' && Number.isInteger(size) && size >= 0 ? size : null;
}

/** Byte sizes of every blob in the tree, first entry per path. */
function readTreeSizes(treeBody: unknown): Map<string, number | null> {
  const sizes = new Map<string, number | null>();
  const tree = readOwn(treeBody, 'tree');
  if (!Array.isArray(tree)) return sizes;
  for (let i = 0; i < tree.length; i += 1) {
    let entry: unknown;
    try {
      entry = tree[i];
    } catch {
      continue;
    }
    const path = readOwn(entry, 'path');
    if (typeof path !== 'string' || readOwn(entry, 'type') !== 'blob') continue;
    if (!sizes.has(path)) sizes.set(path, readSize(entry));
  }
  return sizes;
}

/**
 * S2: selection from the discovery result (R5.1 to R5.5) and the discovery notes
 * (R4.6 `tree-truncated`, R4.8 `no-manifests`, R5.2 `no-root-manifest`).
 * No request is sent. Errors are typed Scan_Errors.
 */
export function selectManifestStage(
  input: Pick<ManifestStageInput, 'discovered' | 'requested' | 'limits' | 'webHost'>,
): Result<ManifestSelection, ScanError> {
  const { discovered, requested, limits, webHost } = input;
  const { discovery, treeBody } = discovered;
  const blobs = readTreeBlobs(treeBody);
  const sizes = readTreeSizes(treeBody);
  // R5.5 checks against the tree, not against the candidates (skipped and deep paths are accepted).
  const selection = selectManifests(
    discovery.candidates,
    requested,
    new Set(blobs.keys()),
    limits,
  );
  if (!selection.ok) return err(selectionError(selection.error, webHost));

  const notes: ScanNote[] = [];
  if (discovery.truncatedTree) notes.push(treeTruncatedNote());
  if (discovery.candidates.length === 0 && requested.length === 0) {
    notes.push(noManifestsNote()); // R4.8
  } else if (selection.value.noRootManifest) {
    notes.push(noRootManifestNote(discovery.candidates.map((c) => c.path))); // R5.2
  }
  const selected = [...selection.value.selected].sort(compareCodePoints);
  return ok({ selected, notes, sizes });
}

/**
 * S2 and S3: selects, then fetches and parses one manifest at a time in ascending path
 * order. A skipped (too large) manifest sends nothing and counts no Work_Unit (R5.8); a
 * failed or deadline-cut fetch adds `manifest-fetch-failed` and the scan continues (R5.9).
 * Nothing throws.
 */
export async function runManifestStage(
  input: ManifestStageInput,
): Promise<Result<ManifestStageOutput, ScanError>> {
  const { github, runner, budget, ctx, discovered } = input;
  const selection = selectManifestStage(input);
  if (!selection.ok) return err(selection.error);
  const { selected, sizes } = selection.value;
  const blobs = readTreeBlobs(discovered.treeBody);
  const notes: ScanNote[] = [...selection.value.notes];
  const manifests: AssemblyManifest[] = [];
  const ref = { owner: discovered.owner, repo: discovered.repo };

  for (const path of selected) {
    const size = sizes.get(path) ?? null;
    if (size !== null && size > CONSTANTS.MAX_MANIFEST_LENGTH) {
      notes.push(manifestTooLargeNote(path));
      continue;
    }
    const format = path.slice(path.lastIndexOf('/') + 1);
    let fetched;
    try {
      fetched = await runner.runUnit(
        'github',
        manifestUnitKey(path),
        () =>
          github.getManifestText(
            ref,
            discovered.commitSha,
            path,
            blobs.get(path) ?? null,
            ctx,
            budget,
          ),
      );
    } catch {
      fetched = null;
    }
    if (fetched === null || fetched.kind !== 'ok' || typeof fetched.body !== 'string') {
      notes.push(manifestFetchFailedNote(path));
      continue;
    }
    try {
      const parsed = parseManifest(fetched.body, format as AssemblyManifest['format']);
      // resurrect R5.4: detect the tool of a pyproject.toml; keep a non-null result only.
      const tool = format === 'pyproject.toml' ? detectPyprojectTool(fetched.body) : null;
      manifests.push({
        path,
        format: format as AssemblyManifest['format'],
        warnings: parsed.warnings,
        dependencies: parsed.dependencies,
        ...(tool !== null ? { pyprojectTool: tool } : {}),
      });
    } catch {
      notes.push(manifestFetchFailedNote(path));
    }
  }
  return ok({ selected, manifests, notes });
}
