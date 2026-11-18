import * as fs from 'node:fs';
import * as path from 'node:path';
import { checkArchitecture, type SourceFileInput } from './architecture/check';

// Requirement 22.16

const ROOTS = ['core', 'pipeline', 'adapters', 'app', 'components'];

/** Returns every `.ts` and `.tsx` file under `dir`, as POSIX paths relative to `root`, sorted. */
function walkSourceFiles(root: string, dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walkSourceFiles(root, full));
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      found.push(path.relative(root, full).split(path.sep).join('/'));
    }
  }
  return found.sort();
}

function main(): number {
  const root = path.resolve(process.argv[2] ?? path.join(__dirname, '..'));
  const files: SourceFileInput[] = [];
  for (const name of ROOTS) {
    const dir = path.join(root, name);
    if (!fs.existsSync(dir)) continue;
    for (const rel of walkSourceFiles(root, dir)) {
      files.push({ path: rel, text: fs.readFileSync(path.join(root, rel), 'utf8') });
    }
  }

  const violations = checkArchitecture(files);
  for (const v of violations) {
    console.error(`${v.file}:${v.line} ${v.rule} violates the architecture rule ${v.rule}`);
  }
  if (violations.length > 0) {
    console.error(`Architecture check failed: ${violations.length} violation(s).`);
    return 1;
  }
  console.log('Architecture check OK.');
  return 0;
}

process.exit(main());
