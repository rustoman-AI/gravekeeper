import { SCOPE_ORDER } from '../model';
import type { Scope, SerializableDependency } from '../model';

const SECTION_BY_SCOPE: Readonly<Partial<Record<Scope, string>>> = {
  runtime: 'dependencies',
  dev: 'devDependencies',
  optional: 'optionalDependencies',
  peer: 'peerDependencies',
};

// Requirement 5.3, 5.4, 5.12, 5.18
/**
 * Writes `package.json` text from a list already filtered, sorted and deduplicated (Dependency_Order).
 * Sections appear in SCOPE_ORDER, each once, with its entries in the given (name) order.
 * The text is built from `JSON.stringify(string)` fragments; no object is keyed by a manifest-controlled name.
 */
export function writePackageJson(sorted: readonly SerializableDependency[]): string {
  const sections: string[] = [];
  for (const scope of SCOPE_ORDER) {
    const section = SECTION_BY_SCOPE[scope];
    if (section === undefined) continue;
    const lines: string[] = [];
    for (const d of sorted) {
      if (d.scope === scope) lines.push(`    ${JSON.stringify(d.name)}: ${JSON.stringify(d.versionSpec)}`);
    }
    if (lines.length > 0) sections.push(`  ${JSON.stringify(section)}: {\n${lines.join(',\n')}\n  }`);
  }
  if (sections.length === 0) return '{}\n';
  return `{\n${sections.join(',\n')}\n}\n`;
}
