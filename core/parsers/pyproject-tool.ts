import { CONSTANTS } from '../model';
import { parseToml } from './toml-tree';

export type PyprojectTool = 'poetry' | 'pep621' | 'mixed';

function own(table: unknown, key: string): unknown {
  if (typeof table !== 'object' || table === null || Array.isArray(table)) return undefined;
  return Object.hasOwn(table, key) ? (table as Record<string, unknown>)[key] : undefined;
}

function isFilledObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length > 0;
}

function hasPoetry(root: unknown): boolean {
  const poetry = own(own(root, 'tool'), 'poetry');
  const deps = own(poetry, 'dependencies');
  // The `python` key is the interpreter constraint, not a dependency.
  if (isFilledObject(deps) && Object.keys(deps as object).some((k) => k !== 'python')) return true;
  if (isFilledObject(own(poetry, 'dev-dependencies'))) return true;
  const group = own(poetry, 'group');
  if (typeof group === 'object' && group !== null && !Array.isArray(group)) {
    for (const name of Object.keys(group)) {
      if (isFilledObject(own(own(group, name), 'dependencies'))) return true;
    }
  }
  return false;
}

function hasPep(root: unknown): boolean {
  const project = own(root, 'project');
  const deps = own(project, 'dependencies');
  if (Array.isArray(deps) && deps.length > 0) return true;
  if (isFilledObject(own(project, 'optional-dependencies'))) return true;
  return isFilledObject(own(root, 'dependency-groups'));
}

/**
 * Tells Poetry tables from PEP 621 tables in a pyproject.toml text.
 * Only table presence counts. Returns null for invalid TOML, over-long text or no table. Never throws.
 */
export function detectPyprojectTool(text: string): PyprojectTool | null {
  try {
    if (typeof text !== 'string' || text.length > CONSTANTS.MAX_MANIFEST_LENGTH) return null;
    const parsed = parseToml(text);
    if (!parsed.ok) return null;
    const poetry = hasPoetry(parsed.value);
    const pep = hasPep(parsed.value);
    if (poetry && pep) return 'mixed';
    if (poetry) return 'poetry';
    return pep ? 'pep621' : null;
  } catch {
    return null;
  }
}
