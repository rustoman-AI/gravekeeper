import { describe, expect, it } from 'vitest';
import { narrowHints } from '../../../view-model/narrow';
import { parseScanResponse } from '../../../view-model/parse-response';

const ADVISORY = 'https://osv.dev/vulnerability/RUSTSEC-2025-0141';

function hint(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { kind: 'advisory-notice', text: 'bincode is unmaintained', sourceUrl: ADVISORY, ...extra };
}

describe('narrowHints (Requirements 4.7, 4.9, 4.10)', () => {
  it('gives [] for an absent field and for non-arrays', () => {
    expect(narrowHints(undefined)).toEqual([]);
    expect(narrowHints(null)).toEqual([]);
    expect(narrowHints('x')).toEqual([]);
    expect(narrowHints({ 0: hint() })).toEqual([]);
  });

  it('keeps valid hints in order and computes the link', () => {
    const out = narrowHints([
      hint(),
      { kind: 'deprecation-notice', text: 'this library is no longer supported', sourceUrl: null },
    ]);
    expect(out).toEqual([
      {
        kind: 'advisory-notice',
        text: 'bincode is unmaintained',
        sourceUrl: ADVISORY,
        link: { href: ADVISORY, label: 'Read the advisory' },
      },
      { kind: 'deprecation-notice', text: 'this library is no longer supported', sourceUrl: null, link: null },
    ]);
  });

  it('nulls a javascript: sourceUrl but keeps the hint, with no link', () => {
    const out = narrowHints([hint({ sourceUrl: 'javascript:alert(1)' })]);
    expect(out).toHaveLength(1);
    expect(out[0]!.sourceUrl).toBeNull();
    expect(out[0]!.link).toBeNull();
  });

  it('gives a deprecation hint with a valid sourceUrl no link', () => {
    const out = narrowHints([hint({ kind: 'deprecation-notice' })]);
    expect(out[0]!.sourceUrl).toBe(ADVISORY);
    expect(out[0]!.link).toBeNull();
  });

  it('drops an unknown kind, empty text, 601 code points and a newline in the text', () => {
    expect(narrowHints([hint({ kind: 'other' })])).toEqual([]);
    expect(narrowHints([hint({ text: '' })])).toEqual([]);
    expect(narrowHints([hint({ text: 'a'.repeat(601) })])).toEqual([]);
    expect(narrowHints([hint({ text: 'a\nb' })])).toEqual([]);
    expect(narrowHints([hint({ text: 'a'.repeat(600) })])).toHaveLength(1);
    expect(narrowHints([hint({ text: '😀'.repeat(600) })])).toHaveLength(1);
  });

  it('keeps at most three entries', () => {
    const out = narrowHints([1, 2, 3, 4, 5].map((n) => hint({ text: `t${n}` })));
    expect(out.map((h) => h.text)).toEqual(['t1', 't2', 't3']);
  });

  it('is idempotent', () => {
    const once = narrowHints([hint(), hint({ sourceUrl: 'x' })]);
    expect(narrowHints(once)).toEqual(once);
  });
});

describe('parseScanResponse hints', () => {
  function body(entryExtra: Record<string, unknown>): Record<string, unknown> {
    return {
      ok: true,
      asOf: '2026-01-01T00:00:00Z',
      repo: { host: 'github.com', owner: 'o', repo: 'r', branch: 'main', defaultBranch: 'main' },
      discovery: {},
      manifests: [],
      dependencies: [{ dependency: { name: 'a' }, facts: {}, versionBasis: 'pinned', advisories: [], ...entryExtra }],
      assessed: [{}],
      summary: {},
      sources: { github: 'ok', depsdev: 'ok', osv: 'ok', npm: 'ok', cratesio: 'ok', pypi: 'ok' },
      capped: {},
      notes: [],
    };
  }
  const headers = { get: (): string | null => null };

  it('parses a body with no hints anywhere (results recorded before this spec)', () => {
    const out = parseScanResponse(200, headers, body({}));
    expect(out.kind).toBe('result');
    if (out.kind === 'result') expect(out.result.dependencies[0]!.hints).toEqual([]);
  });

  it('narrows hints on each dependency', () => {
    const out = parseScanResponse(200, headers, body({ hints: [hint(), { kind: 'bad' }] }));
    expect(out.kind).toBe('result');
    if (out.kind === 'result') expect(out.result.dependencies[0]!.hints).toHaveLength(1);
  });
});
