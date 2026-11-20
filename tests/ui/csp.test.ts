import { afterEach, describe, expect, it, vi } from 'vitest';

// Requirement 21.6: the exact Content-Security-Policy directive set.
const EXPECTED: Record<string, string> = {
  'default-src': "'self'",
  'script-src': "'self' 'unsafe-inline'",
  'style-src': "'self' 'unsafe-inline'",
  'font-src': "'self'",
  'img-src': "'self' data:",
  'connect-src': "'self'",
  'object-src': "'none'",
  'base-uri': "'self'",
  'form-action': "'self'",
  'frame-ancestors': "'none'",
};

async function loadConfig(nodeEnv: string) {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', nodeEnv);
  const mod = await import('../../next.config');
  return mod.default;
}

function parse(policy: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const part of policy.split(';')) {
    const trimmed = part.trim();
    const space = trimmed.indexOf(' ');
    map[trimmed.slice(0, space)] = trimmed.slice(space + 1);
  }
  return map;
}

async function policyFor(nodeEnv: string): Promise<string> {
  const config = await loadConfig(nodeEnv);
  const entries = await config.headers!();
  const entry = entries.find((e) => e.source === '/(.*)');
  expect(entry).toBeDefined();
  const header = entry!.headers.find((h) => h.key === 'Content-Security-Policy');
  expect(header).toBeDefined();
  return header!.value;
}

describe('next.config.ts Content-Security-Policy', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('covers every path with a single /(.*) entry', async () => {
    const config = await loadConfig('production');
    const entries = await config.headers!();
    expect(entries.map((e) => e.source)).toEqual(['/(.*)']);
  });

  it('sends exactly the Requirement 21.6 directives in production', async () => {
    const directives = parse(await policyFor('production'));
    expect(directives).toEqual(EXPECTED);
  });

  it("omits 'unsafe-eval' in production", async () => {
    expect(await policyFor('production')).not.toContain('unsafe-eval');
  });

  it("adds 'unsafe-eval' to script-src only in development", async () => {
    const directives = parse(await policyFor('development'));
    expect(directives['script-src']).toBe("'self' 'unsafe-inline' 'unsafe-eval'");
    expect({ ...directives, 'script-src': EXPECTED['script-src'] }).toEqual(EXPECTED);
  });

  it('keeps the existing config keys unchanged', async () => {
    const config = await loadConfig('production');
    expect(config.cacheComponents).toBe(true);
    expect(config.partialPrefetching).toBe(true);
    expect(config.turbopack).toEqual({
      rules: {
        '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' },
      },
    });
  });
});
