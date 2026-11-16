import { writtenName } from '../formats/requirements-lexical';
import type { SerializableDependency } from '../model';

// Requirement 5.3, 5.6, 5.11, 5.12, 5.17
/**
 * Writes `requirements.txt` text from a list already filtered, sorted and deduplicated (Dependency_Order).
 * One line per dependency, each ending in a single `\n`, no blank lines. Empty input gives the empty string.
 */
export function writeRequirementsTxt(sorted: readonly SerializableDependency[]): string {
  let out = '';
  for (const d of sorted) {
    const written = writtenName(d);
    if (d.sourceKind === 'registry') {
      out += d.versionSpec === '*' ? `${written}\n` : `${written} ${d.versionSpec}\n`;
    } else {
      out += `${written} @ ${d.versionSpec}\n`;
    }
  }
  return out;
}
