// Validates: Requirements 5.6, 5.7
import { describe, expect, it } from 'vitest';
import { narrowUpgrade } from '../../../view-model/narrow';
import { parseScanResponse } from '../../../view-model/parse-response';

function up(version: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { version, basis: 'registry-default', ...extra };
}

describe('narrowUpgrade (Requirements 5.6, 5.7)', () => {
  it('gives null for an absent field and non-records', () => {
    expect(narrowUpgrade(undefined, 'npm', '1.0.0')).toBeNull();
    expect(narrowUpgrade(null, 'npm', '1.0.0')).toBeNull();
    expect(narrowUpgrade([up('2.0.0')], 'npm', '1.0.0')).toBeNull();
    expect(narrowUpgrade('2.0.0', 'npm', '1.0.0')).toBeNull();
  });
  it('keeps a valid upgrade', () => {
    expect(narrowUpgrade(up('11.1.0'), 'npm', '3.4.0')).toEqual({ version: '11.1.0', basis: 'registry-default' });
    expect(narrowUpgrade(up('11.1.0'), 'npm', null)).toEqual({ version: '11.1.0', basis: 'registry-default' });
  });
  it('rejects metacharacters, a space,  and 65 code points', () => {
    for (const v of ['1.2.3;rm', '1.2.3 4', '', '1.2.3-' + 'a'.repeat(59)]) {
      expect(narrowUpgrade(up(v), 'npm', '1.0.0')).toBeNull();
    }
    expect('1.2.3-' + 'a'.repeat(59)).toHaveLength(65);
  });
  it('rejects an unknown basis and an extra key', () => {
    expect(narrowUpgrade(up('2.0.0', { basis: 'latest' }), 'npm', '1.0.0')).toBeNull();
    expect(narrowUpgrade(up('2.0.0', { extra: 1 }), 'npm', '1.0.0')).toBeNull();
    expect(narrowUpgrade({ version: '2.0.0' }, 'npm', '1.0.0')).toBeNull();
  });
  it('rejects a version equal to the lookupVersion', () => {
    expect(narrowUpgrade(up('2.0.0'), 'npm', '2.0.0')).toBeNull();
  });
  it('checks the version against the grammar of the ecosystem', () => {
    expect(narrowUpgrade(up('1.0.post1'), 'pypi', '0.9')).toEqual({ version: '1.0.post1', basis: 'registry-default' });
    expect(narrowUpgrade(up('1.0'), 'npm', '0.9.0')).toBeNull();
  });
  it('is idempotent', () => {
    const once = narrowUpgrade(up('2.0.0'), 'cargo', '1.0.0');
    expect(narrowUpgrade(once, 'cargo', '1.0.0')).toEqual(once);
  });
});

describe('parseScanResponse upgrade', () => {
  function body(entryExtra: Record<string, unknown>): Record<string, unknown> {
    return {
      ok: true,
      asOf: '2026-01-01T00:00:00Z',
      repo: { host: 'github.com', owner: 'o', repo: 'r', branch: 'main', defaultBranch: 'main' },
      discovery: {},
      manifests: [],
      dependencies: [
        {
          dependency: { name: 'a', ecosystem: 'npm' },
          lookupVersion: '1.0.0',
          facts: {},
          versionBasis: 'pinned',
          advisories: [],
          ...entryExtra,
        },
      ],
      assessed: [{}],
      summary: {},
      sources: { github: 'ok', depsdev: 'ok', osv: 'ok', npm: 'ok', cratesio: 'ok', pypi: 'ok' },
      capped: {},
      notes: [],
    };
  }
  const headers = { get: (): string | null => null };
  it('parses a body with no upgrade anywhere (results recorded before this spec)', () => {
    const out = parseScanResponse(200, headers, body({}));
    expect(out.kind).toBe('result');
    if (out.kind === 'result') expect(out.result.dependencies[0]!.upgrade).toBeNull();
  });
  it('narrows the upgrade on each dependency', () => {
    const ok = parseScanResponse(200, headers, body({ upgrade: up('2.0.0') }));
    if (ok.kind === 'result') expect(ok.result.dependencies[0]!.upgrade).toEqual(up('2.0.0'));
    const bad = parseScanResponse(200, headers, body({ upgrade: up('2.0') }));
    expect(bad.kind).toBe('result');
    if (bad.kind === 'result') expect(bad.result.dependencies[0]!.upgrade).toBeNull();
  });
});
