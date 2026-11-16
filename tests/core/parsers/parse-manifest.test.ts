import { describe, expect, it } from 'vitest';
import { CONSTANTS, parseManifest } from '../../../core';
import type { ManifestFormat } from '../../../core';

const LIMIT = CONSTANTS.MAX_MANIFEST_LENGTH;
const BASE = '{"dependencies":{"a":"1"}}';

describe('parseManifest', () => {
  it('4.1 rejects an unsupported format with one warning and no dependencies', () => {
    const r = parseManifest(BASE, 'pom.xml' as unknown as ManifestFormat);
    expect(r.dependencies).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('pom.xml');
  });

  it('4.1 does not infer the format from the text', () => {
    const r = parseManifest(BASE, 'pom.xml' as unknown as ManifestFormat);
    expect(r.dependencies).toEqual([]);
  });

  it.each([null, undefined, 5, true, [], {}, ['{}']])('4.3 rejects non-string input %j with one warning', (input) => {
    const r = parseManifest(input, 'package.json');
    expect(r.dependencies).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/string/);
  });

  it('4.4 parses text of exactly MAX_MANIFEST_LENGTH characters', () => {
    const text = BASE + ' '.repeat(LIMIT - BASE.length);
    expect(text.length).toBe(LIMIT);
    const r = parseManifest(text, 'package.json');
    expect(r.warnings).toEqual([]);
    expect(r.dependencies.map((d) => d.name)).toEqual(['a']);
  });

  it('4.4 rejects MAX_MANIFEST_LENGTH + 1 with one warning stating 1000000', () => {
    const text = BASE + ' '.repeat(LIMIT + 1 - BASE.length);
    expect(text.length).toBe(LIMIT + 1);
    const r = parseManifest(text, 'package.json');
    expect(LIMIT).toBe(1000000);
    expect(r.dependencies).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('1000000');
  });

  it('returns deterministic output sorted in Dependency_Order', () => {
    const text = '{"devDependencies":{"b":"1"},"dependencies":{"b":"2","a":"3"}}';
    const first = parseManifest(text, 'package.json');
    expect(first.dependencies.map((d) => [d.name, d.scope])).toEqual([
      ['a', 'runtime'],
      ['b', 'runtime'],
      ['b', 'dev'],
    ]);
    expect(parseManifest(text, 'package.json')).toEqual(first);
  });
});

describe('parseManifest performance and size boundaries (5.23)', () => {
  const formats: ManifestFormat[] = ['package.json', 'requirements.txt', 'Cargo.toml'];
  const bases: Record<string, string> = {
    'package.json': BASE,
    'requirements.txt': 'a==1\n',
    'Cargo.toml': '[dependencies]\na = "1"\n',
  };
  const N = 1000000;
  const hostile: Record<string, string> = {
    'a x1,000,000': 'a'.repeat(N),
    '[ x1,000,000': '['.repeat(N),
    '\\ x1,000,000': '\\'.repeat(N),
    '" x1,000,000': '"'.repeat(N),
    'quoted a-run': '"' + 'a'.repeat(N - 1),
    'key = [ nested': 'a = ' + '['.repeat(N - 4),
    'json nested [': '{"dependencies":' + '['.repeat(N - 16),
    'json nested {': '{"a":'.repeat(Math.floor(N / 5)),
    'toml [[ headers': '[['.repeat(N / 2),
  };

  describe.each(formats)('%s', (format) => {
    it.each(Object.entries(hostile))('hostile input %s completes without throwing', (_name, text) => {
      expect(text.length).toBeLessThanOrEqual(N);
      const start = performance.now();
      const r = parseManifest(text, format);
      const ms = performance.now() - start;
      console.log(`[5.23] ${format} | ${_name} | ${ms.toFixed(0)}ms`);
      expect(Array.isArray(r.dependencies)).toBe(true);
      expect(Array.isArray(r.warnings)).toBe(true);
      expect(ms).toBeLessThan(5000);
    }, 20000);

    it('accepts exactly MAX_MANIFEST_LENGTH characters', () => {
      const base = bases[format];
      const text = base + ' '.repeat(LIMIT - base.length);
      expect(text.length).toBe(LIMIT);
      const r = parseManifest(text, format);
      expect(r.warnings.some((w) => w.includes('1000000'))).toBe(false);
      expect(r.dependencies.map((d) => d.name)).toEqual(['a']);
    }, 20000);

    it('rejects MAX_MANIFEST_LENGTH + 1 with one warning stating 1000000', () => {
      const base = bases[format];
      const text = base + ' '.repeat(LIMIT + 1 - base.length);
      expect(text.length).toBe(LIMIT + 1);
      const r = parseManifest(text, format);
      expect(r.dependencies).toEqual([]);
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]).toContain('1000000');
    }, 20000);
  });
});
