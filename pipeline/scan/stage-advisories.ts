// Requirement 9.4, 9.9, 9.18, 9.20, 9.23, 17.14
import { OSV_MAX_ADVISORY_DETAILS } from '../constants';
import { planAdvisoryRequests } from '../mapping';
import type { Fetched, OsvQueryResult, RawTargetInputs } from '../mapping';
import type { RequestContext, SourceResult } from '../ports';
import type { UnitRunner } from './run-unit';
import type { ScanDeps } from './types';

type RunResult = Awaited<ReturnType<UnitRunner['runUnit']>>;

/** The advisory part of `RawTargetInputs` (`osv`), which `assembleFacts` reads. */
export type TargetAdvisoryInputs = RawTargetInputs['osv'];

export interface AdvisoryStageInput {
  readonly sources: Pick<ScanDeps['sources'], 'depsdev' | 'osv'>;
  readonly runner: UnitRunner;
  readonly ctx: RequestContext;
  /** `VersionStageResult.osv`, keyed by `targetKey`. */
  readonly osv: ReadonlyMap<string, OsvQueryResult | 'unavailable'>;
  /** Cap on advisory ids requested per scan. Defaults to `OSV_MAX_ADVISORY_DETAILS`. */
  readonly maxAdvisoryDetails?: number;
}

/** Results of stage S7. `osv` is keyed by `targetKey`, one entry per input target. */
export interface AdvisoryStageResult {
  /** Feeds `RawTargetInputs.osv` of every target in the input map. */
  readonly osv: ReadonlyMap<string, TargetAdvisoryInputs>;
  /** Ids left unfetched by the cap, ascending (recorded as `truncated` osv units). */
  readonly unfetchedIds: readonly string[];
}

/** Work_Unit keys, unique within a scan together with the source name. */
export const advisoryUnitKeys = {
  advisory: (id: string): string => `advisory:${id}`,
};

function fetchedOf(result: SourceResult | RunResult): Fetched<unknown> {
  if (result.kind === 'ok') return { state: 'ok', body: result.body };
  if (result.kind === 'absent') return { state: 'absent' };
  return { state: 'unavailable' };
}

/**
 * Stage S7: advisory details. One plan covers the union of the ids of all targets (R9.4). For
 * the requested ids, one OSV detail request (EF-6) and one deps.dev advisory request (EF-25)
 * per distinct id are started together; the sources' limiters apply the concurrency (R9.20).
 * Each id left unfetched by the cap is recorded once as an osv unit that did not end `ok`
 * with reason `truncated` and gets no deps.dev request (R9.9, R9.20, R17.14).
 *
 * An id is unfetched for a target only through the cap; a failed OSV detail is reported as
 * `unavailable` in `advisories` and `assembleFacts` counts it as unfetched, a failed deps.dev
 * request only leaves the score out (R9.9). The OSV detail is also fetched for withdrawn and
 * informational advisories; the severity order lives in `severityOf`.
 */
export async function runAdvisoryStage(input: AdvisoryStageInput): Promise<AdvisoryStageResult> {
  const { sources, runner, ctx, osv } = input;
  const cap = input.maxAdvisoryDetails ?? OSV_MAX_ADVISORY_DETAILS;

  const allIds: string[] = [];
  for (const result of osv.values()) {
    if (result !== 'unavailable' && result.kind === 'ids') allIds.push(...result.ids);
  }
  const plan = planAdvisoryRequests(allIds, cap);

  for (const id of plan.unfetched) {
    runner.skipUnit('osv', advisoryUnitKeys.advisory(id), 'truncated');
  }

  const details = new Map<string, { osv: Fetched<unknown>; depsdev: Fetched<unknown> }>();
  await Promise.all(
    plan.requested.map(async (id) => {
      const key = advisoryUnitKeys.advisory(id);
      const [osvResult, depsdevResult] = await Promise.all([
        runner.runUnit('osv', key, () => sources.osv.getVulnerability(id, ctx)),
        runner.runUnit('depsdev', key, () => sources.depsdev.getAdvisory(id, ctx)),
      ]);
      details.set(id, { osv: fetchedOf(osvResult), depsdev: fetchedOf(depsdevResult) });
    }),
  );

  const unfetched = new Set(plan.unfetched);
  const out = new Map<string, TargetAdvisoryInputs>();
  for (const [key, result] of osv) {
    if (result === 'unavailable' || result.kind !== 'ids') {
      out.set(key, { queryResult: result, advisories: new Map(), unfetchedIds: [] });
      continue;
    }
    const advisories = new Map<string, { osv: Fetched<unknown>; depsdev: Fetched<unknown> }>();
    const unfetchedIds: string[] = [];
    for (const id of result.ids) {
      const fetched = details.get(id);
      if (fetched !== undefined) advisories.set(id, fetched);
      else if (unfetched.has(id)) unfetchedIds.push(id);
    }
    out.set(key, { queryResult: result, advisories, unfetchedIds });
  }

  return { osv: out, unfetchedIds: plan.unfetched };
}
