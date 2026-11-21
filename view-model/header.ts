import type { Grade } from '../core';
import { GRADE_A_MAX, GRADE_B_MAX, GRADE_C_MAX, GRADE_D_MAX } from '../core';
import { SHORT_SHA_LENGTH } from './constants';
import type { HeaderModel, PackageRow, ParsedScanResult, StatusChipModel } from './types';
import { plural } from './plural';
import { canonicalRepoUrl } from './urls';


/** Requirement 5.2: the Headline. The verb agrees with n and the noun with m (graveyard-art R20). Parts with count 0 are omitted; the colon only when a part is kept. */
export function headlineText(n: number, m: number, b: number, f: number, h: number): string {
  const parts: string[] = [];
  if (b > 0) parts.push(`${b} buried`);
  if (f > 0) parts.push(`${f} forgotten`);
  if (h > 0) parts.push(`${h} haunted`);
  const tail = parts.length > 0 ? `: ${parts.join(', ')}` : '';
  return `${n} of ${m} ${plural(m, 'dependency', 'dependencies')} ${plural(n, 'is', 'are')} in the graveyard${tail}.`;
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
  if (s.maxScorePackage === null || s.maxScore === null || s.averageScore === null) {
    return 'Graded on the riskiest package, not on the average';
  }
  return `Graded on the riskiest package, ${s.maxScorePackage.name} (score ${s.maxScore}), not on the average (${s.averageScore})`;
}

/** Graveyard-art Requirements 11.2 to 11.4: the Empty_Sentence; null when assessed > 0 or no manifest was found. */
function emptySentenceOf(result: ParsedScanResult): string | null {
  const { summary, manifests } = result;
  if (summary.assessed > 0 || manifests.length === 0) return null;
  if (summary.total === 0) return 'This repository declares no dependencies, so there is nothing to grade.';
  return `The caretaker could not assess any of the ${summary.total} ${plural(summary.total, 'dependency', 'dependencies')}, so there is no grade.`;
}

/** Graveyard-art Requirements 5.4, 5.5, 5.9: the four chips; counts come from the summary and the row split. */
function buildChips(
  dead: number,
  buried: number,
  forgotten: number,
  haunted: number,
  alive: number,
  unassessed: number,
): readonly StatusChipModel[] {
  return [
    { status: 'dead', iconSymbolId: 'plot-tombstone-rounded', text: `${dead} dead (${buried} buried, ${forgotten} forgotten)` },
    { status: 'haunted', iconSymbolId: 'plot-ghost-wisp', text: `${haunted} haunted` },
    { status: 'alive', iconSymbolId: 'plot-lantern-iron', text: `${alive} alive` },
    { status: 'unassessed', iconSymbolId: 'plot-unmarked-mound', text: `${unassessed} unassessed` },
  ];
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
    emptySentence: emptySentenceOf(result),
    counts: {
      alive: summary.counts.ALIVE,
      haunted,
      dead: summary.counts.DEAD,
      buried,
      forgotten,
      unassessed: summary.unassessed,
    },
    grade: noneAssessed || summary.grade === null
      ? null
      : {
          letter: summary.grade,
          label: 'worst single risk',
          explanation: explanationOf(result),
          scale: GRADE_SCALE,
        },
    entriesSentence:
      entries > summary.total
        ? `${entries} dependency ${plural(entries, 'entry', 'entries')} across ${result.manifests.length} ${plural(result.manifests.length, 'manifest', 'manifests')}, ${summary.total} unique ${plural(summary.total, 'package', 'packages')}`
        : null,
    // Graveyard-art Requirements 5.4, 5.5, 5.9: no chips when nothing was assessed.
    chips: noneAssessed
      ? []
      : buildChips(summary.counts.DEAD, buried, forgotten, haunted, summary.counts.ALIVE, summary.unassessed),
  };
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function unit(count: number, word: string): string {
  return `${count} ${plural(count, word, `${word}s`)}`;
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
