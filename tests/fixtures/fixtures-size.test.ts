import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXTURE_SET_MAX_BYTES } from '../../pipeline/constants';

// Requirement 23.16: every Fixture_Set is at most FIXTURE_SET_MAX_BYTES, summing all its files.

const FIXTURES_ROOT = resolve(__dirname);

function directorySize(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) total += directorySize(full);
    else if (entry.isFile()) total += statSync(full).size;
  }
  return total;
}

// A Fixture_Set is each directory directly under root, except `.recording-*` staging directories.
function fixtureSets(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.recording-'))
    .map((e) => e.name);
}

function oversized(root: string, max: number): string[] {
  return fixtureSets(root)
    .map((name) => ({ name, size: directorySize(join(root, name)) }))
    .filter((s) => s.size > max)
    .map((s) => `${s.name}: ${s.size} bytes (max ${max})`);
}

describe('fixture set size', () => {
  it('every Fixture_Set is at most FIXTURE_SET_MAX_BYTES', () => {
    expect(oversized(FIXTURES_ROOT, FIXTURE_SET_MAX_BYTES)).toEqual([]);
  });

  it('sums every file of a set, including nested ones, and names an oversized set', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fixture-size-'));
    try {
      mkdirSync(join(dir, 'big', 'responses'), { recursive: true });
      mkdirSync(join(dir, 'small'));
      mkdirSync(join(dir, '.recording-staged'));
      writeFileSync(join(dir, 'big', 'index.json'), 'x'.repeat(60));
      writeFileSync(join(dir, 'big', 'responses', 'r.json'), 'x'.repeat(60));
      writeFileSync(join(dir, 'small', 'index.json'), 'x'.repeat(10));
      writeFileSync(join(dir, '.recording-staged', 'r.json'), 'x'.repeat(500));
      expect(oversized(dir, 100)).toEqual(['big: 120 bytes (max 100)']);
      expect(oversized(dir, 120)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
