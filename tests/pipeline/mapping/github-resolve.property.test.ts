import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BRANCH_MAX_LENGTH } from '../../../pipeline/constants';
import { readCommitSha, readRepository } from '../../../pipeline/mapping/github-resolve';
import { arbJson } from '../../support/arbitraries/json';
import { cfg } from '../../support/fc-config';

const HEX40 = /^[0-9a-fA-F]{40}$/;

describe('github-resolve properties', () => {
  // Feature: scan-pipeline, Property 6: Repository and branch responses give a commit or a typed error
  // Validates: Requirements 3.11
  it('readRepository never throws and gives a well-formed repository or invalid', () => {
    fc.assert(
      fc.property(arbJson, fc.option(fc.string({ maxLength: 8 }), { nil: null }), (body, requested) => {
        const r = readRepository(body, requested);
        if (r.ok) {
          const v = r.value;
          if (v.private) {
            expect(v.owner).toBe('');
            expect(v.repo).toBe('');
          } else {
            expect(v.owner.length).toBeGreaterThan(0);
            expect(v.repo.length).toBeGreaterThan(0);
            expect(v.owner.includes('/')).toBe(false);
            expect(v.repo.includes('/')).toBe(false);
            if (v.defaultBranch !== null) {
              // Oracle counts code points (user-approved change from UTF-16 units).
              const points = Array.from(v.defaultBranch).length;
              expect(points).toBeGreaterThan(0);
              expect(points).toBeLessThanOrEqual(BRANCH_MAX_LENGTH);
            } else {
              expect(requested).not.toBeNull();
            }
          }
        } else {
          expect(r.error).toBe('invalid');
        }
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 6: Repository and branch responses give a commit or a typed error
  // Validates: Requirements 3.11
  it('readCommitSha never throws and gives 40 hexadecimal characters or null', () => {
    fc.assert(
      fc.property(arbJson, (body) => {
        const sha = readCommitSha(body);
        if (sha !== null) expect(sha).toMatch(HEX40);
      }),
      cfg(),
    );
  });

  // Feature: scan-pipeline, Property 6: Repository and branch responses give a commit or a typed error
  // Validates: Requirements 3.11
  it('readCommitSha accepts exactly 40 hexadecimal characters under commit.sha', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (s) => {
        const sha = readCommitSha({ commit: { sha: s } });
        expect(sha).toBe(HEX40.test(s) ? s : null);
      }),
      cfg(),
    );
  });
});
