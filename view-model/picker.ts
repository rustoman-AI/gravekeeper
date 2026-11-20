import { SCAN_MAX_MANIFESTS } from './constants';
import type { PickerModel } from './types';
import { buildUrl } from './urls';

/**
 * Requirements 11.11, 13.15, 13.17. Lists every distinct candidate path once, in the given order
 * (a repeated path keeps its first position). At most SCAN_MAX_MANIFESTS paths are checked, the first
 * ones in candidate order; once the limit is reached every unchecked box is disabled. `scanUrl` is null
 * while nothing is checked and otherwise lists the checked paths in candidate order.
 */
export function buildPickerModel(
  candidates: readonly string[],
  selected: readonly string[],
  repoValue: string,
): PickerModel {
  const paths = [...new Set(candidates)];
  const wanted = new Set(selected);
  const checkedPaths = paths.filter((p) => wanted.has(p)).slice(0, SCAN_MAX_MANIFESTS);
  const checkedSet = new Set(checkedPaths);
  const full = checkedPaths.length >= SCAN_MAX_MANIFESTS;
  return {
    candidates: paths.map((path) => {
      const checked = checkedSet.has(path);
      return { path, checked, disabled: !checked && full };
    }),
    limit: SCAN_MAX_MANIFESTS,
    scanUrl:
      checkedPaths.length === 0
        ? null
        : buildUrl({ repo: repoValue, manifests: checkedPaths, view: 'scene' }),
  };
}
