import type { Grade } from '../core';
import { GRADE_A_MAX, GRADE_B_MAX, GRADE_C_MAX, GRADE_D_MAX } from '../core';
import { SHORT_SHA_LENGTH } from './constants';
import type { HeaderModel, PackageRow, ParsedScanResult } from './types';
import { canonicalRepoUrl } from './urls';

const NO_ASSESSED_TEXT = 'No dependencies could be assessed';
const NO_GRADE_TEXT = 'no grade';

/** Requirement 5.2: the Headline. Parts with count 0 are omitted; the colon only when a part is kept. */
export function headlineText(n: number, m: number, b: number, f: number, h: number): string {
  const parts: string[] = [];
  if (b > 0) parts.push(`${b} buried`);
  if (f > 0) parts.push(`${f} forgotten`);
  if (h > 0) parts.push(`${h} haunted`);
  const tail = parts.length > 0 ? `: ${parts.join(', ')}` : '';
  return `${n} of ${m} dependencies are in the graveyard${tail}.`;
}

// Requirement 5.6: the scale from the core grade bounds (DI-7).
const GRADE_SCALE: readonly { readonly letter: Grade; readonly range: string }[] = [
  { letter: 'A', range: `0 to ${GRADE_A_MAX}` },
  { letter: 'B', range: `${GRADE_A_MAX + 1} to ${GRADE_B_MAX}` },
  { letter: 'C', range: `${GRADE_B_MAX + 1} to ${GRADE_C_MAX}` },
  { letter: 'D', range: `${GRADE_C_MAX + 1} to ${GRADE_D_MAX}` },
  { letter: 'F', range: `${GRADE_D_MAX + 1} to 100` },
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Absolute UTC time, "YYYY-MM-DD HH:MM UTC"; the input text when it is not a valid instant. */
function absoluteUtc(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`;
}

function explanationOf(result: ParsedScanResult): string {
  const s = result.summary;
  if (s.assessed === 0 || s.maxScorePackage === null || s.maxScore === null || s.averageScore === null) {
    return NO_GRADE_TEXT;
  }
  return `Graded on the riskiest package, ${s.maxScorePackage.name} (score ${s.maxScore}), not on the average (${s.averageScore})`;
}

/** Requirements 5.1 to 5.8. Pure: no clock, no DOM. */
export function buildHeaderModel(result: ParsedScanResult, rows: readonly PackageRow[]): HeaderModel {
  const { summary, repo } = result;
  const m = summary.assessed;
  let buried = 0;
  let forgotten = 0;
  for (const row of rows) {
    if (row.graveType === 'buried') buried += 1;
    else if (row.graveType === 'forgotten') forgotten += 1;
  }
  const haunted = summary.counts.HAUNTED;
  const noneAssessed = m === 0;
  const entries = result.dependencies.length;
  return {
    repoName: `${repo.owner}/${repo.repo}`,
    canonicalUrl: canonicalRepoUrl(repo),
    shortSha: repo.commitSha.slice(0, SHORT_SHA_LENGTH),
    fullSha: repo.commitSha,
    branch: repo.branch,
    notDefaultBranch: repo.branch !== repo.defaultBranch,
    asOfIso: result.asOf,
    asOfText: absoluteUtc(result.asOf),
    headline: noneAssessed
      ? null
      : {
          n: buried + forgotten + haunted,
          m,
          buried,
          forgotten,
          haunted,
          text: headlineText(buried + forgotten + haunted, m, buried, forgotten, haunted),
        },
    emptyText: noneAssessed ? NO_ASSESSED_TEXT : null,
    counts: {
      alive: summary.counts.ALIVE,
      haunted,
      dead: summary.counts.DEAD,
      buried,
      forgotten,
      unassessed: summary.unassessed,
    },
    grade: {
      letter: noneAssessed ? null : summary.grade,
      label: 'worst single risk',
      explanation: explanationOf(result),
      scale: GRADE_SCALE,
    },
    entriesSentence:
      entries > summary.total
        ? `${entries} dependency entries across ${result.manifests.length} manifests, ${summary.total} unique packages`
        : null,
  };
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function unit(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** Requirement 3.10: "scanned 3 hours ago". `nowMs` is passed in; this module never reads the clock. */
export function formatAge(asOfIso: string, nowMs: number): string {
  const t = Date.parse(asOfIso);
  if (Number.isNaN(t) || !Number.isFinite(nowMs)) return 'scanned just now';
  const diff = nowMs - t;
  if (diff < MINUTE_MS) return 'scanned just now';
  if (diff < HOUR_MS) return `scanned ${unit(Math.floor(diff / MINUTE_MS), 'minute')} ago`;
  if (diff < DAY_MS) return `scanned ${unit(Math.floor(diff / HOUR_MS), 'hour')} ago`;
  return `scanned ${unit(Math.floor(diff / DAY_MS), 'day')} ago`;
}
