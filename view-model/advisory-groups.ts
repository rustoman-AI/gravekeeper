import { advisoryLink } from './urls';
import type { AdvisoryExclusion, DetailModel, ParsedAdvisory } from './types';

export type AdvisoryGroupModel = DetailModel['advisoryGroups'][number];

/** Requirement 10.19: the sentence shown next to "Not classified". */
export const UNCLASSIFIED_SENTENCE =
  'This scan result does not say which of these advisories are withdrawn';
/** Requirement 10.16. */
export const ALIAS_SENTENCE = 'Advisories that are aliases of each other count once';

const ORDER: readonly AdvisoryExclusion[] = ['counted', 'informational', 'withdrawn', 'unknown'];
const HEADINGS: Readonly<Record<AdvisoryExclusion, string>> = {
  counted: 'Counted as open',
  informational: 'Informational, not counted',
  withdrawn: 'Withdrawn, not counted',
  unknown: 'Not classified',
};

/**
 * Requirements 10.16, 10.18, 10.19 (design "Advisory groups and the data gap"). Every entry lands in
 * exactly one group, in API order inside the group. An entry whose exclusion is unknown and whose id the
 * `informational-advisory-excluded` note names is informational; the rest stay "Not classified".
 */
export function buildAdvisoryGroups(
  advisories: readonly ParsedAdvisory[],
  openVulnerabilityCount: number | null,
  informationalIdsFromNotes: ReadonlySet<string>,
): readonly AdvisoryGroupModel[] {
  const buckets: Record<AdvisoryExclusion, ParsedAdvisory[]> = {
    counted: [],
    informational: [],
    withdrawn: [],
    unknown: [],
  };
  for (const a of advisories) {
    const effective: AdvisoryExclusion =
      a.exclusion === 'unknown' && informationalIdsFromNotes.has(a.id) ? 'informational' : a.exclusion;
    buckets[effective].push(a);
  }

  const countWord = openVulnerabilityCount === null ? 'unknown' : String(openVulnerabilityCount);
  const groups: AdvisoryGroupModel[] = [];
  for (const exclusion of ORDER) {
    const list = buckets[exclusion];
    const forced = exclusion === 'counted' && openVulnerabilityCount !== null && openVulnerabilityCount > 0;
    if (list.length === 0 && !forced) continue;

    let countText = `${String(list.length)} listed`;
    let explanation: string | null;
    if (exclusion === 'counted') {
      countText += `, ${countWord} counted`;
      explanation = ALIAS_SENTENCE;
    } else if (exclusion === 'unknown') {
      explanation = UNCLASSIFIED_SENTENCE;
    } else {
      explanation =
        openVulnerabilityCount === null
          ? 'not part of the open vulnerability count (unknown)'
          : `not part of the ${countWord} open vulnerabilities`;
    }
    groups.push({
      exclusion,
      heading: HEADINGS[exclusion],
      countText,
      explanation,
      entries: list.map((a) => ({
        id: a.id,
        aliases: a.aliases,
        severityText: a.severity ?? 'severity unknown',
        href: advisoryLink(a.url),
      })),
    });
  }
  return groups;
}
