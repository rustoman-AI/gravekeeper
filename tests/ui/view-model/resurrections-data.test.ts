import { describe, expect, it } from 'vitest';
import type { Ecosystem } from '../../../core';
import data from '../../../data/resurrections.json';
import { CURATED_MAX_ALTERNATIVES, CURATED_WHY_MAX_LENGTH } from '../../../view-model/constants';
import { isValidName, normalizeName } from '../../../view-model/resurrect-names';
import { CURATED_ENTRIES, loadCurated } from '../../../view-model/resurrections';

const ORDER: readonly Ecosystem[] = ['npm', 'pypi', 'cargo'];
const REGISTRY_PAGE: Record<Ecosystem, (from: string) => string> = {
  npm: (from) => `https://www.npmjs.com/package/${from}`,
  pypi: (from) => `https://pypi.org/project/${from}/`,
  cargo: (from) => `https://crates.io/crates/${from}`,
};

function isMachineEndpoint(raw: string): boolean {
  const url = new URL(raw);
  const host = url.hostname;
  if (host === 'registry.npmjs.org' || host === 'api.osv.dev' || host === 'api.deps.dev') return true;
  if (host === 'raw.githubusercontent.com' || host === 'api.github.com') return true;
  if (host === 'pypi.org') return url.pathname.startsWith('/pypi/') && url.pathname.endsWith('/json');
  if (host === 'crates.io') return url.pathname.startsWith('/api/');
  return false;
}
const entries = (data as { entries: Array<Record<string, unknown>> }).entries;
const typed = entries as unknown as ReadonlyArray<{
  ecosystem: Ecosystem;
  from: string;
  to: string[];
  why: string;
  source: string;
  evidence: string;
}>;

describe('data/resurrections.json', () => {
  it('has only the entries key at the top', () => {
    expect(Object.keys(data)).toEqual(['entries']);
  });

  it('gives every entry exactly the six keys with the right types (7.1)', () => {
    for (const e of entries) {
      expect(Object.keys(e).sort()).toEqual(['ecosystem', 'evidence', 'from', 'source', 'to', 'why']);
      expect(ORDER).toContain(e['ecosystem']);
      expect(typeof e['from']).toBe('string');
      expect(Array.isArray(e['to'])).toBe(true);
      expect(typeof e['why']).toBe('string');
      expect(typeof e['source']).toBe('string');
      expect(typeof e['evidence']).toBe('string');
    }
  });

  it('has valid names, 1 to 4 distinct targets, and no self replacement', () => {
    for (const e of typed) {
      expect(isValidName(e.ecosystem, e.from), `${e.ecosystem}/${e.from}`).toBe(true);
      expect(e.to.length).toBeGreaterThanOrEqual(1);
      expect(e.to.length).toBeLessThanOrEqual(CURATED_MAX_ALTERNATIVES);
      expect(new Set(e.to).size, `${e.from} has duplicate targets`).toBe(e.to.length);
      for (const t of e.to) {
        expect(isValidName(e.ecosystem, t), `${e.ecosystem}/${t}`).toBe(true);
        expect(normalizeName(e.ecosystem, t), `${e.from} -> itself`).not.toBe(normalizeName(e.ecosystem, e.from));
      }
    }
  });

  it('has no target that is the from of an entry of the same ecosystem', () => {
    for (const e of typed) {
      const froms = new Set(typed.filter((o) => o.ecosystem === e.ecosystem).map((o) => normalizeName(e.ecosystem, o.from)));
      for (const t of e.to) expect(froms.has(normalizeName(e.ecosystem, t)), `${e.from} -> ${t}`).toBe(false);
    }
  });

  it('has https source and evidence without credentials', () => {
    for (const e of typed) {
      for (const raw of [e.source, e.evidence]) {
        const url = new URL(raw);
        expect(url.protocol, e.from).toBe('https:');
        expect(url.username + url.password, e.from).toBe('');
      }
    }
  });

  it('never uses a machine endpoint as source (7.3)', () => {
    for (const e of typed) expect(isMachineEndpoint(e.source), `${e.from}: ${e.source}`).toBe(false);
  });

  it('links the registry page when the evidence is a machine endpoint (7.4)', () => {
    for (const e of typed) {
      if (!isMachineEndpoint(e.evidence)) continue;
      expect(e.source, e.from).toBe(REGISTRY_PAGE[e.ecosystem](e.from));
    }
  });

  it('has one-sentence why of at most the limit, with no URL or line break', () => {
    for (const e of typed) {
      expect(e.why.length, e.from).toBeLessThanOrEqual(CURATED_WHY_MAX_LENGTH);
      expect(e.why.endsWith('.'), e.from).toBe(true);
      expect(/[\r\n]|:\/\/|www\./i.test(e.why), e.from).toBe(false);
      expect(/[.!?]\s/.test(e.why), `${e.from} has two sentences`).toBe(false);
    }
  });

  it('is sorted by ecosystem then from in code point order', () => {
    const key = (e: { ecosystem: Ecosystem; from: string }) => [ORDER.indexOf(e.ecosystem), e.from] as const;
    for (let i = 1; i < typed.length; i++) {
      const [ea, fa] = key(typed[i - 1]);
      const [eb, fb] = key(typed[i]);
      const ok = ea < eb || (ea === eb && fa < fb);
      expect(ok, `${typed[i - 1].from} before ${typed[i].from}`).toBe(true);
    }
  });

  it('has no duplicate normalized from', () => {
    const keys = typed.map((e) => `${e.ecosystem}/${normalizeName(e.ecosystem, e.from)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has at least 8 entries per ecosystem', () => {
    for (const eco of ORDER) {
      expect(typed.filter((e) => e.ecosystem === eco).length, eco).toBeGreaterThanOrEqual(8);
    }
  });

  it('has no entry with from uuid', () => {
    expect(typed.some((e) => normalizeName(e.ecosystem, e.from) === 'uuid')).toBe(false);
  });

  it('loads every entry (nothing dropped silently)', () => {
    expect(CURATED_ENTRIES.length).toBe(entries.length);
    expect(loadCurated(data)).toEqual(CURATED_ENTRIES);
  });
});
