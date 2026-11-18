// Hook: run the architecture check (npm run check:architecture) after a save under
// pipeline/, adapters/, app/ or core/.
import { readSavedFile, runNode } from './common.mjs';

const rel = await readSavedFile();
if (!rel || !/^(pipeline|adapters|app|core)\/.+\.tsx?$/.test(rel)) process.exit(0);

const result = runNode(['node_modules/tsx/dist/cli.mjs', 'scripts/check-architecture.ts']);
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
console.log(`check:architecture after saving ${rel}:\n${output}`);
if (result.status !== 0) {
  console.error(output);
  process.exit(1);
}
