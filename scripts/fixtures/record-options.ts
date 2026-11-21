// Requirement 12.3, 12.4 (pyproject), 23.4 (pipeline)
// Pure helpers of the recorder, kept apart from `record-fixtures.ts` so tests can import them
// (the script itself runs `main()` on import).

export type RecorderTarget =
  | { readonly kind: 'all' }
  | { readonly kind: 'supplementary' }
  | { readonly kind: 'repo'; readonly owner: string; readonly repo: string }
  | { readonly kind: 'invalid'; readonly message: string };

const REPO_PATTERN = /^([A-Za-z0-9](?:[A-Za-z0-9._-]*))\/([A-Za-z0-9._-]+)$/;

/**
 * Reads `--only <value>` (or `--only=<value>`) from the argument list (without node and script).
 * `supplementary` records only the supplementary sets; `owner/repo` records that repository only.
 * Without the argument everything is recorded.
 */
export function parseRecorderTarget(args: readonly string[]): RecorderTarget {
  let value: string | null = null;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] as string;
    if (arg === '--only') {
      const next = args[i + 1];
      if (next === undefined || next.startsWith('--')) {
        return { kind: 'invalid', message: '--only needs a value: supplementary or <owner/repo>' };
      }
      value = next;
      i += 1;
    } else if (arg.startsWith('--only=')) {
      value = arg.slice('--only='.length);
    }
  }
  if (value === null) return { kind: 'all' };
  if (value === 'supplementary') return { kind: 'supplementary' };
  const match = REPO_PATTERN.exec(value);
  if (match === null) {
    return { kind: 'invalid', message: `--only value "${value}" is neither supplementary nor <owner/repo>` };
  }
  return { kind: 'repo', owner: match[1] as string, repo: match[2] as string };
}

/** Case-insensitive match of a repository against `owner/repo` of the `--only` argument. */
export function matchesRepo(spec: { readonly owner: string; readonly repo: string }, owner: string, repo: string): boolean {
  return spec.owner.toLowerCase() === owner.toLowerCase() && spec.repo.toLowerCase() === repo.toLowerCase();
}

/** The part of a scan outcome the replay verdict reads. */
export type ReplayOutcome =
  | { readonly ok: false; readonly error: { readonly code: string } }
  | {
      readonly ok: true;
      readonly value: {
        readonly result: {
          readonly dependencies: readonly {
            readonly facts: { readonly archived?: unknown; readonly deprecated?: unknown };
          }[];
        };
      };
    };

/**
 * Replay verdict (null when accepted). `requiresFlagged` false (R12.4) asks only for `ok` and one
 * dependency; otherwise one archived or deprecated dependency is required too (R23.4).
 */
export function replayVerdict(outcome: ReplayOutcome, requiresFlagged: boolean | undefined): string | null {
  if (!outcome.ok) return `replay scan failed with ${outcome.error.code}`;
  const dependencies = outcome.value.result.dependencies;
  if (requiresFlagged === false) {
    return dependencies.length > 0 ? null : 'replay scan has no dependency (R12.4)';
  }
  const flagged = dependencies.some((d) => d.facts.archived === true || d.facts.deprecated === true);
  return flagged ? null : 'replay scan has no dependency with archived or deprecated true (R23.4)';
}
