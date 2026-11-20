import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string): string =>
  readFileSync(resolve(process.cwd(), '.github', 'workflows', name), 'utf8');

const runSteps = (yaml: string): string[] =>
  yaml
    .split(/\r?\n/)
    .map((line) => /^\s*-\s+run:\s*(.+?)\s*$/.exec(line)?.[1])
    .filter((cmd): cmd is string => cmd !== undefined);

describe('CI workflow configuration', () => {
  const ci = read('ci.yml');

  it('runs the checks in the required order', () => {
    expect(runSteps(ci)).toEqual([
      'npm ci',
      'npm run typecheck',
      'npm run lint',
      'npm run check:core',
      'npm run check:architecture',
      'npx vitest --run',
      'npm run build',
      'npm run check:bundle',
      'npx playwright install --with-deps chromium',
      'npm run e2e:fixtures',
      'npx playwright test',
    ]);
  });

  it('uploads the playwright report after the e2e run, even on failure', () => {
    const lines = ci.split(/\r?\n/);
    const e2e = lines.findIndex((l) => l.includes('npx playwright test'));
    const upload = lines.findIndex((l) =>
      l.includes('actions/upload-artifact@'),
    );
    expect(e2e).toBeGreaterThan(-1);
    expect(upload).toBeGreaterThan(e2e);
    const block = lines.slice(upload, upload + 8).join('\n');
    expect(block).toMatch(/if:\s*\$\{\{\s*(!cancelled\(\)|always\(\))\s*\}\}/);
    expect(block).toContain('name: playwright-report');
    expect(block).toContain('path: playwright-report/');
  });

  it('never sets the live flag or a token', () => {
    expect(ci).not.toContain('GRAVEKEEPER_LIVE_TESTS');
    expect(ci).not.toContain('GITHUB_TOKEN');
    expect(ci).not.toContain('secrets.');
  });
});

describe('live workflow configuration', () => {
  const live = read('live.yml');

  it('is manually dispatched only', () => {
    expect(live).toMatch(/^on:\s*\n\s+workflow_dispatch:\s*$/m);
    expect(live).not.toMatch(/^\s+(push|pull_request|schedule):/m);
  });

  it('enables live tests and passes the token from secrets', () => {
    expect(live).toContain("GRAVEKEEPER_LIVE_TESTS: '1'");
    expect(live).toContain('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(runSteps(live)).toContain('npx vitest --run tests/live');
  });
});
