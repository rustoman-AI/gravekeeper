// Hook: run the Vitest files related to a saved file under core/ or tests/core/.
// A saved test file runs itself; a saved source file runs every test that imports it.
// Exit 0 when the tests pass, 1 with a failure summary otherwise.
import { readSavedFile, runNode } from './common.mjs';

const rel = await readSavedFile();
if (!rel || !/^(core|pipeline|tests\/(core|pipeline|adapters|app|architecture))\/.+\.ts$/.test(rel)) process.exit(0);

const vitest = 'node_modules/vitest/vitest.mjs';
const isTest = /\.test\.ts$/.test(rel);
const args = isTest ? [vitest, 'run', rel] : [vitest, 'related', rel, '--run', '--passWithNoTests'];
const result = runNode(args);
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

if (result.status === 0) {
  const summary = output.split('\n').filter((l) => /Test Files|Tests /.test(l)).join('\n');
  console.log(`vitest (${isTest ? 'file' : 'related'}) for ${rel}: passed\n${summary}`);
  process.exit(0);
}
const failures = output
  .split('\n')
  .filter((l) => /FAIL|✗|×|AssertionError|Error:|Counterexample|Test Files|Tests /.test(l))
  .slice(0, 60)
  .join('\n');
const report = `vitest (${isTest ? 'file' : 'related'}) for ${rel}: FAILED\n${failures || output.slice(-4000)}`;
console.log(report);
console.error(report);
process.exit(1);