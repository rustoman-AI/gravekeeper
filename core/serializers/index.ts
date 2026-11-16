import { compareDependencies } from '../formats/order';
import { dependencyKey } from '../formats/key';
import { ecosystemOf, MANIFEST_FORMATS, supportedScopes } from '../formats/manifest-format';
import { err, ok } from '../internal/result';
import type { Result, SerializeError } from '../internal/result';
import { guard } from '../internal/safe';
import { CONSTANTS } from '../model';
import type { ManifestFormat, SerializableDependency } from '../model';
import { writeCargoToml } from './cargo-toml';
import { writePackageJson } from './package-json';
import { writeRequirementsTxt } from './requirements-txt';
import { isRepresentable } from './representable';

/** Format writers by Manifest_Format. Each takes the filtered, sorted, deduplicated list. */
const WRITERS: Readonly<Partial<Record<ManifestFormat, (sorted: readonly SerializableDependency[]) => string>>> = {
  'package.json': writePackageJson,
  'requirements.txt': writeRequirementsTxt,
  'Cargo.toml': writeCargoToml,
};

const MAX_DESCRIBE_LENGTH = 80;

// Requirement 5.7
function isManifestFormat(format: unknown): format is ManifestFormat {
  return typeof format === 'string' && (MANIFEST_FORMATS as readonly string[]).includes(format);
}

/** Bounded description of an unsupported format value. */
function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value !== 'string') return typeof value;
  const points = Array.from(value);
  const shown = points.length <= MAX_DESCRIBE_LENGTH ? value : `${points.slice(0, MAX_DESCRIBE_LENGTH - 1).join('')}\u2026`;
  return JSON.stringify(shown);
}

/** Error name only, never a stack or input text. */
function errorName(error: unknown): string {
  try {
    if (error instanceof Error && typeof error.name === 'string') return error.name;
  } catch {
    return 'unknown';
  }
  return 'unknown';
}

// Requirement 5.2
/** A Dependency whose string fields are strings and whose rawName, when present, is a string. */
function isWellFormedDependency(d: unknown): d is SerializableDependency {
  if (typeof d !== 'object' || d === null) return false;
  const r = d as Record<string, unknown>;
  return (
    typeof r.name === 'string' &&
    typeof r.versionSpec === 'string' &&
    typeof r.ecosystem === 'string' &&
    typeof r.scope === 'string' &&
    typeof r.sourceKind === 'string' &&
    (r.rawName === undefined || typeof r.rawName === 'string')
  );
}

function serializeUnguarded(deps: unknown, format: unknown): Result<string, SerializeError> {
  // Requirement 5.7
  if (!isManifestFormat(format)) return err({ kind: 'unsupported-format', format: describe(format) });
  if (!Array.isArray(deps)) return err({ kind: 'invalid-input', message: 'Dependencies must be an array.' });
  // Requirement 5.19
  if (deps.length > CONSTANTS.MAX_SERIALIZED_DEPENDENCIES) {
    return err({ kind: 'too-many-dependencies', limit: CONSTANTS.MAX_SERIALIZED_DEPENDENCIES });
  }
  const writer = WRITERS[format];
  if (writer === undefined) return err({ kind: 'unsupported-format', format: describe(format) });

  // Requirement 5.2, step 1: filter
  const ecosystem = ecosystemOf(format);
  const scopes = supportedScopes(format);
  const kept: SerializableDependency[] = [];
  for (const d of deps as readonly unknown[]) {
    if (
      isWellFormedDependency(d) &&
      d.ecosystem === ecosystem &&
      scopes.includes(d.scope) &&
      isRepresentable(d, format)
    ) {
      kept.push(d);
    }
  }

  // Requirement 5.2, steps 2 and 3, 5.12: sort a copy, then keep the first entry per Dependency_Key
  kept.sort(compareDependencies);
  const seen = new Set<string>();
  const unique: SerializableDependency[] = [];
  for (const d of kept) {
    const key = dependencyKey(d.name, d.scope);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(d);
  }
  return ok(writer(unique));
}

// Requirement 5.1, 5.2, 5.7, 5.19
/** Serializes dependencies to manifest text of the given format. Never throws. */
export function serializeManifest(
  dependencies: readonly SerializableDependency[],
  format: unknown,
): Result<string, SerializeError> {
  return guard(
    () => serializeUnguarded(dependencies, format),
    (e) => err({ kind: 'internal-error', message: errorName(e) }),
  );
}
