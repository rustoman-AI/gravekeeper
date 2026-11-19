/*
 * Cargo version requirement to semver range (Requirement 4).
 *
 * `V` is a version of one to three decimal parts (MAJOR, MAJOR.MINOR,
 * MAJOR.MINOR.PATCH, no leading zeros). A prerelease or build suffix is
 * accepted only after a full triple.
 *
 * | Cargo part                      | semver comparator    | Example (Cargo to semver, and what it selects)                                                              |
 * |---------------------------------|----------------------|-------------------------------------------------------------------------------------------------------------|
 * | `V` (no operator)               | `^V`                 | `1.2.3` to `^1.2.3` (`>=1.2.3 <2.0.0`); `0.2` to `^0.2` (`>=0.2.0 <0.3.0`); `0.0.3` to `^0.0.3` (only 0.0.3) |
 * | `^V`                            | `^V`                 | `^1.2` to `^1.2` (`>=1.2.0 <2.0.0`)                                                                         |
 * | `~V`                            | `~V`                 | `~1.2.3` to `~1.2.3` (`>=1.2.3 <1.3.0`); `~1` to `~1` (`>=1.0.0 <2.0.0`)                                   |
 * | `=V`                            | `=V`                 | `=1.2` to `=1.2` (`>=1.2.0 <1.3.0`)                                                                         |
 * | `>V`, `>=V`, `<V`, `<=V`        | same                 | `>1.2` (`>=1.3.0`); `<=1.2` (`<1.3.0`)                                                                      |
 * | `*`                             | `*`                  | any version                                                                                                 |
 * | `1.*`, `1.2.*` (no operator)    | same                 | `1.*` (`>=1.0.0 <2.0.0`)                                                                                    |
 * | `A, B` (comma)                  | `A B` (space is AND) | `>=1.2, <1.5` to `>=1.2 <1.5`                                                                               |
 *
 * Whitespace around a part and between an operator and its version is
 * removed. A wildcard is accepted without an operator or with `=` only.
 * Rejected (null): an empty part (also a trailing comma), `||`, a hyphen
 * range, a leading `v`, `x` or `X` as wildcard, a wildcard with an operator
 * other than `=`, comparators separated by a space without a comma, a
 * version with a leading zero, and anything else that is not in this table.
 */

const NUMBER = '(?:0|[1-9][0-9]*)';
const IDENT = '[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*';
const VERSION = new RegExp(
  `^${NUMBER}(?:\\.${NUMBER}(?:\\.${NUMBER}(?:-${IDENT})?(?:\\+${IDENT})?)?)?$`,
);
const WILDCARD = new RegExp(`^(?:\\*|${NUMBER}\\.\\*|${NUMBER}\\.${NUMBER}\\.\\*)$`);
const PART = /^(\^|~|=|<=|>=|<|>)?\s*(.+)$/;

function convertPart(raw: string): string | null {
  const part = raw.trim();
  if (part === '') return null;
  const match = PART.exec(part);
  if (match === null) return null;
  const operator = match[1] ?? '';
  const rest = match[2] ?? '';
  if (WILDCARD.test(rest)) {
    return operator === '' || operator === '=' ? operator + rest : null;
  }
  if (!VERSION.test(rest)) return null;
  return (operator === '' ? '^' : operator) + rest;
}

/**
 * Converts a Cargo version requirement into a semver range string, or null
 * when the requirement is not in the table above. Total: never throws.
 */
// Requirement 4.1 to 4.8, 4.11
export function cargoToSemverRange(requirement: string): string | null {
  try {
    if (typeof requirement !== 'string') return null;
    const converted: string[] = [];
    for (const part of requirement.split(',')) {
      const comparator = convertPart(part);
      if (comparator === null) return null;
      converted.push(comparator);
    }
    return converted.join(' ');
  } catch {
    return null;
  }
}
