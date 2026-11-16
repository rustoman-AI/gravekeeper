// summarize(): total, pure entry point for the repo-level summary.
import { guard } from '../internal/safe';
import { CONSTANTS } from '../model';
import type {
  AssessedDependency,
  AssessedPackage,
  RankedPackage,
  RepoSummary,
  UniquePackage,
} from '../model';
import { repoGrade } from './grade';
import { groupAssessed } from './group';
import { mergeClassifications } from './merge';
import { sortRanked, sortUnassessed } from './order';
import { partitionPackages } from './partition';

function summarizeList(entries: readonly AssessedDependency[]): RepoSummary {
  // Requirement 12.1: one Unique_Package per Package_Key, classifications merged by the 12.22 order.
  const packages: UniquePackage[] = groupAssessed(entries).map((g) => ({
    name: g.name,
    ecosystem: g.ecosystem,
    sourceKind: g.sourceKind,
    scopes: g.scopes,
    classification: mergeClassifications(g.classifications),
  }));
  // Requirements 12.2, 12.14
  const { assessed, unassessedItems } = partitionPackages(packages);

  // Requirement 12.3
  const counts = { ALIVE: 0, HAUNTED: 0, DEAD: 0 };
  let sum = 0;
  for (const p of assessed) {
    counts[p.classification.status] += 1;
    sum += p.classification.score;
  }

  const n = assessed.length;
  const ranked: AssessedPackage[] = sortRanked(assessed); // Requirement 12.6 (copy, input untouched)
  const first = ranked.length > 0 ? ranked[0] : null;

  // Requirement 12.7: ALIVE with score 0 is not listed; 12.6 order is kept, then cut to WORST_LIST_SIZE.
  const worst: RankedPackage[] = ranked
    .filter((p) => !(p.classification.status === 'ALIVE' && p.classification.score === 0))
    .slice(0, CONSTANTS.WORST_LIST_SIZE)
    .map((p) => ({
      name: p.name,
      ecosystem: p.ecosystem,
      sourceKind: p.sourceKind,
      scopes: p.scopes,
      classification: p.classification,
    }));

  // Requirements 12.4, 12.5, 12.13, 12.15, 12.16
  const maxScore = first === null ? null : first.classification.score;
  return {
    total: packages.length,
    assessed: n,
    unassessed: packages.length - n,
    counts,
    // Requirement 12.4: mean rounded half up, in integers.
    averageScore: n === 0 ? null : Math.floor((2 * sum + n) / (2 * n)),
    maxScore,
    maxScorePackage: first === null ? null : { name: first.name, ecosystem: first.ecosystem },
    grade: repoGrade(maxScore),
    worst,
    unassessedItems: sortUnassessed(unassessedItems),
  };
}

const emptySummary = (): RepoSummary => summarizeList([]);

// Requirements 12.1-12.7, 12.13-12.16, 12.22, 13.3
export function summarize(entries: readonly AssessedDependency[]): RepoSummary {
  return guard(
    () => summarizeList(Array.isArray(entries) ? entries : []),
    emptySummary,
  );
}
