import type { HealthFactField } from '../core';

/** Requirements 10.4, 10.15: the label shown beside each of the seven facts. */
export const FACT_LABELS: Record<HealthFactField, string> = {
  daysSinceLastRelease: 'Days since last release',
  daysSinceLastCommit: 'Days since last commit',
  archived: 'Archived',
  deprecated: 'Deprecated',
  openVulnerabilityCount: 'Open vulnerabilities',
  maxSeverity: 'Highest severity',
  maintainerCount: 'Maintainers',
};
