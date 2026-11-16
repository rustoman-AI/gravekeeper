import type { SourceKind } from '../model';

const PATH_PREFIXES = ['file:', 'link:', 'workspace:'] as const;
const GIT_PREFIXES = ['git+', 'git://', 'github:', 'gitlab:', 'bitbucket:'] as const;

function startsWithAny(value: string, prefixes: readonly string[]): boolean {
  for (const prefix of prefixes) {
    if (value.startsWith(prefix)) return true;
  }
  return false;
}

// One linear scan: true when s is non-empty and made only of [A-Za-z0-9._-].
function isShorthandPart(s: string): boolean {
  if (s.length === 0) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const ok =
      (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c === 0x2e || c === 0x5f || c === 0x2d;
    if (!ok) return false;
  }
  return true;
}

function isGithubShorthand(spec: string): boolean {
  const hash = spec.indexOf('#');
  const head = hash === -1 ? spec : spec.slice(0, hash);
  const slash = head.indexOf('/');
  if (slash === -1 || head.indexOf('/', slash + 1) !== -1) return false;
  return isShorthandPart(head.slice(0, slash)) && isShorthandPart(head.slice(slash + 1));
}

// Requirement 1.9
/** Classifies an npm version spec by its exact text: path, git or registry. */
export function sourceKindOfNpmSpec(spec: string): SourceKind {
  if (startsWithAny(spec, PATH_PREFIXES)) return 'path';
  if (startsWithAny(spec, GIT_PREFIXES)) return 'git';
  if (isGithubShorthand(spec)) return 'git';
  return 'registry';
}
