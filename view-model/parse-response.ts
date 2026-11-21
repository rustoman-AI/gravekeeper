// Requirement 14.1 to 14.6, 14.9: the response boundary. Total, never throws.
import { CACHE_STATUS_HEADER } from '../pipeline/constants';
import type { ScanErrorBody } from '../pipeline';
import { isValidRepo, narrowAdvisories, narrowFacts, narrowHints, narrowUpgrade, narrowVersionBasis } from './narrow';
import type {
  CacheStatus,
  HeaderReader,
  ParsedDependency,
  ParsedScanResult,
  ParseOutcome,
} from './types';

const ERROR_CODES: readonly string[] = [
  'invalid-request',
  'invalid-url',
  'too-many-manifests',
  'manifest-not-found',
  'repo-not-found',
  'branch-not-found',
  'upstream-unavailable',
  'deadline-exceeded',
  'internal-error',
];
const SOURCE_KEYS: readonly string[] = ['github', 'depsdev', 'osv', 'npm', 'cratesio', 'pypi'];
const SOURCE_STATUSES: readonly string[] = ['ok', 'partial', 'failed'];
const MALFORMED: ParseOutcome = { kind: 'failure', failure: { kind: 'malformed-response' } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A decimal integer from 1 to 86400, otherwise null (Requirement 14.6). */
export function parseRetryAfter(value: string | null): number | null {
  if (value === null || !/^[0-9]{1,6}$/.test(value)) return null;
  const n = Number(value);
  return n >= 1 && n <= 86400 ? n : null;
}

/** `hit` and `miss` exactly, `unknown` for anything else (Requirement 14.9). */
export function parseCacheStatus(value: string | null): CacheStatus {
  return value === 'hit' || value === 'miss' ? value : 'unknown';
}

function readHeader(headers: HeaderReader, name: string): string | null {
  try {
    const exact = headers.get(name);
    if (typeof exact === 'string') return exact;
    const lower = headers.get(name.toLowerCase());
    return typeof lower === 'string' ? lower : null;
  } catch {
    return null;
  }
}

function hasValidSources(sources: unknown): boolean {
  if (!isRecord(sources)) return false;
  const keys = Object.keys(sources);
  return (
    keys.length === SOURCE_KEYS.length &&
    SOURCE_KEYS.every((k) => Object.hasOwn(sources, k) && SOURCE_STATUSES.includes(sources[k] as string))
  );
}

function parseResult(body: Record<string, unknown>): ParsedScanResult | null {
  if (typeof body['asOf'] !== 'string') return null;
  for (const key of ['repo', 'discovery', 'summary', 'capped']) {
    if (!isRecord(body[key])) return null;
  }
  for (const key of ['manifests', 'assessed', 'notes']) {
    if (!Array.isArray(body[key])) return null;
  }
  if (!isValidRepo(body['repo'])) return null;
  const dependencies = body['dependencies'];
  const assessed = body['assessed'] as readonly unknown[];
  if (!Array.isArray(dependencies) || (dependencies as readonly unknown[]).length !== assessed.length) return null;
  if (!hasValidSources(body['sources'])) return null;

  const parsed: ParsedDependency[] = [];
  for (const entry of dependencies as readonly unknown[]) {
    if (!isRecord(entry) || !isRecord(entry['dependency']) || !Array.isArray(entry['advisories'])) return null;
    parsed.push({
      ...(entry as unknown as Omit<ParsedDependency, 'facts' | 'versionBasis' | 'advisories' | 'hints' | 'upgrade'>),
      facts: narrowFacts(entry['facts']),
      versionBasis: narrowVersionBasis(entry['versionBasis']),
      advisories: narrowAdvisories(entry['advisories']),
      hints: narrowHints(entry['hints']),
      upgrade: narrowUpgrade(entry['upgrade'], entry['dependency']['ecosystem'], entry['lookupVersion']),
    });
  }
  const { ok: _ok, ...rest } = body;
  void _ok;
  return { ok: true, ...rest, dependencies: parsed } as unknown as ParsedScanResult;
}

function parseError(body: Record<string, unknown>): ScanErrorBody | null {
  const error = body['error'];
  if (!isRecord(error)) return null;
  if (typeof error['code'] !== 'string' || !ERROR_CODES.includes(error['code'])) return null;
  if (typeof error['message'] !== 'string') return null;
  return error as unknown as ScanErrorBody;
}

export function parseScanResponse(status: number, headers: HeaderReader, body: unknown): ParseOutcome {
  try {
    if (!isRecord(body)) return MALFORMED;
    if (body['ok'] === true) {
      if (status !== 200) return MALFORMED;
      const result = parseResult(body);
      if (result === null) return MALFORMED;
      return { kind: 'result', result, cache: parseCacheStatus(readHeader(headers, CACHE_STATUS_HEADER)) };
    }
    if (body['ok'] === false) {
      if (status === 200) return MALFORMED;
      const error = parseError(body);
      if (error === null) return MALFORMED;
      return {
        kind: 'error',
        status,
        error,
        retryAfterSeconds: parseRetryAfter(readHeader(headers, 'Retry-After')),
      };
    }
    return MALFORMED;
  } catch {
    return MALFORMED;
  }
}
