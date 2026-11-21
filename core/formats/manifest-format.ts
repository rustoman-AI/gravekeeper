// Shared facts about the manifest formats, used by parsers and serializers.
import type { Ecosystem, ManifestFormat, Scope } from '../model';

export const MANIFEST_FORMATS = ['package.json', 'requirements.txt', 'pyproject.toml', 'Cargo.toml'] as const satisfies readonly ManifestFormat[];

const ECOSYSTEM_BY_FORMAT: Readonly<Record<ManifestFormat, Ecosystem>> = {
  'package.json': 'npm',
  'requirements.txt': 'pypi',
  // pyproject Requirement 1.2
  'pyproject.toml': 'pypi',
  'Cargo.toml': 'cargo',
};

const SCOPES_BY_FORMAT: Readonly<Record<ManifestFormat, readonly Scope[]>> = {
  'package.json': ['runtime', 'dev', 'optional', 'peer'],
  'requirements.txt': ['runtime'],
  // pyproject Requirement 1.3
  'pyproject.toml': ['runtime', 'dev', 'optional'],
  'Cargo.toml': ['runtime', 'dev', 'build'],
};

// Requirement 4.5
export function ecosystemOf(format: ManifestFormat): Ecosystem {
  return ECOSYSTEM_BY_FORMAT[format];
}

// Requirement 5.1
/** Scopes the format can express, in SCOPE_ORDER. */
export function supportedScopes(format: ManifestFormat): readonly Scope[] {
  return SCOPES_BY_FORMAT[format];
}
