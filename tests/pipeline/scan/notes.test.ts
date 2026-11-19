import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  API_URL_MESSAGE,
  GRAPHQL_HOST_MESSAGE,
  GRAPHQL_URL_MESSAGE,
} from '../../../pipeline/config/config-messages';
import {
  CONFIG_INTERNAL_ERROR_MESSAGES,
  ERROR_CODES,
  INTERNAL_ERROR_MESSAGE,
  INVALID_REQUEST_MESSAGES,
  INVALID_URL_MESSAGES,
  INVALID_URL_UNREADABLE_MESSAGE,
  NOTE_CODES,
  NOTE_MESSAGES,
  SIMPLE_ERROR_MESSAGES,
  WEB_HOST_PLACEHOLDER,
  placeholdersOf,
  renderErrorMessage,
  renderNoteMessage,
} from '../../../pipeline/scan/messages';
import {
  advisoryDetailsIncompleteNote,
  batchFallbackNote,
  conflictingPinsNote,
  dependencyCapExceededNote,
  githubBudgetLowNote,
  githubTokenMissingNote,
  informationalAdvisoryExcludedNote,
  maintainersLowerBoundNote,
  makeSourceNote,
  manifestFetchFailedNote,
  manifestTooLargeNote,
  noDefaultVersionNote,
  noManifestsNote,
  noRootManifestNote,
  osvPaginationIgnoredNote,
  packageNotFoundNote,
  pinNotFoundNote,
  rangeUnresolvedNote,
  scanDeadlineReachedNote,
  sourceRepoUnverifiedNote,
  treeTruncatedNote,
  unmaintainedAdvisoryNote,
} from '../../../pipeline/scan/notes';
import { RANGE_MAX_LENGTH } from '../../../pipeline/constants';
import { parseRepoUrl } from '../../../pipeline/url/parse-repo-url';

// Requirement 17.9, 17.15, 20.5, 20.14, 20.15, 20.16, 21.5

const EM_DASH = '\u2014';

/** Allowed `details` keys per code (the Scan_Note codes table and Requirement 21, criterion 6). */
const ALLOWED_KEYS: Readonly<Record<string, readonly string[]>> = {
  'manifest-too-large': ['path'],
  'manifest-fetch-failed': ['path'],
  'pin-not-found': ['name', 'pinned'],
  'no-default-version': ['name'],
  'conflicting-pins': ['name', 'pins'],
  'package-not-found': ['name', 'ecosystem'],
  'source-repo-unverified': ['name', 'sourceRepo'],
  'informational-advisory-excluded': ['name', 'ids'],
  'advisory-details-incomplete': ['name'],
  'osv-pagination-ignored': ['name'],
  'maintainers-lower-bound': ['name'],
  'dependency-cap-exceeded': ['total', 'limit'],
  'source-partial': ['source'],
  'unmaintained-advisory': ['name', 'ids'],
  'range-unresolved': ['ecosystem', 'name', 'ranges'],
  'branch-not-found': ['branch'],
  'too-many-manifests': ['limit'],
  'manifest-not-found': ['path'],
};

interface SpecTable {
  readonly notes: Map<string, string>;
  readonly invalidUrl: Map<string, string>;
  readonly invalidRequest: Map<string, string>;
  readonly simple: Map<string, string>;
  readonly internal: string[];
}

function readSpecTable(): SpecTable {
  const file = resolve(process.cwd(), '.kiro/specs/scan-pipeline/requirements.md');
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === '## User-facing messages');
  expect(start).toBeGreaterThanOrEqual(0);
  const table: SpecTable = {
    notes: new Map(),
    invalidUrl: new Map(),
    invalidRequest: new Map(),
    simple: new Map(),
    internal: [],
  };
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ') || line.startsWith('### ')) break;
    const m = /^\| `([a-z-]+)` \| (.+?) \| `(.+)` \|$/.exec(line);
    if (m === null) continue;
    const code = m[1] as string;
    const condition = m[2] as string;
    const text = m[3] as string;
    if (condition === 'note') table.notes.set(code, text);
    else if (condition === 'error') table.simple.set(code, text);
    else if (code === 'invalid-url') {
      const part = /`details\.part` `(\w+)`/.exec(condition)?.[1];
      const key = condition.includes('failed unexpectedly') ? 'unreadable' : (part as string);
      expect(table.invalidUrl.has(key)).toBe(false);
      table.invalidUrl.set(key, text);
    } else if (code === 'invalid-request') {
      const reason = /`details\.reason` `([\w-]+)`/.exec(condition)?.[1] as string;
      expect(table.invalidRequest.has(reason)).toBe(false);
      table.invalidRequest.set(reason, text);
    } else if (code === 'internal-error') table.internal.push(text);
  }
  return table;
}

function templates(): { label: string; template: string; code: string }[] {
  return [
    ...Object.entries(NOTE_MESSAGES).map(([code, template]) => ({
      label: `note ${code}`,
      template,
      code,
    })),
    ...Object.entries(INVALID_URL_MESSAGES).map(([part, template]) => ({
      label: `invalid-url ${part}`,
      template,
      code: 'invalid-url',
    })),
    {
      label: 'invalid-url unreadable',
      template: INVALID_URL_UNREADABLE_MESSAGE,
      code: 'invalid-url',
    },
    ...Object.entries(INVALID_REQUEST_MESSAGES).map(([reason, template]) => ({
      label: `invalid-request ${reason}`,
      template,
      code: 'invalid-request',
    })),
    ...Object.entries(SIMPLE_ERROR_MESSAGES).map(([code, template]) => ({
      label: `error ${code}`,
      template,
      code,
    })),
    ...CONFIG_INTERNAL_ERROR_MESSAGES.map((template, i) => ({
      label: `internal-error config ${i}`,
      template,
      code: 'internal-error',
    })),
  ];
}

describe('message table completeness and spec identity', () => {
  const spec = readSpecTable();

  it('has exactly one message per Scan_Note code, no extra codes, texts equal to the spec rows', () => {
    expect([...NOTE_CODES].sort()).toEqual([...spec.notes.keys()].sort());
    expect(Object.keys(NOTE_MESSAGES).sort()).toEqual([...spec.notes.keys()].sort());
    for (const [code, text] of spec.notes) {
      expect(NOTE_MESSAGES[code as keyof typeof NOTE_MESSAGES], code).toBe(text);
    }
  });

  it('has exactly one invalid-url message per part, and the unreadable row, equal to the spec', () => {
    const expected = new Map(spec.invalidUrl);
    expect(expected.delete('unreadable')).toBe(true);
    expect(Object.keys(INVALID_URL_MESSAGES).sort()).toEqual([...expected.keys()].sort());
    for (const [part, text] of expected) {
      expect(INVALID_URL_MESSAGES[part as keyof typeof INVALID_URL_MESSAGES], part).toBe(text);
    }
    expect(INVALID_URL_UNREADABLE_MESSAGE).toBe(spec.invalidUrl.get('unreadable'));
  });

  it('has exactly one invalid-request message per reason, equal to the spec', () => {
    expect(Object.keys(INVALID_REQUEST_MESSAGES).sort()).toEqual(
      [...spec.invalidRequest.keys()].sort(),
    );
    for (const [reason, text] of spec.invalidRequest) {
      expect(INVALID_REQUEST_MESSAGES[reason as keyof typeof INVALID_REQUEST_MESSAGES], reason).toBe(
        text,
      );
    }
  });

  it('has exactly one message per simple error code, equal to the spec; internal-error rows match', () => {
    const simpleSpec = new Map(spec.simple);
    expect(spec.internal).toHaveLength(4);
    expect(CONFIG_INTERNAL_ERROR_MESSAGES).toEqual(spec.internal.slice(0, 3));
    expect(INTERNAL_ERROR_MESSAGE).toBe(spec.internal[3]);
    simpleSpec.set('internal-error', INTERNAL_ERROR_MESSAGE);
    expect(Object.keys(SIMPLE_ERROR_MESSAGES).sort()).toEqual([...simpleSpec.keys()].sort());
    for (const [code, text] of simpleSpec) {
      expect(SIMPLE_ERROR_MESSAGES[code as keyof typeof SIMPLE_ERROR_MESSAGES], code).toBe(text);
    }
  });

  it('covers every error code exactly once', () => {
    const covered = new Set<string>([
      'invalid-url',
      'invalid-request',
      ...Object.keys(SIMPLE_ERROR_MESSAGES),
    ]);
    expect([...covered].sort()).toEqual([...ERROR_CODES].sort());
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
    expect(new Set(NOTE_CODES).size).toBe(NOTE_CODES.length);
  });

  it('uses the texts of the URL parser and of the configuration module', () => {
    const web = 'github.com';
    const inputs: Record<string, string> = {
      url: 'ftp://github.com/a/b',
      host: 'https://example.org/a/b',
      path: 'https://github.com/a',
      owner: 'https://github.com/-a/b',
      repository: 'https://github.com/a/b!',
      branch: 'https://github.com/a/b/tree/x..y',
    };
    for (const [part, input] of Object.entries(inputs)) {
      const r = parseRepoUrl(input, web);
      expect(r.ok, part).toBe(false);
      if (r.ok) continue;
      expect(r.error.details.part).toBe(part);
      expect(r.error.message, part).toBe(
        INVALID_URL_MESSAGES[part as keyof typeof INVALID_URL_MESSAGES].replace(
          WEB_HOST_PLACEHOLDER,
          web,
        ),
      );
    }
    // The parser failing unexpectedly (a non-string host makes it throw) gives the unreadable text.
    const broken = parseRepoUrl('github.com/a/b', undefined as unknown as string);
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.error.message).toBe(INVALID_URL_UNREADABLE_MESSAGE);
    expect(CONFIG_INTERNAL_ERROR_MESSAGES).toEqual([
      API_URL_MESSAGE,
      GRAPHQL_URL_MESSAGE,
      GRAPHQL_HOST_MESSAGE,
    ]);
  });
});

describe('message style', () => {
  for (const { label, template, code } of templates()) {
    it(`${label} follows the style rules`, () => {
      expect(template.endsWith('.')).toBe(true);
      expect(template).not.toContain(EM_DASH);
      expect(template).not.toContain('${');
      expect(template.replace(/\{[A-Za-z]+\}/g, '')).not.toMatch(/\d/);
      const allowed = ALLOWED_KEYS[code] ?? [];
      for (const key of placeholdersOf(template)) expect(allowed, key).toContain(key);
    });
  }

  it('every note renders to a fixed message that is independent of the host', () => {
    for (const code of NOTE_CODES) {
      expect(renderNoteMessage(code, {})).not.toContain('{');
    }
  });
});

describe('Web_Host in invalid-url', () => {
  it('comes from the configuration argument and appears nowhere else', () => {
    for (const host of ['github.com', 'ghe.example.org']) {
      const message = renderErrorMessage('invalid-url', { part: 'host' }, host);
      expect(message).toBe(`Only repositories on ${host} are accepted.`);
    }
    for (const part of ['url', 'path', 'owner', 'repository', 'branch']) {
      expect(renderErrorMessage('invalid-url', { part }, 'ghe.example.org')).toBe(
        INVALID_URL_MESSAGES[part as keyof typeof INVALID_URL_MESSAGES],
      );
    }
  });

  it('does not interpret replacement patterns in the host', () => {
    expect(renderErrorMessage('invalid-url', { part: 'host' }, '$&x')).toBe(
      'Only repositories on $&x are accepted.',
    );
  });

  it('falls back to the url row for an unknown part', () => {
    expect(renderErrorMessage('invalid-url', { part: 'zzz' }, 'h')).toBe(INVALID_URL_MESSAGES.url);
  });
});

describe('note builders', () => {
  it('give each code its fixed message and the details of the codes table', () => {
    const notes = [
      treeTruncatedNote(),
      noManifestsNote(),
      noRootManifestNote(['a/package.json']),
      manifestTooLargeNote('package.json'),
      manifestFetchFailedNote('package.json'),
      pinNotFoundNote('npm', 'left-pad', '1.0.0'),
      noDefaultVersionNote('npm', 'left-pad'),
      conflictingPinsNote('npm', 'left-pad', ['2', '1']),
      packageNotFoundNote('pypi', 'foo'),
      batchFallbackNote(),
      sourceRepoUnverifiedNote('npm', 'foo', 'o/r'),
      informationalAdvisoryExcludedNote('npm', 'foo', ['B', 'A']),
      advisoryDetailsIncompleteNote('npm', 'foo', ['A']),
      osvPaginationIgnoredNote('npm', 'foo'),
      githubTokenMissingNote(),
      githubBudgetLowNote(3, '2030-01-01T00:00:00.000Z'),
      maintainersLowerBoundNote('cargo', 'foo'),
      dependencyCapExceededNote({ limit: 5, total: 9 }),
      scanDeadlineReachedNote(),
      unmaintainedAdvisoryNote('cargo', 'foo', ['RUSTSEC-1']),
      rangeUnresolvedNote('npm', 'foo', ['^1', '^1']),
      makeSourceNote({
        source: 'osv',
        status: 'partial',
        reasons: ['timeout'],
        failedUnits: 1,
        applicableUnits: 2,
      } as never),
      makeSourceNote({
        source: 'osv',
        status: 'failed',
        reasons: ['timeout'],
        failedUnits: 2,
        applicableUnits: 2,
      } as never),
    ];
    expect(new Set(notes.map((n) => n.code))).toEqual(new Set(NOTE_CODES));
    for (const n of notes) {
      expect(n.message).toBe(renderNoteMessage(n.code, n.details));
      expect(n.message).not.toContain('{');
      expect(n.message).not.toContain('${');
      for (const key of placeholdersOf(NOTE_MESSAGES[n.code])) {
        expect(Object.keys(n.details ?? {}), `${n.code} ${key}`).toContain(key);
      }
    }
  });

  it('renders lists joined by a comma and a space, in the order stored in details', () => {
    const n = conflictingPinsNote('npm', 'x', ['b', 'a', 'b']);
    expect(n.details).toMatchObject({ pins: ['a', 'b'] });
    expect(n.message).toBe(
      'x is pinned to different versions in different manifests (a, b). The latest release was checked instead.',
    );
  });

  it('range-unresolved: only {name} is a placeholder, ranges is stored but never rendered', () => {
    expect(placeholdersOf(NOTE_MESSAGES['range-unresolved'])).toEqual(['name']);
    const n = rangeUnresolvedNote('npm', 'foo', ['>=2 \u2014 {name}', '^1', '^1', '>=2 \u2014 {name}']);
    expect(n.details).toEqual({ ecosystem: 'npm', name: 'foo', ranges: ['>=2 \u2014 {name}', '^1'] });
    expect(n.message).toBe(NOTE_MESSAGES['range-unresolved'].replace('{name}', 'foo'));
    expect(n.message).not.toContain('^1');
    expect(n.message).not.toContain(EM_DASH);
  });

  it('range-unresolved: ranges are cut to RANGE_MAX_LENGTH code points, distinct, ascending', () => {
    const long = '\u{1F600}'.repeat(RANGE_MAX_LENGTH + 5);
    const cut = '\u{1F600}'.repeat(RANGE_MAX_LENGTH);
    const n = rangeUnresolvedNote('npm', 'foo', ['b', long, 'a', long]);
    expect(n.details).toEqual({ ecosystem: 'npm', name: 'foo', ranges: ['a', 'b', cut] });
  });

  it('omits resetAt from github-budget-low details when not observed', () => {
    expect(githubBudgetLowNote(4).details).toEqual({ remaining: 4 });
    expect(githubBudgetLowNote(4, null).details).toEqual({ remaining: 4 });
    expect(githubBudgetLowNote(4, 'x').details).toEqual({ remaining: 4, resetAt: 'x' });
  });

  it('never puts a numeric rate limit in the github-budget-low message', () => {
    expect(githubBudgetLowNote(7, 'x').message).toBe(NOTE_MESSAGES['github-budget-low']);
  });

  it('source notes: reasons are unique and in code point order', () => {
    const n = makeSourceNote({
      source: 'github',
      status: 'partial',
      reasons: ['timeout', 'http-5xx', 'timeout', 'deadline', 'http-5xx'],
      failedUnits: 1,
      applicableUnits: 3,
    } as never);
    expect(n.code).toBe('source-partial');
    expect(n.details).toEqual({
      source: 'github',
      reasons: ['deadline', 'http-5xx', 'timeout'],
      failedUnits: 1,
      applicableUnits: 3,
    });
    expect(n.message).toBe('github answered only some requests. Some facts that depend on it are unknown.');
    const f = makeSourceNote({
      source: 'github',
      status: 'failed',
      reasons: [],
      failedUnits: 3,
      applicableUnits: 3,
    } as never);
    expect(f.code).toBe('source-failed');
    expect(f.message).toBe(NOTE_MESSAGES['source-failed']);
  });
});
