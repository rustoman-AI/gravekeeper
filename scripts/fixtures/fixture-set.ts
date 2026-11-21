import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { FixtureIndexEntry } from '../../tests/support/fixture-http-client';
import { assertNoSecrets, SecretFoundError } from './assert-no-secrets';
import type { RecordedResponse } from './recording-http-client';

// Requirement 23.3, 23.6, 23.16, 20.13

export const RECORDER_VERSION = 'record-fixtures/1';

export interface FixtureMetadata {
  readonly kind: 'npm' | 'python' | 'rust' | 'supplementary';
  readonly canonicalRepoUrl: string | null;
  readonly recordedAt: string;
  readonly asOf: string;
  readonly manifestPaths: readonly string[];
  readonly recorderVersion: string;
  /** Pyproject R12.4: `false` replaces the archived/deprecated replay rule by "ok and a dependency". */
  readonly requiresFlaggedDependency?: boolean;
}

/** A rejected fixture: where it came from (source and path only) and why. Never the token. */
export class FixtureRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FixtureRejectedError';
  }
}

export interface FileSize {
  readonly path: string;
  readonly bytes: number;
}

export interface StagedSet {
  readonly stagingDir: string;
  readonly totalBytes: number;
  readonly responseFiles: readonly FileSize[];
}

export function hash16(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex').slice(0, 16);
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function urlPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    const cut = url.search(/[?#]/);
    return cut === -1 ? url : url.slice(0, cut);
  }
}

/** Sum of the sizes of every file under `dir`, recursively. */
export function directorySize(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) total += directorySize(full);
    else if (entry.isFile()) total += statSync(full).size;
  }
  return total;
}

function listFiles(dir: string): FileSize[] {
  const out: FileSize[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (entry.isFile()) out.push({ path: full, bytes: statSync(full).size });
  }
  return out;
}

/**
 * Writes `metadata.json`, `index.json` and `responses/<source>/<hash16>.json` into `stagingDir`
 * (replacing a stale one). Each file is checked with `assertNoSecrets` before it is written; a
 * rejection removes the staging directory and throws `FixtureRejectedError` naming the source and
 * request path only.
 */
export function stageFixtureSet(
  stagingDir: string,
  metadata: FixtureMetadata,
  responses: readonly RecordedResponse[],
  token: string | null,
): StagedSet {
  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });
  try {
    const index: FixtureIndexEntry[] = [];
    const seen = new Map<string, string>();
    for (const { key, file } of responses) {
      const name = hash16(key);
      const rel = `responses/${file.request.source}/${name}.json`;
      const clash = seen.get(rel);
      if (clash !== undefined && clash !== key) throw new Error(`hash16 collision at ${rel}`);
      seen.set(rel, key);
      const text = JSON.stringify(file);
      try {
        assertNoSecrets(text, token);
      } catch (error) {
        if (error instanceof SecretFoundError) {
          throw new FixtureRejectedError(
            `${error.message} (source ${file.request.source}, ${file.request.method} ${urlPath(file.request.url)})`,
          );
        }
        throw error;
      }
      const full = join(stagingDir, ...rel.split('/'));
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, text, 'utf8');
      index.push({
        key,
        file: rel,
        source: file.request.source,
        method: file.request.method,
        url: file.request.url,
      });
    }
    index.sort((a, b) => compareStrings(a.key, b.key));
    for (const [name, value] of [
      ['index.json', index],
      ['metadata.json', metadata],
    ] as const) {
      const text = JSON.stringify(value);
      try {
        assertNoSecrets(text, token);
      } catch (error) {
        if (error instanceof SecretFoundError) {
          throw new FixtureRejectedError(`${error.message} (${name})`);
        }
        throw error;
      }
      writeFileSync(join(stagingDir, name), text, 'utf8');
    }
  } catch (error) {
    rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }
  const files = listFiles(stagingDir);
  const responseFiles = files
    .filter((f) => relative(stagingDir, f.path).split(/[\\/]/)[0] === 'responses')
    .sort((a, b) => b.bytes - a.bytes);
  return { stagingDir, totalBytes: files.reduce((sum, f) => sum + f.bytes, 0), responseFiles };
}

/** Human-readable size failure: the size and the five largest response files. */
export function describeOversize(label: string, staged: StagedSet, max: number): string {
  const largest = staged.responseFiles
    .slice(0, 5)
    .map((f) => `  ${f.bytes} bytes  ${relative(staged.stagingDir, f.path).split('\\').join('/')}`);
  return [`${label}: ${staged.totalBytes} bytes exceeds FIXTURE_SET_MAX_BYTES ${max}.`, 'Largest response files:', ...largest].join(
    '\n',
  );
}

/**
 * Replaces `targetDir` by `stagingDir`. The previous directory is moved aside first and restored
 * when the rename fails, so a failure leaves the previous fixtures unchanged.
 */
export function promoteStagedSet(stagingDir: string, targetDir: string): void {
  mkdirSync(dirname(targetDir), { recursive: true });
  const aside = `${targetDir}.replaced`;
  rmSync(aside, { recursive: true, force: true });
  const hadPrevious = existsSync(targetDir);
  if (hadPrevious) renameSync(targetDir, aside);
  try {
    renameSync(stagingDir, targetDir);
  } catch (error) {
    if (hadPrevious) renameSync(aside, targetDir);
    throw error;
  }
  if (hadPrevious) rmSync(aside, { recursive: true, force: true });
}

export function discardStaged(stagingDir: string): void {
  rmSync(stagingDir, { recursive: true, force: true });
}
