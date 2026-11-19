import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { offlineFetchCalls } from '../support/offline-fetch';
import { TOKEN_SKIP_REASON } from './live-support';

// Requirement 23.9, 23.14
// Child vitest runs over tests/live/*.live.test.ts. A temporary reporter prints one
// line per test case with its state and skip note (the JSON reporter has no notes).
// No run here reaches the network: the flag-unset run skips every test, and the
// flag-set run selects only the three token rows, which skip before any request.

interface CaseResult {
  readonly name: string;
  readonly state: string;
  readonly note: string | null;
}

const MARK = 'GATING_CASE ';
const REPORTER_SOURCE = `
export default class GatingReporter {
  onTestCaseResult(testCase) {
    const result = testCase.result();
    const note = typeof result.note === 'string' ? result.note : null;
    process.stdout.write(${JSON.stringify(MARK)} + JSON.stringify({ name: testCase.fullName, state: result.state, note }) + '\\n');
  }
}
`;

let dir = '';
let reporterPath = '';

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'gravekeeper-gating-'));
  reporterPath = path.join(dir, 'gating-reporter.mjs');
  writeFileSync(reporterPath, REPORTER_SOURCE);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function runChild(env: Record<string, string>, extraArgs: readonly string[]) {
  const vitestEntry = path.resolve('node_modules/vitest/vitest.mjs');
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  delete childEnv.GRAVEKEEPER_LIVE_TESTS;
  delete childEnv.GITHUB_TOKEN;
  Object.assign(childEnv, env);
  const result = spawnSync(
    process.execPath,
    [
      vitestEntry,
      '--run',
      // Only the *.live.test.ts files; this file must not run itself in the child.
      '.live.test.ts',
      '--reporter',
      reporterPath,
      ...extraArgs,
    ],
    { cwd: process.cwd(), encoding: 'utf8', env: childEnv },
  );
  const cases: CaseResult[] = result.stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith(MARK))
    .map((line) => JSON.parse(line.slice(MARK.length)) as CaseResult);
  return { status: result.status, cases, output: `${result.stdout}\n${result.stderr}` };
}

describe('live test gating', () => {
  it('reports every live test as skipped, never passed, when the flag is unset (R23.9)', () => {
    const run = runChild({}, []);
    expect(run.status, run.output).toBe(0);
    expect(run.cases.length).toBeGreaterThan(0);
    expect(run.cases.filter((c) => c.state !== 'skipped')).toEqual([]);
    expect(run.cases.some((c) => c.state === 'passed')).toBe(false);
    // The offline guard fails any test that calls fetch; this process saw none either.
    expect(offlineFetchCalls()).toEqual([]);
  }, 60000);

  it('skips the GraphQL rows EF-17, EF-18, EF-19 with the stated reason when the token is unset (R23.14)', () => {
    // Selects only the three token rows (full name "... ) EF-17 ..."), so no request is sent.
    const run = runChild({ GRAVEKEEPER_LIVE_TESTS: '1', GITHUB_TOKEN: '' }, [
      '-t',
      String.raw`\) EF-(17|18|19) `,
    ]);
    expect(run.status, run.output).toBe(0);
    const selected = run.cases.filter((c) => /EF-(17|18|19) GraphQL/.test(c.name));
    expect(selected.map((c) => c.name.match(/EF-(?:17|18|19)(?= GraphQL)/)?.[0]).sort()).toEqual([
      'EF-17',
      'EF-18',
      'EF-19',
    ]);
    for (const c of selected) {
      expect(c.state).toBe('skipped');
      expect(c.note).toBe(TOKEN_SKIP_REASON);
    }
    expect(run.cases.filter((c) => c.state === 'passed')).toEqual([]);
  }, 60000);
});
