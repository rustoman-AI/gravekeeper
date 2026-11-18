import * as path from 'node:path';

// Requirement 22.13, 22.14
export type ResolvedSpecifier =
  | { kind: 'project'; path: string }
  | { kind: 'package'; name: string };

/** Normalizes a path to a POSIX path without a leading `./`. */
export function toPosix(filePath: string): string {
  return path.posix.normalize(filePath.replace(/\\/g, '/')).replace(/^\.\//, '');
}

function isRelative(specifier: string): boolean {
  return (
    specifier === '.' ||
    specifier === '..' ||
    specifier.startsWith('./') ||
    specifier.startsWith('../')
  );
}

function packageName(specifier: string): string {
  if (specifier.startsWith('node:')) return specifier;
  const parts = specifier.split('/');
  return specifier.startsWith('@') && parts.length > 1 ? `${parts[0]}/${parts[1]}` : parts[0];
}

/**
 * Resolves a specifier against the importing file (a project-root-relative path).
 * Relative and `@/` specifiers give project-root-relative POSIX paths, anything else a package.
 */
export function resolveSpecifier(fromFile: string, specifier: string): ResolvedSpecifier {
  if (isRelative(specifier)) {
    const fromDir = path.posix.dirname(toPosix(fromFile));
    return { kind: 'project', path: path.posix.normalize(path.posix.join(fromDir, specifier)) };
  }
  if (specifier.startsWith('@/')) {
    return { kind: 'project', path: path.posix.normalize(specifier.slice(2)) };
  }
  return { kind: 'package', name: packageName(specifier) };
}

/** Whole-segment membership: `pipeline/mapping-extra/a.ts` is not inside `pipeline/mapping`. */
export function isInsideDir(filePath: string, dir: string): boolean {
  const file = toPosix(filePath);
  const base = toPosix(dir).replace(/\/+$/, '');
  return file === base || file.startsWith(`${base}/`);
}
