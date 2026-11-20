// Requirement 13: the Error_Model. Pure and total: never throws, never reads the clock.
import { RETRY_FALLBACK_COOLDOWN_SECONDS } from './constants';
import { buildPickerModel } from './picker';
import type {
  ClientFailureKind,
  ErrorActionId,
  ErrorInput,
  ErrorModel,
  PickerModel,
} from './types';
import { buildUrl } from './urls';

type Action = ErrorModel['actions'][number];

const ACTION_LABELS: Readonly<Record<ErrorActionId, string>> = {
  'edit-url': 'Edit the URL',
  retry: 'Try again',
  'scan-default-branch': 'Scan the default branch',
  'scan-root': 'Scan the repository root',
  'scan-selected': 'Scan selected manifests',
  'back-to-gate': 'Back to the gate',
};

function actions(...ids: readonly ErrorActionId[]): readonly Action[] {
  return ids.map((id) => ({ id, label: ACTION_LABELS[id] }));
}

const CLIENT_FAILURES: Readonly<Record<ClientFailureKind, { heading: string; message: string }>> = {
  'network-failure': { heading: 'The road is washed out', message: 'The server could not be reached.' },
  timeout: { heading: 'The night ran out', message: 'The server did not answer in time.' },
  'malformed-response': {
    heading: 'The records are garbled',
    message: 'The server sent an answer that Gravekeeper could not read.',
  },
};

const INVALID_PARTS: readonly string[] = ['url', 'host', 'path', 'owner', 'repository', 'branch'];
const REPO_NOT_FOUND_HINT = 'The repository must exist and be public';
const INVALID_REQUEST_HINT = 'This is a fault in Gravekeeper, not in your URL';
const FALLBACK_HEADING = 'The gravedigger tripped';

/** `<repo>/tree/<branch>` becomes `<repo>`; any other value is returned as given. */
const TREE_SUFFIX = /^(\s*(?:[A-Za-z][A-Za-z0-9+.-]*:\/\/)?[^/\s]+\/[^/\s]+\/[^/\s]+)\/tree(?:\/[\s\S]*)?$/;
function withoutTreePart(repo: string): string {
  const m = TREE_SUFFIX.exec(repo);
  return m === null ? repo : m[1]!.trim();
}

function candidatesOf(details: unknown): readonly string[] {
  if (typeof details !== 'object' || details === null) return [];
  const list = (details as { candidates?: unknown }).candidates;
  return Array.isArray(list) ? (list as readonly unknown[]).filter((p): p is string => typeof p === 'string') : [];
}

function partOf(details: unknown): string | null {
  if (typeof details !== 'object' || details === null) return null;
  const part = (details as { part?: unknown }).part;
  return typeof part === 'string' && INVALID_PARTS.includes(part) ? part : null;
}

/** A non-negative integer, otherwise the fallback. */
function cooldownFrom(seconds: number | null): number {
  return seconds !== null && Number.isInteger(seconds) && seconds >= 0 ? seconds : RETRY_FALLBACK_COOLDOWN_SECONDS;
}

interface Layout {
  readonly heading: string;
  readonly ids: readonly ErrorActionId[];
  readonly hint?: string;
}

function buildClientModel(input: Extract<ErrorInput, { kind: 'client' }>): ErrorModel {
  const text = CLIENT_FAILURES[input.failure] ?? CLIENT_FAILURES['network-failure'];
  return {
    code: input.failure,
    heading: text.heading,
    plainMessage: text.message,
    httpStatus: null,
    hint: null,
    invalidPart: null,
    actions: actions('retry', 'back-to-gate'),
    retryCooldownSeconds: 0,
    picker: null,
    defaultBranchUrl: null,
    rootScanUrl: null,
  };
}

/** Requirements 13.1 to 13.6, 13.8, 13.15, 13.16. Total for every `ScanErrorBody` shape. */
export function buildErrorModel(input: ErrorInput): ErrorModel {
  if (input.kind === 'client') return buildClientModel(input);

  const { error } = input;
  const details: unknown = (error as { details?: unknown }).details;
  const manifests = Array.isArray(input.selectedManifests) ? input.selectedManifests : [];
  const repoValue = typeof input.repoValue === 'string' ? input.repoValue : '';

  let layout: Layout;
  let retry = false;
  let picker: PickerModel | null = null;
  let rootScanUrl: string | null = null;
  let defaultBranchUrl: string | null = null;
  let invalidPart: string | null = null;

  switch (error.code) {
    case 'invalid-url':
      layout = { heading: 'That is not a grave we can find', ids: ['edit-url', 'back-to-gate'] };
      invalidPart = partOf(details);
      break;
    case 'repo-not-found':
      layout = { heading: 'No such graveyard', ids: ['edit-url', 'back-to-gate'], hint: REPO_NOT_FOUND_HINT };
      break;
    case 'branch-not-found':
      layout = {
        heading: 'That branch has no graves',
        ids: ['scan-default-branch', 'edit-url', 'back-to-gate'],
      };
      defaultBranchUrl = buildUrl({ repo: withoutTreePart(repoValue), manifests, view: 'scene' });
      break;
    case 'too-many-manifests':
    case 'manifest-not-found': {
      const candidates = candidatesOf(details);
      if (candidates.length > 0) picker = buildPickerModel(candidates, manifests, repoValue);
      rootScanUrl = buildUrl({ repo: repoValue, manifests: [], view: 'scene' });
      layout = {
        heading: error.code === 'too-many-manifests' ? 'Too many plots at once' : 'That manifest is not here',
        ids: picker === null ? ['scan-root', 'back-to-gate'] : ['scan-selected', 'scan-root', 'back-to-gate'],
      };
      break;
    }
    case 'upstream-unavailable':
      layout = { heading: 'The gates are shut for now', ids: ['retry', 'back-to-gate'] };
      retry = true;
      break;
    case 'deadline-exceeded':
      layout = { heading: 'The night ran out', ids: ['retry', 'back-to-gate'] };
      retry = true;
      break;
    case 'internal-error':
      layout = { heading: FALLBACK_HEADING, ids: ['retry', 'back-to-gate'] };
      retry = true;
      break;
    case 'invalid-request':
      layout = {
        heading: 'The request was not understood',
        ids: ['retry', 'back-to-gate'],
        hint: INVALID_REQUEST_HINT,
      };
      retry = true;
      break;
    default:
      // A code outside the contract still gets a heading, the plain message and a way out.
      layout = { heading: FALLBACK_HEADING, ids: ['retry', 'back-to-gate'] };
      retry = true;
  }

  const fromHeader = error.code === 'upstream-unavailable' ? input.retryAfterSeconds : null;
  return {
    code: error.code,
    heading: layout.heading,
    plainMessage: error.message,
    httpStatus: input.status,
    hint: layout.hint ?? null,
    invalidPart,
    actions: actions(...layout.ids),
    retryCooldownSeconds: retry ? cooldownFrom(fromHeader) : null,
    picker,
    defaultBranchUrl,
    rootScanUrl,
  };
}

/** Requirement 13.14: milliseconds left of a cooldown. Non-increasing in `elapsedMs`, never negative. */
export function retryRemainingMs(cooldownSeconds: number, elapsedMs: number): number {
  return Math.max(0, cooldownSeconds * 1000 - elapsedMs);
}
