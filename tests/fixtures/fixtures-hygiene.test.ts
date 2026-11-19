import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readGithubToken } from '../../adapters/runtime/token-reader';

// Requirement 23.6, 23.16, 20.13: no fixture file contains the token, a Bearer value,
// a GitHub token prefix or an Authorization header.

const FIXTURES_ROOT = resolve(__dirname);
const TOKEN_PREFIXES = ['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_', 'github_pat_'];

type Finding = { file: string; reason: string };

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

// Scans every file under root recursively. Reports the reason only, never the matched text.
function scanDirectory(root: string, token: string | null, skip: (path: string) => boolean): Finding[] {
  const findings: Finding[] = [];
  for (const path of listFiles(root)) {
    if (skip(path)) continue;
    const text = readFileSync(path, 'latin1');
    const file = relative(root, path);
    if (token !== null && text.includes(token)) findings.push({ file, reason: 'contains the token' });
    if (text.includes('Bearer ')) findings.push({ file, reason: 'contains "Bearer "' });
    if (/authorization/i.test(text)) findings.push({ file, reason: 'contains "Authorization"' });
    for (const prefix of TOKEN_PREFIXES) {
      if (text.includes(prefix)) findings.push({ file, reason: `contains token prefix ${prefix}` });
    }
  }
  return findings;
}

describe('fixture hygiene', () => {
  it('no file under tests/fixtures contains a token, Bearer value, token prefix or Authorization', () => {
    const findings = scanDirectory(FIXTURES_ROOT, readGithubToken(), (p) => p.endsWith('.test.ts'));
    expect(findings).toEqual([]);
  });

  describe('scanner self-check', () => {
    function withTempDir(files: Record<string, string>, run: (dir: string) => void): void {
      const dir = mkdtempSync(join(tmpdir(), 'fixture-hygiene-'));
      try {
        for (const [name, content] of Object.entries(files)) {
          const full = join(dir, name);
          mkdirSync(join(full, '..'), { recursive: true });
          writeFileSync(full, content);
        }
        run(dir);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }

    it('finds nothing in clean files', () => {
      withTempDir({ 'a/b.json': '{"ok":true}' }, (dir) => {
        expect(scanDirectory(dir, 'secret-value', () => false)).toEqual([]);
      });
    });

    it('finds each planted token prefix in nested files', () => {
      for (const prefix of TOKEN_PREFIXES) {
        withTempDir({ 'set/deep/x.json': `{"v":"${prefix}abc"}` }, (dir) => {
          expect(scanDirectory(dir, null, () => false).map((f) => f.reason)).toEqual([
            `contains token prefix ${prefix}`,
          ]);
        });
      }
    });

    it('finds Bearer, Authorization (any case) and the token value', () => {
      withTempDir(
        { 'a.json': 'Bearer xyz', 'b.json': '{"AUTHORIZATION":"x"}', 'c.json': 'has secret-value inside' },
        (dir) => {
          const reasons = scanDirectory(dir, 'secret-value', () => false).map((f) => f.reason);
          expect(reasons).toContain('contains "Bearer "');
          expect(reasons).toContain('contains "Authorization"');
          expect(reasons).toContain('contains the token');
        },
      );
    });

    it('honours the skip predicate', () => {
      withTempDir({ 'x.test.ts': 'ghp_' }, (dir) => {
        expect(scanDirectory(dir, null, (p) => p.endsWith('.test.ts'))).toEqual([]);
      });
    });
  });
});
