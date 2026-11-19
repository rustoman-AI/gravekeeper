export { assembleFacts } from './assemble';
export { cvssSeverity, cvssV3BaseScore, severityFromScore } from './cvss';
export { mapDepsDevPackage, mapDepsDevVersion, mapDepsDevVersionBatch } from './deps-dev';
export type { DepsDevPackageFacts, DepsDevVersionRequest } from './deps-dev';
export { discoverManifests } from './discovery';
export { buildRepositoriesQuery, mapGraphqlRepos, planGraphqlBatches } from './github-repos';
export { readCommitSha, readRepository } from './github-resolve';
export type { RepositoryInfo } from './github-resolve';
export {
  mapCratesOwners,
  mapNpmLatest,
  mapPypiOwnership,
  orderCratesLookups,
} from './maintainers';
export { aggregateAdvisories, mapOsvAdvisory } from './osv-advisory';
export { mapOsvQueryBatch, planAdvisoryRequests } from './osv-batch';
export { readGraphqlRateLimit, readRestRateLimit } from './rate-limit';
export type { RateLimitReading } from './rate-limit';
export { selectManifests } from './selection';
export { mapDepsDevAdvisory, severityOf } from './severity';
export type {
  AdvisoryRecord,
  AssembledFacts,
  BatchEntry,
  DiscoveryLimits,
  DiscoveryResult,
  Fetched,
  GraphqlAlias,
  GraphqlBatch,
  GraphqlRepoResult,
  IsoInstant,
  ManifestCandidate,
  OsvBatchMapping,
  OsvQueryResult,
  RawTargetInputs,
  SelectionError,
  SelectionLimits,
  SelectionResult,
  SourceRepo,
  TargetNote,
  VersionBasis,
  VersionSelection,
  VulnerabilityFacts,
} from './types';
export { exactPin, readDepsDevVersions, selectVersion } from './version-select';
export { chooseVersion } from './version-choose';
export { resolveRange } from './range-resolve';
export { cargoToSemverRange } from './range-cargo';
