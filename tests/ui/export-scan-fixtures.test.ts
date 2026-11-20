import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { exportScanFixtures } from '../../scripts/export-scan-fixtures';
import { buildPackageRows } from '../../view-model/package-rows';
import { parseScanResponse } from '../../view-model/parse-response';
import type { ParsedScanResult, PlotKind } from '../../view-model/types';

// Requirements 20.1, 19.6

const headers = { get: () => null };
const EXPECTED: Readonly<Record<string, number>> = {
  'scan-request.json': 40,
  'scan-canopy.json': 6,
  'scan-zoxide.json': 20,
  'scan-synthetic-restless.json': 6,
  'scan-synthetic-300.json': 300,
  'scan-synthetic-301.json': 301,
};

let dir: string;
let paths: string[];
const parsedByFile = new Map<string, ParsedScanResult>();
const rawByFile = new Map<string, { dependencies: { advisories: { excluded: string | null }[] }[] }>();

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gravekeeper-export-'));
  paths = await exportScanFixtures(dir);
  for (const p of paths) {
    const body = JSON.parse(await readFile(p, 'utf8')) as unknown;
    rawByFile.set(basename(p), body as never);
    const out = parseScanResponse(200, headers, body);
    if (out.kind === 'result') parsedByFile.set(basename(p), out.result);
  }
}, 300_000);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('exportScanFixtures', () => {
  it('writes exactly the six expected files', () => {
    expect(paths.map((p) => basename(p)).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it('writes bodies that parse to a result outcome', async () => {
    for (const p of paths) {
      const body = JSON.parse(await readFile(p, 'utf8')) as unknown;
      expect(parseScanResponse(200, headers, body).kind, basename(p)).toBe('result');
    }
  });

  it.each(Object.entries(EXPECTED))('%s has %i unique packages', (file, count) => {
    const parsed = parsedByFile.get(file);
    expect(parsed).toBeDefined();
    expect(parsed!.summary.total).toBe(count);
    expect(buildPackageRows(parsed!)).toHaveLength(count);
  });

  it('synthetic restless file has one row of each plot kind', () => {
    const rows = buildPackageRows(parsedByFile.get('scan-synthetic-restless.json')!);
    const kinds = rows.map((r) => r.kind).sort();
    const all: PlotKind[] = ['tombstone', 'overgrown', 'ghost', 'restless', 'lantern', 'unmarked'];
    expect(kinds).toEqual([...all].sort());
  });

  it('synthetic restless file has advisories excluded as withdrawn, informational and null', () => {
    const excluded = new Set(
      rawByFile.get('scan-synthetic-restless.json')!.dependencies.flatMap((d) => d.advisories.map((a) => a.excluded)),
    );
    expect(excluded.has('withdrawn')).toBe(true);
    expect(excluded.has('informational')).toBe(true);
    expect(excluded.has(null)).toBe(true);
  });
});
