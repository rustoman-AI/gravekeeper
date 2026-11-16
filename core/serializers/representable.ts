// Representable rules of the Manifest_Serializer (design: Representable rules).
import { isNameToken, isCanonicalRequirementsSpec, normalizePypiName, writtenName } from '../formats/requirements-lexical';
import { sourceKindOfNpmSpec } from '../formats/npm-source-kind';
import type { ManifestFormat, SerializableDependency } from '../model';

/** True when `s` contains a high or low surrogate code unit that is not part of a valid pair. */
function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) i++;
      else return true;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true;
    }
  }
  return false;
}

// Requirement 5.13
/**
 * True when the serializer can write `d` in `format` so that the parser recovers its five Dependency_Set fields.
 * Ecosystem and scope are not checked here (criterion 5.1). `rawName` matters only through the Written_Name of
 * `requirements.txt`.
 */
export function isRepresentable(d: SerializableDependency, format: ManifestFormat): boolean {
  // Requirement 5.13: for every format the name is non-empty
  if (d.name.length === 0) return false;

  switch (format) {
    case 'package.json':
      // Requirement 5.13: the classification of versionSpec by criterion 1.9 equals sourceKind
      return sourceKindOfNpmSpec(d.versionSpec) === d.sourceKind;
    case 'Cargo.toml':
      // Requirement 5.13: every sourceKind; no lone surrogate in name or versionSpec
      return !hasLoneSurrogate(d.name) && !hasLoneSurrogate(d.versionSpec);
    case 'requirements.txt': {
      // Requirement 5.13: the Written_Name is a Name_Token whose normalization equals name
      const written = writtenName(d);
      if (!isNameToken(written) || normalizePypiName(written) !== d.name) return false;
      // Requirement 5.13: source prefix iff sourceKind, no newline or backslash, no outer whitespace,
      // registry operator and `;`/`#` conditions, git/path whitespace-led `;`/`#` condition
      return isCanonicalRequirementsSpec(d.versionSpec, d.sourceKind);
    }
    default:
      return false;
  }
}
