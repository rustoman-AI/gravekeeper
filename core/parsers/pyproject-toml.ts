// pyproject.toml parser entry (design: "core/parsers/pyproject-toml.ts").
//
// Parses the TOML, decides whether the file has any dependency table, and calls the three collectors in
// Table_Rank order. Candidates carry [tableOrdinal, groupIndex, entryIndex] ranks, so `finish` keeps the
// first occurrence per (name, scope) in the order PEP 621, PEP 735, Poetry and adds one duplicate warning
// per discarded candidate (Requirement 8.2, 8.3), exactly as it does for Cargo.toml. Nothing here throws:
// parseToml returns a Result and the collectors read with Object.hasOwn (Requirement 2.7).
import { normalizePypiName } from '../formats/requirements-lexical';
import type { Candidate, RawParse } from './finish';
import { type Collector, type PyprojectContext, isTable, ownValue } from './pyproject-collector';
import { collectPep621, collectPep735 } from './pyproject-pep';
import { collectPoetry } from './pyproject-poetry';
import { parseToml } from './toml-tree';

/** True when `[project].dynamic` is an array that lists the string "dependencies". */
function declaresDynamicDependencies(project: Record<string, unknown>): boolean {
  const dynamic = ownValue(project, 'dynamic');
  return Array.isArray(dynamic) && dynamic.includes('dependencies');
}

/** True when `[tool.poetry.group]` holds a dependencies table, or is malformed (the collector then warns). */
function hasPoetryGroupTable(poetry: Record<string, unknown>): boolean {
  if (!Object.hasOwn(poetry, 'group')) return false;
  const groups = ownValue(poetry, 'group');
  if (!isTable(groups)) return true;
  return Object.values(groups).some((body) => !isTable(body) || Object.hasOwn(body, 'dependencies'));
}

/** Parses pyproject.toml text into ranked candidates and warnings. Never throws. */
export function parsePyprojectToml(text: string): RawParse {
  const parsed = parseToml(text);
  // Requirement 2.1: one warning, and the line only when the TOML parser supplied one.
  if (!parsed.ok) {
    const { message, line } = parsed.error;
    const suffix = line === undefined ? '' : ` (line ${line})`;
    return { candidates: [], warnings: [`pyproject.toml is not valid TOML: ${message}${suffix}`] };
  }
  const root = parsed.value;

  const projectValue: unknown = Object.hasOwn(root, 'project') ? root['project'] : undefined;
  const project = isTable(projectValue) ? projectValue : null;
  const toolValue: unknown = Object.hasOwn(root, 'tool') ? root['tool'] : undefined;
  const poetryValue: unknown = isTable(toolValue) ? ownValue(toolValue, 'poetry') : undefined;
  const poetry = isTable(poetryValue) ? poetryValue : null;

  // Requirement 3.7: the project name for the Self_Reference rule.
  const name = project === null ? undefined : ownValue(project, 'name');
  const ctx: PyprojectContext = { projectName: typeof name === 'string' ? normalizePypiName(name) : null };

  // Requirement 2.3: dependencies declared dynamic, with no `dependencies` key.
  const dynamicDependencies =
    project !== null && !Object.hasOwn(project, 'dependencies') && declaresDynamicDependencies(project);

  // Requirement 2.2 (Dependency_Table_Present): any Pyproject_Table key, with any value type, or dynamic
  // dependencies. A parent of the wrong type counts as present, because its own warning (Requirement 2.4)
  // already explains the empty result.
  const hasPep621 =
    projectValue !== undefined &&
    (project === null || Object.hasOwn(project, 'dependencies') || Object.hasOwn(project, 'optional-dependencies'));
  const hasPep735 = Object.hasOwn(root, 'dependency-groups');
  const hasPoetry =
    poetryValue !== undefined &&
    (poetry === null ||
      Object.hasOwn(poetry, 'dependencies') ||
      Object.hasOwn(poetry, 'dev-dependencies') ||
      hasPoetryGroupTable(poetry));
  const present = hasPep621 || hasPep735 || hasPoetry || dynamicDependencies;

  const candidates: Candidate[] = [];
  const warnings: string[] = [];
  const out: Collector = { candidates, warnings };

  // Requirement 8.5: collectors run in Table_Rank order, and each is called only when its key exists
  // because it emits its own wrong-type warning (Requirement 2.4).
  if (projectValue !== undefined) collectPep621(projectValue, ctx, out);
  if (dynamicDependencies) {
    warnings.push('pyproject.toml: [project] declares its dependencies as dynamic; they cannot be read from this file.');
  }
  if (hasPep735) collectPep735(root['dependency-groups'], ctx, out);
  if (poetryValue !== undefined) collectPoetry(poetryValue, out);

  // Requirement 2.2
  if (!present) {
    warnings.push(
      'pyproject.toml has no dependency tables ([project], [dependency-groups] or [tool.poetry]); no dependencies were read.',
    );
  }

  return { candidates, warnings };
}
