import type { Ecosystem } from '../core';
import { MANIFEST_QUERY_PARAM, REPO_QUERY_PARAM } from './constants';
import type { ParsedScanResult, ScanRequestBody, UrlState } from './types';

const VIEW_QUERY_PARAM = 'view';

const NPM_NAME = /^(?:@[A-Za-z0-9~_-][A-Za-z0-9._~-]*\/)?[A-Za-z0-9~_-][A-Za-z0-9._~-]*$/;
const PYPI_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const CRATE_NAME = /^[A-Za-z0-9_-]+$/;
const SOURCE_REPO = /^github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const ADVISORY_URL = /^https:\/\/osv\.dev\/vulnerability\/[A-Za-z0-9._:%-]+$/;

function stripQuestionMark(search: string): string {
  return search.startsWith('?') ? search.slice(1) : search;
}

/** Repeated `manifest=` pairs, each value encoded with encodeURIComponent (Requirement 3.12). */
export function encodeManifests(paths: readonly string[]): string {
  return paths.map((p) => `${MANIFEST_QUERY_PARAM}=${encodeURIComponent(p)}`).join('&');
}

export function decodeManifests(search: string): readonly string[] {
  return new URLSearchParams(stripQuestionMark(search)).getAll(MANIFEST_QUERY_PARAM);
}

export function parseUrlState(search: string): UrlState {
  const params = new URLSearchParams(stripQuestionMark(search));
  const repo = params.get(REPO_QUERY_PARAM);
  return {
    repo: repo === null || repo === '' ? null : repo,
    manifests: decodeManifests(search),
    view: params.get(VIEW_QUERY_PARAM) === 'list' ? 'list' : 'scene',
  };
}

export function buildUrl(state: UrlState): string {
  const parts: string[] = [];
  if (state.repo !== null && state.repo !== '') {
    parts.push(`${REPO_QUERY_PARAM}=${encodeURIComponent(state.repo)}`);
  }
  if (state.manifests.length > 0) parts.push(encodeManifests(state.manifests));
  if (state.view === 'list') parts.push(`${VIEW_QUERY_PARAM}=list`);
  return parts.length === 0 ? '/' : `/?${parts.join('&')}`;
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function canonicalRepoUrl(repo: ParsedScanResult['repo']): string {
  const base = `https://${repo.host}/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`;
  return repo.branch !== repo.defaultBranch ? `${base}/tree/${encodePath(repo.branch)}` : base;
}

export function buildRequestBody(state: UrlState): ScanRequestBody {
  const repoUrl = state.repo ?? '';
  return state.manifests.length > 0 ? { repoUrl, manifests: state.manifests } : { repoUrl };
}

export function registryLink(ecosystem: Ecosystem, name: string): string | null {
  if (typeof name !== 'string') return null;
  switch (ecosystem) {
    case 'npm': {
      if (!NPM_NAME.test(name)) return null;
      // Scoped names keep a literal "@" and the "/" between scope and name.
      const encoded = name
        .split('/')
        .map((seg, i, all) =>
          all.length === 2 && i === 0 ? `@${encodeURIComponent(seg.slice(1))}` : encodeURIComponent(seg),
        )
        .join('/');
      return `https://www.npmjs.com/package/${encoded}`;
    }
    case 'pypi':
      return PYPI_NAME.test(name) ? `https://pypi.org/project/${encodeURIComponent(name)}/` : null;
    case 'cargo':
      return CRATE_NAME.test(name) ? `https://crates.io/crates/${encodeURIComponent(name)}` : null;
    default:
      return null;
  }
}

export function sourceRepoLink(sourceRepo: unknown): string | null {
  if (typeof sourceRepo !== 'string' || !SOURCE_REPO.test(sourceRepo)) return null;
  const [host, owner, repo] = sourceRepo.split('/');
  return `https://${host}/${encodeURIComponent(owner!)}/${encodeURIComponent(repo!)}`;
}

export function advisoryLink(url: unknown): string | null {
  // The pattern already restricts the path to percent-encoded bytes, so it is not encoded again.
  return typeof url === 'string' && ADVISORY_URL.test(url) ? url : null;
}
