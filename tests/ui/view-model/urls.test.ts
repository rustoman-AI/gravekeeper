import { describe, expect, it } from 'vitest';
import type { ParsedScanResult, UrlState } from '../../../view-model/types';
import {
  advisoryLink,
  buildRequestBody,
  buildUrl,
  canonicalRepoUrl,
  parseUrlState,
  registryLink,
  sourceRepoLink,
} from '../../../view-model/urls';

type Repo = ParsedScanResult['repo'];
const repoOf = (branch: string, defaultBranch: string): Repo =>
  ({ host: 'github.com', owner: 'o', repo: 'r', branch, defaultBranch }) as Repo;

describe('parseUrlState', () => {
  it('handles no query', () => {
    expect(parseUrlState('')).toEqual({ repo: null, manifests: [], view: 'scene' });
  });
  it('treats empty repo as null', () => {
    expect(parseUrlState('?repo=').repo).toBeNull();
  });
  it('keeps repeated manifest values in order', () => {
    expect(parseUrlState('?manifest=a%2Fb&manifest=c').manifests).toEqual(['a/b', 'c']);
  });
  it('falls back to scene for an unknown view', () => {
    expect(parseUrlState('?view=bogus').view).toBe('scene');
    expect(parseUrlState('?view=list').view).toBe('list');
  });
});

describe('buildUrl', () => {
  it('builds each combination and round trips', () => {
    const states: UrlState[] = [
      { repo: null, manifests: [], view: 'scene' },
      { repo: 'a/b', manifests: [], view: 'scene' },
      { repo: 'a/b', manifests: ['x&y', 'z'], view: 'scene' },
      { repo: 'a/b', manifests: [], view: 'list' },
      { repo: 'a/b', manifests: ['m'], view: 'list' },
    ];
    expect(buildUrl(states[0]!)).toBe('/');
    expect(buildUrl(states[1]!)).toBe('/?repo=a%2Fb');
    expect(buildUrl(states[3]!)).toBe('/?repo=a%2Fb&view=list');
    for (const s of states) {
      const url = buildUrl(s);
      expect(parseUrlState(url.slice(1))).toEqual(s);
    }
  });
});

describe('canonicalRepoUrl', () => {
  it('omits the branch when it is the default', () => {
    expect(canonicalRepoUrl(repoOf('main', 'main'))).toBe('https://github.com/o/r');
  });
  it('appends /tree/<branch> otherwise', () => {
    expect(canonicalRepoUrl(repoOf('feat/x y', 'main'))).toBe('https://github.com/o/r/tree/feat/x%20y');
  });
});

describe('buildRequestBody', () => {
  it('has only repoUrl without manifests', () => {
    expect(Object.keys(buildRequestBody({ repo: 'a/b', manifests: [], view: 'list' }))).toEqual(['repoUrl']);
  });
  it('adds manifests when present', () => {
    const body = buildRequestBody({ repo: 'a/b', manifests: ['m'], view: 'scene' });
    expect(Object.keys(body).sort()).toEqual(['manifests', 'repoUrl']);
  });
});

describe('links', () => {
  it('builds registry links', () => {
    expect(registryLink('npm', '@types/node')).toBe('https://www.npmjs.com/package/@types/node');
    expect(registryLink('pypi', 'flask-script')).toBe('https://pypi.org/project/flask-script/');
    expect(registryLink('cargo', 'serde')).toBe('https://crates.io/crates/serde');
  });
  it('rejects invalid registry names', () => {
    expect(registryLink('npm', 'javascript:alert(1)')).toBeNull();
    expect(registryLink('pypi', 'data:text/html,x')).toBeNull();
  });
  it('validates the source repo pattern', () => {
    expect(sourceRepoLink('github.com/a/b')).toBe('https://github.com/a/b');
    expect(sourceRepoLink('gitlab.com/a/b')).toBeNull();
    expect(sourceRepoLink('github.com/a')).toBeNull();
  });
  it('accepts advisory urls with % sequences unchanged', () => {
    const url = 'https://osv.dev/vulnerability/GHSA-a%2Fb';
    expect(advisoryLink(url)).toBe(url);
  });
  it('gives null for javascript: and data: inputs', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x']) {
      expect(advisoryLink(bad)).toBeNull();
      expect(sourceRepoLink(bad)).toBeNull();
    }
  });
});
