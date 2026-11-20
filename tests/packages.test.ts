import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// Requirements 5.1, 5.2, 5.6, 5.7: the range packages are pinned exactly, install nothing and stay out of core.
const root = resolve(__dirname, '..');
interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  gypfile?: unknown;
}
function readJson(path: string): PackageJson {
  return JSON.parse(readFileSync(path, 'utf8')) as PackageJson;
}
const EXACT = /^\d+\.\d+\.\d+$/;
const PINNED = ['semver', '@renovatebot/pep440', '@types/semver'];
const INSTALLED = ['semver', '@renovatebot/pep440'];
describe('range package pins', () => {
  const manifest = readJson(join(root, 'package.json'));
  const declared: Record<string, string> = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
  };
  it.each(PINNED)('%s is pinned to an exact version', (name) => {
    expect(declared[name]).toMatch(EXACT);
  });
  it.each(INSTALLED)('installed %s has no dependencies and no install script', (name) => {
    const installed = readJson(join(root, 'node_modules', name, 'package.json'));
    expect(installed.dependencies ?? {}).toEqual({});
    const scripts = installed.scripts ?? {};
    for (const hook of ['preinstall', 'install', 'postinstall']) {
      expect(Object.hasOwn(scripts, hook)).toBe(false);
    }
    expect(installed.gypfile).toBeUndefined();
    expect(readdirSync(join(root, 'node_modules', name))).not.toContain('binding.gyp');
  });
});
describe('core does not import the range packages', () => {
  function sources(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...sources(path));
      else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) out.push(path);
    }
    return out;
  }
  it('no file under core/ names semver or @renovatebot/pep440 in a module specifier', () => {
    const pattern = /(?:from\s*|import\s*\(?\s*|require\s*\(\s*)['"](?:semver|@renovatebot\/pep440)(?:\/[^'"]*)?['"]/;
    const offenders = sources(join(root, 'core')).filter((file) =>
      pattern.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});

// Requirement 19.8: the UI test tooling is pinned exactly, dev-only, and kept out of core, pipeline and adapters.
const UI_TOOLING = [
  '@testing-library/react',
  '@testing-library/dom',
  '@testing-library/user-event',
  'jsdom',
  '@vitejs/plugin-react',
  '@playwright/test',
  '@axe-core/playwright',
];

describe('UI test tooling pins', () => {
  const manifest = readJson(join(root, 'package.json'));

  it.each(UI_TOOLING)('%s is pinned exactly in devDependencies', (name) => {
    expect(manifest.devDependencies?.[name]).toMatch(EXACT);
  });

  it.each(UI_TOOLING)('%s is not in dependencies', (name) => {
    expect(Object.hasOwn(manifest.dependencies ?? {}, name)).toBe(false);
  });

  it('core/, pipeline/ and adapters/ import none of the UI test tooling', () => {
    function sources(dir: string): string[] {
      const out: string[] = [];
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...sources(path));
        else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) out.push(path);
      }
      return out;
    }
    const escaped = UI_TOOLING.map((n) => n.replace(/[/@.-]/g, '\\$&')).join('|');
    const pattern = new RegExp(
      `(?:from\\s*|import\\s*\\(?\\s*|require\\s*\\(\\s*)['"](?:${escaped})(?:/[^'"]*)?['"]`,
    );
    const offenders = ['core', 'pipeline', 'adapters']
      .flatMap((dir) => sources(join(root, dir)))
      .filter((file) => pattern.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
