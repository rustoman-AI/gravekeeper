import * as fs from 'node:fs';
import * as path from 'node:path';
import { CORE_ALLOWED_PACKAGES } from '../core/model/constants';
import { checkPackageJson, checkSource, type Violation } from './core-purity/check';

/** Returns every `.ts` file under `dir`, as POSIX paths relative to `root`, sorted. */
function walkTsFiles(root: string, dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walkTsFiles(root, full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      found.push(path.relative(root, full).split(path.sep).join('/'));
    }
  }
  return found.sort();
}

function main(): number {
  const root = path.resolve(process.argv[2] ?? path.join(__dirname, '..'));
  const violations: Violation[] = [];

  const coreDir = path.join(root, 'core');
  if (fs.existsSync(coreDir)) {
    for (const rel of walkTsFiles(root, coreDir)) {
      const text = fs.readFileSync(path.join(root, rel), 'utf8');
      violations.push(
        ...checkSource(rel, text, { allowedPackages: CORE_ALLOWED_PACKAGES }).map((v) => ({
          ...v,
          file: rel,
        })),
      );
    }
  }

  const packageJsonPath = path.join(root, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    violations.push(
      ...checkPackageJson(fs.readFileSync(packageJsonPath, 'utf8'), {
        allowedPackages: CORE_ALLOWED_PACKAGES,
        filePath: 'package.json',
      }),
    );
  } else {
    violations.push({
      file: 'package.json',
      line: 1,
      column: 1,
      rule: 'package-not-pinned',
      message: 'package.json not found',
    });
  }

  for (const v of violations) {
    console.error(`${v.file}:${v.line}:${v.column} ${v.rule} ${v.message}`);
  }
  if (violations.length > 0) {
    console.error(`Core purity check failed: ${violations.length} violation(s).`);
    return 1;
  }
  console.log('Core purity check OK.');
  return 0;
}

process.exit(main());
