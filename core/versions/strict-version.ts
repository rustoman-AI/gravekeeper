// resurrect-upgrade R5.4: the longest version string the validator accepts, in code points.
const STRICT_VERSION_MAX_LENGTH = 64;

// resurrect-upgrade R5.4: npm and cargo take a semantic version without build metadata.
const SEMVER_PATTERN =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;

// resurrect-upgrade R5.4: PyPI takes a release with optional a/b/rc, .post and .dev; no epoch, no local version.
const PEP440_PATTERN = /^[0-9]+(\.[0-9]+)*((a|b|rc)[0-9]+)?(\.post[0-9]+)?(\.dev[0-9]+)?$/;

function withinLength(text: string): boolean {
  // A code point takes at most two UTF-16 units and at least one, so this bounds the work first.
  if (text.length > STRICT_VERSION_MAX_LENGTH * 2) return false;
  return Array.from(text).length <= STRICT_VERSION_MAX_LENGTH;
}

/**
 * resurrect-upgrade R5.4, R5.5: true only for a version made of letters, digits, `.` and `-`
 * that matches the strict grammar of the ecosystem. Total: never throws.
 */
export function isStrictVersion(ecosystem: unknown, version: unknown): boolean {
  if (typeof version !== 'string') return false;
  if (!withinLength(version)) return false;
  if (ecosystem === 'npm' || ecosystem === 'cargo') return SEMVER_PATTERN.test(version);
  if (ecosystem === 'pypi') return PEP440_PATTERN.test(version);
  return false;
}
