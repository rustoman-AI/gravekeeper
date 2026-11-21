import type { Ecosystem } from '../core';

// resurrect Requirement 7.2, 10.10: name rules for curated data and for names that come from a scan.
// All patterns are linear: no nested quantifiers, and every repetition is anchored by a literal.
const NPM_MAX_LENGTH = 214;
const NPM_CURATED = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const NPM_SCAN = /^(?:@[A-Za-z0-9][A-Za-z0-9._-]*\/)?[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PYPI_NORMALIZED = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CARGO = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

// Curated data: strict names.
export function isValidName(ecosystem: Ecosystem, name: unknown): boolean {
  if (typeof name !== 'string') return false;
  switch (ecosystem) {
    case 'npm':
      return name.length <= NPM_MAX_LENGTH && NPM_CURATED.test(name);
    case 'pypi':
      return PYPI_NORMALIZED.test(name);
    case 'cargo':
      return CARGO.test(name);
    default:
      return false;
  }
}

// Names from a scan: a name that passes cannot be an option or expand in a shell.
export function isCommandSafe(ecosystem: Ecosystem, name: unknown): boolean {
  if (typeof name !== 'string') return false;
  switch (ecosystem) {
    case 'npm':
      return name.length <= NPM_MAX_LENGTH && NPM_SCAN.test(name);
    case 'pypi':
      return PYPI_NORMALIZED.test(name);
    case 'cargo':
      return CARGO.test(name);
    default:
      return false;
  }
}

// Registry-equivalent spelling. Total: a non-string gives an empty string.
export function normalizeName(ecosystem: Ecosystem, name: unknown): string {
  if (typeof name !== 'string') return '';
  switch (ecosystem) {
    case 'pypi':
      return name.toLowerCase().replace(/[-_.]+/g, '-');
    case 'cargo':
      return name.toLowerCase().replace(/_/g, '-');
    default:
      return name;
  }
}
