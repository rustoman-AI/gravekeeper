// Feature: graveyard-ui, Property 33: Built links are safe
// Validates: Requirements 21.3, 21.4, 21.7
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Ecosystem } from '../../../core';
import { LINK_HOSTS } from '../../../view-model/constants';
import type { ParsedScanResult } from '../../../view-model/types';
import {
  advisoryLink,
  canonicalRepoUrl,
  registryLink,
  sourceRepoLink,
} from '../../../view-model/urls';
import { cfg } from '../../support/fc-config';

const ECOSYSTEMS: readonly Ecosystem[] = ['npm', 'pypi', 'cargo'];

const HOSTILE_PREFIXES = ['javascript:', 'data:', 'JaVaScRiPt:', 'http://', 'https://', '//', 'vbscript:', ''];
const HOSTILE_PARTS = ['"', "'", '<', '>', '%', '%00', '%zz', '%2e%2e', '\n', '\r\n', '\t', ' ', '\\', '@', '#', '?', '..', '/', ':'];

const hostile = fc
  .tuple(
    fc.constantFrom(...HOSTILE_PREFIXES),
    fc.array(
      fc.oneof(fc.string({ maxLength: 12 }), fc.constantFrom(...HOSTILE_PARTS), fc.string({ unit: 'binary', maxLength: 6 })),
      { maxLength: 10 },
    ),
  )
  .map(([prefix, parts]) => prefix + parts.join(''));

const veryLong = fc.integer({ min: 1000, max: 20000 }).map((n) => 'a'.repeat(n));
const text = fc.oneof(hostile, hostile, fc.string(), veryLong);

const plausibleName = fc.stringMatching(/^[A-Za-z0-9._~-]{1,20}$/);
const names = fc.oneof(
  text,
  plausibleName,
  fc.tuple(plausibleName, plausibleName).map(([a, b]) => `@${a}/${b}`),
);
const sourceRepos = fc.oneof(
  text,
  fc.tuple(plausibleName, plausibleName).map(([o, r]) => `github.com/${o}/${r}`),
  fc.tuple(text, text).map(([o, r]) => `github.com/${o}/${r}`),
);
const advisoryUrls = fc.oneof(
  text,
  text.map((s) => `https://osv.dev/vulnerability/${s}`),
  fc.stringMatching(/^[A-Za-z0-9._:%-]{1,40}$/).map((s) => `https://osv.dev/vulnerability/${s}`),
);
const repoHosts = fc.oneof(
  fc.constantFrom('github.com', 'ghe.example.com', 'git.corp.test'),
  fc.stringMatching(/^[a-z][a-z0-9-]{0,10}(\.[a-z][a-z0-9-]{0,10}){1,2}$/),
);

function expectSafe(link: string | null, allowedHosts: readonly string[]): void {
  if (link === null) return;
  expect(link.startsWith('https://')).toBe(true);
  // encodeURIComponent keeps "'" (an RFC 3986 sub-delim), so it is not part of the check.
  expect(link).not.toMatch(/[\s"<>\\\u0000-\u001f\u007f]/);
  const url = new URL(link);
  expect(url.protocol).toBe('https:');
  expect(url.username).toBe('');
  expect(url.password).toBe('');
  expect(allowedHosts).toContain(url.hostname);
  expect(url.hash).toBe('');
}

describe('P33: Built links are safe', () => {
  it('registryLink is null or an https link to a registry host', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ECOSYSTEMS, 'other' as unknown as Ecosystem), names, (eco, name) => {
        expectSafe(registryLink(eco, name), LINK_HOSTS);
      }),
      cfg(),
    );
  });

  it('registryLink gives null for non-string names', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ECOSYSTEMS),
        fc.oneof(fc.constant(null), fc.constant(undefined), fc.integer(), fc.object()),
        (eco, name) => {
          expect(registryLink(eco, name as unknown as string)).toBeNull();
        },
      ),
      cfg(),
    );
  });

  it('sourceRepoLink is null or an https link to a LINK_HOSTS host', () => {
    fc.assert(
      fc.property(sourceRepos, (s) => {
        expectSafe(sourceRepoLink(s), LINK_HOSTS);
      }),
      cfg(),
    );
  });

  it('advisoryLink is null or an https link to a LINK_HOSTS host', () => {
    fc.assert(
      fc.property(advisoryUrls, (u) => {
        expectSafe(advisoryLink(u), LINK_HOSTS);
      }),
      cfg(),
    );
  });

  it('non-string sourceRepo and advisory url give null', () => {
    fc.assert(
      fc.property(fc.oneof(fc.constant(null), fc.constant(undefined), fc.integer(), fc.object()), (v) => {
        expect(sourceRepoLink(v)).toBeNull();
        expect(advisoryLink(v)).toBeNull();
      }),
      cfg(),
    );
  });

  it('javascript: and data: inputs never produce a link', () => {
    fc.assert(
      fc.property(fc.constantFrom('javascript:', 'data:', 'JAVASCRIPT:', 'Data:'), text, (prefix, rest) => {
        const s = prefix + rest;
        expect(sourceRepoLink(s)).toBeNull();
        expect(advisoryLink(s)).toBeNull();
        for (const eco of ECOSYSTEMS) expect(registryLink(eco, s)).toBeNull();
      }),
      cfg(),
    );
  });

  it('canonicalRepoUrl stays on https and the Scan_Result repo host, whatever the owner, repo and branch', () => {
    fc.assert(
      fc.property(repoHosts, text, text, text, text, (host, owner, repoName, branch, defaultBranch) => {
        const repo = { host, owner, repo: repoName, branch, defaultBranch } as unknown as ParsedScanResult['repo'];
        const link = canonicalRepoUrl(repo);
        expectSafe(link, [...LINK_HOSTS, host]);
      }),
      cfg(),
    );
  });
});
