import * as fc from 'fast-check';
import { BRANCH_MAX_LENGTH, OWNER_MAX_LENGTH, REPO_NAME_MAX_LENGTH } from '../../../pipeline/constants';
import type { RepoRef } from '../../../pipeline/url/parse-repo-url';

// Requirement 1.1 to 1.15: valid parts, spelling variants, branches with percent-encoding and `/`.

export const WEB_HOSTS = ['github.com', 'ghe.example.co.uk'] as const;

const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');

const alnumWord = fc.string({ unit: fc.constantFrom(...ALNUM), minLength: 1, maxLength: 10 });

// Requirement 1.8
export const validOwner: fc.Arbitrary<string> = fc
  .array(alnumWord, { minLength: 1, maxLength: 3 })
  .map((words) => words.join('-'))
  .filter((owner) => owner.length <= OWNER_MAX_LENGTH);

// Requirement 1.9: after one `.git` is removed the name must not end in `.git`, so a name that
// ends in `.git` is not a valid Repo_Ref repo (OQ29). This is the definition of valid, not a narrowing.
export const validRepo: fc.Arbitrary<string> = fc
  .string({
    unit: fc.constantFrom(...ALNUM, '.', '_', '-', '.', 'g', 'i', 't'),
    minLength: 1,
    maxLength: REPO_NAME_MAX_LENGTH,
  })
  .filter((repo) => repo !== '.' && repo !== '..' && !repo.endsWith('.git'));

// Characters that need percent-encoding in a branch, plus non-ASCII and astral code points.
const BRANCH_UNITS = [
  ...ALNUM,
  '-', '.', '_', '+', '#', '%', '&', '!', "'", '(', ')', '=', ',', ';', '<', '>', '|', '"', '{', '}', '`', '$', '@',
  'é', '日', 'ß', '😀', '\u{10348}',
];

// One non-empty branch segment: no `/`.
const branchSegment = fc.string({ unit: fc.constantFrom(...BRANCH_UNITS), minLength: 1, maxLength: 12 });

// Requirement 1.10: filter states the validity rules the parser must accept.
function branchIsValid(branch: string): boolean {
  if (Array.from(branch).length > BRANCH_MAX_LENGTH) return false;
  if (branch.includes('..') || branch.includes('@{') || branch.includes('//')) return false;
  if (branch.startsWith('-') || branch.startsWith('/')) return false;
  if (branch.endsWith('/') || branch.endsWith('.') || branch.endsWith('.lock')) return false;
  return true;
}

export const validBranch: fc.Arbitrary<string> = fc
  .array(branchSegment, { minLength: 1, maxLength: 5 })
  .map((segments) => segments.join('/'))
  .filter(branchIsValid);

export const validRepoRef = (hosts: readonly string[] = WEB_HOSTS): fc.Arbitrary<RepoRef> =>
  fc.record({
    host: fc.constantFrom(...hosts),
    owner: validOwner,
    repo: validRepo,
    branch: fc.option(validBranch, { nil: null }),
  });

const hex = (code: number, lower: boolean): string => {
  const text = code.toString(16).padStart(2, '0');
  return lower ? text : text.toUpperCase();
};

// Percent-encodes every UTF-8 byte of `char`, in the given hex case.
function encodeChar(char: string, lower: boolean): string {
  return Array.from(new TextEncoder().encode(char), (byte) => `%${hex(byte, lower)}`).join('');
}

// Requirement 1.2: each character is written raw or percent-encoded. `%`, `#` and `?` are always
// encoded because written raw they would not be part of the branch.
function spellBranch(branch: string, choices: readonly boolean[], lower: boolean): string {
  let out = '';
  let index = 0;
  for (const char of branch) {
    const raw = choices[index++ % choices.length] as boolean;
    const mustEncode = char === '%' || char === '#' || char === '?';
    out += char === '/' || (raw && !mustEncode) ? char : encodeChar(char, lower);
  }
  return out;
}

const caseVariant = (text: string): fc.Arbitrary<string> =>
  fc
    .array(fc.boolean(), { minLength: text.length, maxLength: text.length })
    .map((flags) => Array.from(text, (c, i) => (flags[i] ? c.toUpperCase() : c.toLowerCase())).join(''));

export interface UrlSpelling {
  readonly input: string;
  readonly expected: RepoRef;
}

// Requirement 1.1 to 1.4, 1.15: any accepted spelling of `ref`, with the Repo_Ref it must parse to.
export const urlSpelling = (ref: RepoRef): fc.Arbitrary<UrlSpelling> =>
  fc
    .record({
      scheme: fc.constantFrom('', 'http://', 'https://'),
      schemeCase: fc.boolean(),
      www: fc.constantFrom('', 'www.'),
      wwwCase: fc.boolean(),
      host: caseVariant(ref.host),
      dotGit: fc.boolean(),
      slash: fc.boolean(),
      suffix: fc.constantFrom('', '#frag', '#', '?tab=repositories', '?tab=x&tab=y#top', '?tab'),
      choices: fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }),
      lower: fc.boolean(),
      space: fc.constantFrom('', ' ', '\t', '\n', ' \u00a0'),
    })
    .map((v) => {
      const scheme = v.schemeCase ? v.scheme.toUpperCase() : v.scheme;
      const www = v.wwwCase ? v.www.toUpperCase() : v.www;
      const tail =
        ref.branch === null
          ? ''
          : `/tree/${spellBranch(ref.branch, v.choices, v.lower)}`;
      const git = v.dotGit ? '.git' : '';
      const path = `/${ref.owner}/${ref.repo}${git}${tail}${v.slash ? '/' : ''}`;
      const input = `${v.space}${scheme}${www}${v.host}${path}${v.suffix}${v.space}`;
      return { input, expected: ref };
    });

export const refWithSpelling = (
  hosts: readonly string[] = WEB_HOSTS,
): fc.Arbitrary<{ readonly webHost: string; readonly spelling: UrlSpelling }> =>
  validRepoRef(hosts).chain((ref) =>
    urlSpelling(ref).map((spelling) => ({ webHost: ref.host, spelling })),
  );

// Requirement 1.14: arbitrary text for totality. Mixes unrestricted code units (lone surrogates,
// controls), full Unicode, URL-shaped text and accepted spellings with a random splice.
export const anyInputString: fc.Arbitrary<string> = fc.oneof(
  fc.string({ unit: 'binary', maxLength: 80 }),
  fc.string({ unit: 'grapheme', maxLength: 80 }),
  fc.string({ unit: fc.constantFrom(...'/:@?#%.-_ aAgGhHtTpPsSwW1é日\t\u0000\ud800\udc00'.split('')), maxLength: 80 }),
  fc.string({ unit: 'binary', minLength: 500, maxLength: 700 }),
  fc
    .tuple(
      validRepoRef().chain((ref) => urlSpelling(ref)),
      fc.nat(400),
      fc.string({ unit: 'binary', maxLength: 6 }),
    )
    .map(([s, at, junk]) => {
      const i = at % (s.input.length + 1);
      return s.input.slice(0, i) + junk + s.input.slice(i);
    }),
  fc
    .tuple(validRepoRef().chain((ref) => urlSpelling(ref)), fc.nat(400))
    .map(([s, at]) => s.input.slice(0, at % (s.input.length + 1))),
  fc.constantFrom('', ' ', 'github.com', 'https://', 'https://github.com', '%', '/tree/', '\ud800'),
);

export type MutationKind = 'host' | 'port' | 'userinfo' | 'query' | 'segment';

export interface MutatedUrl {
  readonly webHost: string;
  readonly original: string;
  readonly kind: MutationKind;
  readonly input: string;
}

const OTHER_HOSTS = [
  'example.org',
  'gitlab.com',
  'github.com.evil.example',
  'notgithub.com',
  'github.co',
  'www.www.github.com',
  'bitbucket.org',
];
const SCHEME_AND_WWW = /^((?:[A-Za-z]+:\/\/)?(?:www\.)?)[^/?#]+/i;

// Requirement 1.17: applies exactly one mutation to an accepted spelling.
export const mutatedUrl = (hosts: readonly string[] = WEB_HOSTS): fc.Arbitrary<MutatedUrl> =>
  validRepoRef(hosts).chain((ref) =>
    fc
      .record({
        spelling: urlSpelling(ref),
        kind: fc.constantFrom<MutationKind>('host', 'port', 'userinfo', 'query', 'segment'),
        otherHost: fc.constantFrom(...OTHER_HOSTS),
        port: fc.oneof(fc.nat({ max: 99999 }).map(String), fc.constant('')),
        user: fc.tuple(alnumWord, fc.option(alnumWord, { nil: null })),
        queryName: fc.constantFrom('foo', 'x', 'tabs', 'TAB', 'Tab', 'tab2', 'ref', 'a.b'),
        queryValue: fc.option(fc.constantFrom('1', 'x', ''), { nil: null }),
        order: fc.boolean(),
        segment: fc.constantFrom('blob', 'issues', 'pulls', 'Tree', 'commits'),
      })
      .map((v) => {
        // Branches percent-encode `?` and `#`, so the first raw one starts the suffix.
        const trimmed = v.spelling.input.trim();
        const cut = trimmed.search(/[?#]/);
        const base = (cut < 0 ? trimmed : trimmed.slice(0, cut)).replace(/\/$/, '');
        let input: string;
        switch (v.kind) {
          case 'host':
            input = base.replace(SCHEME_AND_WWW, `$1${v.otherHost}`);
            break;
          case 'port':
            input = base.replace(/^((?:[A-Za-z]+:\/\/)?(?:www\.)?[^/?#]+)/i, `$1:${v.port}`);
            break;
          case 'userinfo':
            input = base.replace(
              /^((?:[A-Za-z]+:\/\/)?)/,
              `$1${v.user[0]}${v.user[1] === null ? '' : `:${v.user[1]}`}@`,
            );
            break;
          case 'query': {
            const param = v.queryValue === null ? v.queryName : `${v.queryName}=${v.queryValue}`;
            input = v.order ? `${base}?${param}&tab=x` : `${base}?tab=x&${param}`;
            break;
          }
          case 'segment':
            input =
              ref.branch === null
                ? `${base}/${v.segment}`
                : base.replace(
                    /^((?:[A-Za-z]+:\/\/)?[^/]+\/[^/]+\/[^/]+)\/tree\//i,
                    `$1/${v.segment}/`,
                  );
            break;
        }
        return { webHost: ref.host, original: v.spelling.input, kind: v.kind, input };
      }),
  );
