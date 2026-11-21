import { MANIFEST_FORMATS } from '../formats/manifest-format';
import { guard } from '../internal/safe';
import { CONSTANTS } from '../model';
import type { ManifestFormat, ParseResult } from '../model';
import { parseCargoToml } from './cargo-toml';
import { finish } from './finish';
import type { RawParse } from './finish';
import { parsePackageJson } from './package-json';
import { parsePyprojectToml } from './pyproject-toml';
import { parseRequirementsTxt } from './requirements-txt';

/** Format parsers by Manifest_Format. Formats without an entry are reported as unsupported. */
const PARSERS: Readonly<Partial<Record<ManifestFormat, (text: string) => RawParse>>> = {
  'package.json': parsePackageJson,
  'requirements.txt': parseRequirementsTxt,
  'pyproject.toml': parsePyprojectToml,
  'Cargo.toml': parseCargoToml,
};

const MAX_DESCRIBE_LENGTH = 80;

function emptyWith(warning: string): ParseResult {
  return { dependencies: [], warnings: [warning] };
}

// Requirement 4.3
/** `"null"`, `"array"`, or the `typeof` result. */
function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

// Requirement 4.1
function isManifestFormat(format: unknown): format is ManifestFormat {
  return typeof format === 'string' && (MANIFEST_FORMATS as readonly string[]).includes(format);
}

/** Bounded description of an unsupported format value for a warning. */
function describe(value: unknown): string {
  if (typeof value !== 'string') return typeOf(value);
  const points = Array.from(value);
  const shown = points.length <= MAX_DESCRIBE_LENGTH ? value : `${points.slice(0, MAX_DESCRIBE_LENGTH - 1).join('')}\u2026`;
  return JSON.stringify(shown);
}

/** Warning text for the safety net: the error name only, never a stack or input text. */
function internalErrorWarning(error: unknown): string {
  let name = 'unknown';
  try {
    if (error instanceof Error && typeof error.name === 'string') name = error.name;
  } catch {
    name = 'unknown';
  }
  return `Internal error while parsing: ${name}`;
}

function parseUnguarded(text: unknown, format: unknown): ParseResult {
  // Requirement 4.1: the format is validated first and never inferred from the text.
  if (!isManifestFormat(format)) return emptyWith(`Unsupported manifest format: ${describe(format)}.`);
  // Requirement 4.3
  if (typeof text !== 'string') return emptyWith(`Manifest input must be a string, received ${typeOf(text)}.`);
  // Requirement 4.4
  if (text.length > CONSTANTS.MAX_MANIFEST_LENGTH) {
    return emptyWith(
      `Manifest is longer than ${CONSTANTS.MAX_MANIFEST_LENGTH} characters (MAX_MANIFEST_LENGTH); nothing was parsed.`,
    );
  }
  const parser = PARSERS[format];
  if (parser === undefined) return emptyWith(`Unsupported manifest format: ${describe(format)}.`);
  return finish(parser(text));
}

// Requirement 4.1, 4.3, 4.4, 4.7
/** Parses manifest text of the given format. Never throws; failures become warnings. */
export function parseManifest(text: unknown, format: ManifestFormat): ParseResult {
  return guard(
    () => parseUnguarded(text, format),
    (error) => ({ dependencies: [], warnings: [internalErrorWarning(error)] }),
  );
}
