// Cargo.toml parser (design: "Cargo.toml parser").
//
// smol-toml returns plain objects and no source positions, so candidates are ranked
// [tableOrdinal, enumIndex] instead of by line (Requirement 3.18). All reads use Object.hasOwn and
// Object.entries, so inherited properties are never picked up and __proto__ is an ordinary key (4.9).
import type { Scope, SourceKind } from '../model';
import type { Candidate, RawParse } from './finish';
import { parseToml } from './toml-tree';

// Requirement 3.1, 3.3, 3.8: the scope depends only on the table name.
const TABLES: readonly (readonly [table: string, scope: Scope])[] = [
  ['dependencies', 'runtime'],
  ['dev-dependencies', 'dev'],
  ['build-dependencies', 'build'],
];

const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

function isTable(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function ownValue(table: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

interface Entry {
  readonly name: string;
  readonly versionSpec: string;
  readonly sourceKind: SourceKind;
}

/** Interprets one dependency value; returns an Entry or a warning reason. */
function interpret(key: string, value: unknown): Entry | string {
  // Requirement 3.4
  if (typeof value === 'string') return { name: key, versionSpec: value, sourceKind: 'registry' };
  // Requirement 3.14
  if (!isTable(value)) return `value of "${key}" is neither a string nor a table; the entry was skipped.`;
  const version = ownValue(value, 'version');
  const pkg = ownValue(value, 'package');
  const git = ownValue(value, 'git');
  const path = ownValue(value, 'path');
  // Requirement 3.10
  for (const field of [version, pkg, git, path]) {
    if (field !== undefined && typeof field !== 'string') {
      return `"${key}" has a version, package, git or path value that is not a string; the entry was skipped.`;
    }
  }
  // Requirement 3.7, 3.17: rawName equals name, no normalization.
  const name = typeof pkg === 'string' ? pkg : key;
  // Requirement 3.11, 3.12, 3.5, 3.6
  if (typeof git === 'string') return { name, versionSpec: git, sourceKind: 'git' };
  if (typeof path === 'string') return { name, versionSpec: path, sourceKind: 'path' };
  return { name, versionSpec: typeof version === 'string' ? version : '*', sourceKind: 'registry' };
}

function collect(
  table: unknown,
  tablePath: string,
  scope: Scope,
  ordinal: number,
  candidates: Candidate[],
  warnings: string[],
): void {
  // Requirement 3.14
  if (!isTable(table)) {
    warnings.push(`Cargo.toml table [${tablePath}] is not a table; it was skipped.`);
    return;
  }
  const where = `Cargo.toml table [${tablePath}]`;
  Object.entries(table).forEach(([key, value], index) => {
    const result = interpret(key, value);
    if (typeof result === 'string') {
      warnings.push(`${where}: ${result}`);
      return;
    }
    // Requirement 4.10
    if (result.name.length === 0) {
      warnings.push(`${where}: entry "${key}" has an empty name; it was skipped.`);
      return;
    }
    // Requirement 3.16
    if (LONE_SURROGATE.test(result.name) || LONE_SURROGATE.test(result.versionSpec)) {
      warnings.push(`${where}: entry "${key}" contains a lone surrogate; it was skipped.`);
      return;
    }
    candidates.push({
      dependency: {
        name: result.name,
        rawName: result.name,
        ecosystem: 'cargo',
        versionSpec: result.versionSpec,
        scope,
        sourceKind: result.sourceKind,
      },
      // Requirement 3.18
      rank: [ordinal, index],
      // Requirement 3.19
      where,
    });
  });
}

/** Parses Cargo.toml text into ranked candidates and warnings. Never throws. */
export function parseCargoToml(text: string): RawParse {
  const parsed = parseToml(text);
  // Requirement 3.9: the line is included only when smol-toml provided it.
  if (!parsed.ok) {
    const { message, line } = parsed.error;
    const suffix = line === undefined ? '' : ` (line ${line})`;
    return { candidates: [], warnings: [`Cargo.toml is not valid TOML: ${message}${suffix}`] };
  }
  const root = parsed.value;
  const candidates: Candidate[] = [];
  const warnings: string[] = [];

  // Requirement 3.1, 3.3: top-level tables have ordinal 0.
  for (const [name, scope] of TABLES) {
    if (Object.hasOwn(root, name)) collect(root[name], name, scope, 0, candidates, warnings);
  }

  // Requirement 3.8, 3.14, 3.18
  if (Object.hasOwn(root, 'target')) {
    const target: unknown = root['target'];
    if (!isTable(target)) {
      warnings.push('Cargo.toml table [target] is not a table; it was skipped.');
    } else {
      Object.entries(target).forEach(([cfg, cfgTable], k) => {
        if (!isTable(cfgTable)) {
          warnings.push(`Cargo.toml table [target.'${cfg}'] is not a table; it was skipped.`);
          return;
        }
        for (const [name, scope] of TABLES) {
          if (Object.hasOwn(cfgTable, name)) {
            collect(cfgTable[name], `target.'${cfg}'.${name}`, scope, 1 + k, candidates, warnings);
          }
        }
      });
    }
  }

  return { candidates, warnings };
}
