// Hook: run the core purity check (npm run check:core) after a save under core/.
import { readSavedFile, runNode } from './common.mjs';

const rel = await readSavedFile();
if (!rel || !/^core\/.+\.ts$/.test(rel)) process.exit(0);

const result = runNode(['node_modules/tsx/dist/cli.mjs', 'scripts/check-core-purity.ts']);
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
console.log(`check:core after saving ${rel}:\n${output}`);
if (result.status !== 0) {
  console.error(output);
  process.exit(1);
}