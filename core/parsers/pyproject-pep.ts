// PEP 621 and PEP 735 collectors of pyproject.toml (design: "core/parsers/pyproject-pep.ts").
//
// Ranks are [tableOrdinal, groupIndex, entryIndex] (design: "Table ranks"):
//   0 [project].dependencies, 1 [project.optional-dependencies].<extra>, 2 [dependency-groups].<group>.
import { normalizePypiName } from '../formats/requirements-lexical';
import type { Scope } from '../model';
import { parsePep508 } from './pep508';
import {
  type Collector,
  type PyprojectContext,
  bounded,
  hasLoneSurrogate,
  isTable,
  ownValue,
  quoted,
} from './pyproject-collector';

const ORDINAL_DEPENDENCIES = 0;
const ORDINAL_OPTIONAL = 1;
const ORDINAL_GROUPS = 2;

/** Short, fixed description of a non-string value, used where a requirement text is expected. */
function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  return typeof value === 'object' ? 'table' : typeof value;
}

// Requirement 3.1 to 3.7
/** Reads one PEP_508_Entry (a list element) into a candidate or a warning. */
function readEntry(
  value: unknown,
  tablePath: string,
  scope: Scope,
  rank: readonly number[],
  ctx: PyprojectContext,
  out: Collector,
): void {
  const where = `pyproject.toml table [${tablePath}]`;

  // Requirement 3.6: an element that is not a string is skipped with the cannot-parse warning.
  if (typeof value !== 'string') {
    out.warnings.push(`${where}: cannot parse requirement ${quoted(`<${describeValue(value)}>`)}.`);
    return;
  }

  const parsed = parsePep508(value);
  // Requirement 3.6: unreadable text, and text with a backslash.
  if (parsed.kind === 'cannot-parse') {
    out.warnings.push(`${where}: cannot parse requirement ${quoted(value)}.`);
    return;
  }
  if (parsed.kind === 'backslash') {
    out.warnings.push(`${where}: requirement contains a backslash and was skipped: ${quoted(value)}.`);
    return;
  }
  // Requirement 2.7: a lone surrogate in the specifier or target cannot be stored; treat it as unreadable.
  if (hasLoneSurrogate(parsed.versionSpec)) {
    out.warnings.push(`${where}: cannot parse requirement ${quoted(value)}.`);
    return;
  }

  // Requirement 7.1
  const name = normalizePypiName(parsed.rawName);

  // Requirement 3.7: Self_Reference
  if (ctx.projectName !== null && name === ctx.projectName) {
    out.warnings.push(`${where}: ${quoted(parsed.rawName)} refers to this project itself and was skipped.`);
    return;
  }

  out.candidates.push({
    dependency: {
      // Requirement 7.1, 7.2, 7.3
      name,
      rawName: parsed.rawName,
      ecosystem: 'pypi',
      // Requirement 3.5: the specifier text is kept as it is, an empty one is already `*`.
      versionSpec: parsed.versionSpec,
      // Requirement 3.1, 3.2, 4.1, 8.1
      scope,
      sourceKind: parsed.sourceKind,
    },
    // Requirement 8.2
    rank,
    // Requirement 3.3: the table path (with the extra name) is the duplicate-warning location.
    where,
  });
}

// Requirement 3.1, 3.2, 3.3, 2.4, 2.5
/** Reads `[project].dependencies` (scope `runtime`) and `[project.optional-dependencies]` (scope `optional`). */
export function collectPep621(project: unknown, ctx: PyprojectContext, out: Collector): void {
  // Requirement 2.4
  if (!isTable(project)) {
    out.warnings.push('pyproject.toml table [project] is not a table; it was skipped.');
    return;
  }

  // Requirement 3.1, 8.2: rank table 0
  if (Object.hasOwn(project, 'dependencies')) {
    const list = ownValue(project, 'dependencies');
    if (!Array.isArray(list)) {
      // Requirement 2.4
      out.warnings.push('pyproject.toml table [project.dependencies] is not a list; it was skipped.');
    } else {
      list.forEach((element: unknown, index) => {
        readEntry(element, 'project.dependencies', 'runtime', [ORDINAL_DEPENDENCIES, 0, index], ctx, out);
      });
    }
  }

  // Requirement 3.2, 8.2: rank table 1, the extra name is only a label and never the scope
  if (Object.hasOwn(project, 'optional-dependencies')) {
    const extras = ownValue(project, 'optional-dependencies');
    if (!isTable(extras)) {
      // Requirement 2.4
      out.warnings.push('pyproject.toml table [project.optional-dependencies] is not a table; it was skipped.');
    } else {
      Object.entries(extras).forEach(([extra, list], extraIndex) => {
        const path = `project.optional-dependencies.${bounded(extra)}`;
        if (!Array.isArray(list)) {
          // Requirement 2.4
          out.warnings.push(`pyproject.toml table [${path}] is not a list; it was skipped.`);
          return;
        }
        list.forEach((element: unknown, index) => {
          readEntry(element, path, 'optional', [ORDINAL_OPTIONAL, extraIndex, index], ctx, out);
        });
      });
    }
  }
}

// Requirement 4.1 to 4.4, 2.4, 2.5
/** Reads `[dependency-groups]`: every group gives scope `dev`; `include-group` entries are skipped, never resolved. */
export function collectPep735(groups: unknown, ctx: PyprojectContext, out: Collector): void {
  // Requirement 2.4
  if (!isTable(groups)) {
    out.warnings.push('pyproject.toml table [dependency-groups] is not a table; it was skipped.');
    return;
  }

  Object.entries(groups).forEach(([group, list], groupIndex) => {
    const path = `dependency-groups.${bounded(group)}`;
    if (!Array.isArray(list)) {
      // Requirement 2.4
      out.warnings.push(`pyproject.toml table [${path}] is not a list; it was skipped.`);
      return;
    }
    list.forEach((element: unknown, index) => {
      if (typeof element === 'string') {
        // Requirement 4.1, 8.2: rank table 2
        readEntry(element, path, 'dev', [ORDINAL_GROUPS, groupIndex, index], ctx, out);
        return;
      }
      // Requirement 4.2, 4.4: an Include_Entry is skipped with one warning, its group is never read, so a
      // missing target or a cycle cannot be an error.
      if (isTable(element)) {
        const include = ownValue(element, 'include-group');
        if (typeof include === 'string') {
          out.warnings.push(
            `pyproject.toml table [${path}]: include-group ${quoted(include)} was skipped; groups are not resolved.`,
          );
          return;
        }
      }
      // Requirement 4.3: any other table, an include-group that is not a string, or a non-string element.
      out.warnings.push(
        `pyproject.toml table [${path}]: entry ${index} is not a requirement string or an include-group table; it was skipped.`,
      );
    });
  });
}
