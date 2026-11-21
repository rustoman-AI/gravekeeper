// Poetry collector of pyproject.toml (design: "core/parsers/pyproject-poetry.ts").
//
// Ranks are [tableOrdinal, groupIndex, entryIndex] plus an element index for an array value (design: "Table ranks"):
//   3 [tool.poetry.dependencies], 4 [tool.poetry.group.<name>.dependencies], 5 [tool.poetry.dev-dependencies].
//
// Self_Reference (Requirement 3.7) is a rule of PEP_508_Entry only; the design gives the Poetry collector no
// context, so it is not applied here.
import { isNameToken, normalizePypiName } from '../formats/requirements-lexical';
import { poetryToPep440 } from '../formats/poetry-constraint';
import type { Scope, SourceKind } from '../model';
import {
  type Collector,
  bounded,
  hasLoneSurrogate,
  isTable,
  ownValue,
  quoted,
} from './pyproject-collector';

const ORDINAL_DEPENDENCIES = 3;
const ORDINAL_GROUPS = 4;
const ORDINAL_DEV = 5;

/** One readable entry: the stored spec, the source kind and the `optional = true` flag. */
interface PoetryEntry {
  readonly versionSpec: string;
  readonly sourceKind: SourceKind;
  readonly optional: boolean;
}

// Requirement 5.9
function wrongType(where: string, key: string): string {
  return `${where}: value of ${quoted(key)} is not a constraint string, a table or an array of tables; the entry was skipped.`;
}

// Requirement 5.5 to 5.7, 6.7, 6.8, 6.9
/** Reads one string or table value into an entry, or pushes a warning and returns null. */
function interpretOne(
  value: unknown,
  key: string,
  where: string,
  rawName: string,
  out: Collector,
): PoetryEntry | null {
  let constraint: string;
  let optional = false;

  if (typeof value === 'string') {
    // Requirement 5.5
    constraint = value;
  } else if (isTable(value)) {
    // Requirement 5.7: git wins over path, path over url; the value is the versionSpec.
    for (const [field, sourceKind] of [
      ['git', 'git'],
      ['path', 'path'],
      ['url', 'git'], // design D14: a remote archive is stored as `git`
    ] as const) {
      if (!Object.hasOwn(value, field)) continue;
      const target = ownValue(value, field);
      // Requirement 5.9 (also a lone surrogate, which cannot be stored)
      if (typeof target !== 'string' || hasLoneSurrogate(target)) {
        out.warnings.push(wrongType(where, field));
        return null;
      }
      return { versionSpec: target, sourceKind, optional: ownValue(value, 'optional') === true };
    }
    // Requirement 5.6: `optional = true` and `version`; every other key is ignored
    optional = ownValue(value, 'optional') === true;
    if (Object.hasOwn(value, 'version')) {
      const version = ownValue(value, 'version');
      if (typeof version !== 'string') {
        // Requirement 5.9
        out.warnings.push(wrongType(where, 'version'));
        return null;
      }
      constraint = version;
    } else {
      // Requirement 5.6: a missing `version` means `*`
      constraint = '*';
    }
  } else {
    // Requirement 5.9
    out.warnings.push(wrongType(where, key));
    return null;
  }

  // Requirement 2.7: a lone surrogate cannot be stored
  if (hasLoneSurrogate(constraint)) {
    out.warnings.push(wrongType(where, key));
    return null;
  }

  // Requirement 6
  const translation = poetryToPep440(constraint);
  if (translation.kind === 'ok') {
    // Requirement 6.9: `*` or empty gives `*` and no warning
    return { versionSpec: translation.spec, sourceKind: 'registry', optional };
  }
  if (translation.kind === 'alternatives') {
    // Requirement 6.7
    out.warnings.push(
      `${where}: constraint ${quoted(constraint)} of ${quoted(rawName)} uses || alternatives that PEP 440 cannot express; the package is checked at any version.`,
    );
  } else {
    // Requirement 6.8
    out.warnings.push(
      `${where}: constraint ${quoted(constraint)} of ${quoted(rawName)} could not be translated to a PEP 440 range; the package is checked at any version.`,
    );
  }
  return { versionSpec: '*', sourceKind: 'registry', optional };
}

// Requirement 5.1 to 5.10, 7.1 to 7.3, 8.1, 8.2
/** Reads one Poetry dependency table. `mainTable` allows `optional = true` to change the scope. */
function readTable(
  table: unknown,
  path: string,
  ordinal: number,
  groupIndex: number,
  scope: Scope,
  mainTable: boolean,
  out: Collector,
): void {
  const where = `pyproject.toml table [${path}]`;
  // Requirement 2.4
  if (!isTable(table)) {
    out.warnings.push(`${where} is not a table; it was skipped.`);
    return;
  }

  Object.entries(table).forEach(([key, value], entryIndex) => {
    // Requirement 5.4: `python` is the interpreter constraint, not a package
    if (normalizePypiName(key) === 'python') return;
    // Requirement 5.10
    if (!isNameToken(key)) {
      out.warnings.push(`${where}: entry ${quoted(key)} is not a valid package name; it was skipped.`);
      return;
    }

    const name = normalizePypiName(key);
    const push = (entry: PoetryEntry, rank: readonly number[]): void => {
      out.candidates.push({
        dependency: {
          // Requirement 7.1, 7.2, 7.3
          name,
          rawName: key,
          ecosystem: 'pypi',
          versionSpec: entry.versionSpec,
          // Requirement 5.1, 5.2, 5.3, 8.1
          scope: mainTable && entry.optional ? 'optional' : scope,
          sourceKind: entry.sourceKind,
        },
        // Requirement 8.2
        rank,
        where,
      });
    };

    // Requirement 5.8: an array of tables gives consecutive ranks, one element index each
    if (Array.isArray(value)) {
      value.forEach((element: unknown, elementIndex) => {
        if (!isTable(element)) {
          // Requirement 5.9
          out.warnings.push(wrongType(where, key));
          return;
        }
        const entry = interpretOne(element, key, where, key, out);
        if (entry !== null) push(entry, [ordinal, groupIndex, entryIndex, elementIndex]);
      });
      return;
    }

    const entry = interpretOne(value, key, where, key, out);
    if (entry !== null) push(entry, [ordinal, groupIndex, entryIndex]);
  });
}

// Requirement 5.1, 5.2, 5.3, 2.4, 2.5
/** Reads `[tool.poetry]`: the main, group and legacy dev tables. A missing table is not an error. */
export function collectPoetry(poetry: unknown, out: Collector): void {
  // Requirement 2.4
  if (!isTable(poetry)) {
    out.warnings.push('pyproject.toml table [tool.poetry] is not a table; it was skipped.');
    return;
  }

  // Requirement 5.1, 8.2: rank table 3
  if (Object.hasOwn(poetry, 'dependencies')) {
    readTable(
      ownValue(poetry, 'dependencies'),
      'tool.poetry.dependencies',
      ORDINAL_DEPENDENCIES,
      0,
      'runtime',
      true,
      out,
    );
  }

  // Requirement 5.2, 8.2: rank table 4; the group name is only a label
  if (Object.hasOwn(poetry, 'group')) {
    const groups = ownValue(poetry, 'group');
    if (!isTable(groups)) {
      // Requirement 2.4
      out.warnings.push('pyproject.toml table [tool.poetry.group] is not a table; it was skipped.');
    } else {
      Object.entries(groups).forEach(([group, body], groupIndex) => {
        const groupPath = `tool.poetry.group.${bounded(group)}`;
        if (!isTable(body)) {
          // Requirement 2.4
          out.warnings.push(`pyproject.toml table [${groupPath}] is not a table; it was skipped.`);
          return;
        }
        if (!Object.hasOwn(body, 'dependencies')) return;
        readTable(
          ownValue(body, 'dependencies'),
          `${groupPath}.dependencies`,
          ORDINAL_GROUPS,
          groupIndex,
          'dev',
          false,
          out,
        );
      });
    }
  }

  // Requirement 5.3, 8.2: rank table 5
  if (Object.hasOwn(poetry, 'dev-dependencies')) {
    readTable(
      ownValue(poetry, 'dev-dependencies'),
      'tool.poetry.dev-dependencies',
      ORDINAL_DEV,
      0,
      'dev',
      false,
      out,
    );
  }
}
