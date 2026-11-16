// package.json parser (design: "package.json parser").
//
// Requirement 1.11 exception: JSON.parse returns one value per key, the last one in the text, so a key
// repeated inside one section never yields two candidates. The last value wins and no duplicate warning
// is added. This is the only exception to criterion 4.6.
//
// Reads use Object.hasOwn and Object.entries only, so inherited properties are never picked up and the
// names __proto__, constructor and prototype are ordinary entries (Requirement 4.9).
import { sourceKindOfNpmSpec } from '../formats/npm-source-kind';
import type { Scope } from '../model';
import type { Candidate, RawParse } from './finish';

const SECTIONS: readonly (readonly [section: string, scope: Scope])[] = [
  ['dependencies', 'runtime'],
  ['devDependencies', 'dev'],
  ['optionalDependencies', 'optional'],
  ['peerDependencies', 'peer'],
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failure(message: string): RawParse {
  return { candidates: [], warnings: [`package.json is not valid JSON: ${message}`] };
}

/** Parses package.json text into ranked candidates and warnings. Never throws. */
export function parsePackageJson(text: string): RawParse {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch (error) {
    // Requirement 1.6 (invalid or empty text)
    return failure(error instanceof Error ? error.message : String(error));
  }
  // Requirement 1.6 (top-level value is not an object)
  if (!isPlainObject(root)) return failure('the top-level value is not a JSON object.');

  const candidates: Candidate[] = [];
  const warnings: string[] = [];

  for (const [section, scope] of SECTIONS) {
    // Requirements 1.1, 1.2, 4.9: own-property read only
    if (!Object.hasOwn(root, section)) continue;
    const entries: unknown = root[section];
    // Requirement 1.5
    if (!isPlainObject(entries)) {
      warnings.push(`package.json: section "${section}" is not a JSON object; it was skipped.`);
      continue;
    }
    for (const [name, value] of Object.entries(entries)) {
      // Requirement 4.10
      if (name.length === 0) {
        warnings.push(`package.json section "${section}": entry with an empty name was skipped.`);
        continue;
      }
      // Requirement 1.4
      if (typeof value !== 'string') {
        warnings.push(`package.json section "${section}": value of "${name}" is not a string; the entry was skipped.`);
        continue;
      }
      // Requirements 1.1, 1.2, 1.3, 1.8, 1.9, 1.10, 1.12, 4.9: versionSpec untouched, rawName equal to name
      candidates.push({
        dependency: {
          name,
          rawName: name,
          ecosystem: 'npm',
          versionSpec: value,
          scope,
          sourceKind: sourceKindOfNpmSpec(value),
        },
        rank: [],
        where: `package.json section "${section}"`,
      });
    }
  }

  return { candidates, warnings };
}
