import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Validates: Requirements 18.1, 18.2, 17.1

const TESTS_DIR = resolve(__dirname, '..');
const PROPERTY_COUNT = 14;
const TAG = /\/\/\s*Feature:\s*graveyard-art,\s*Property\s+GA-P(\d+)\b/g;
const TITLE = /^\s*(?:it|test)(?:\.\w+)?\(\s*(['"`])(.*?)\1/gm;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

interface Tagged {
  file: string;
  numbers: number[];
  text: string;
}

function collect(): Tagged[] {
  const tagged: Tagged[] = [];
  for (const full of walk(TESTS_DIR)) {
    const text = readFileSync(full, 'utf8');
    const numbers = [...text.matchAll(TAG)].map((m) => Number(m[1]));
    if (numbers.length > 0) {
      tagged.push({ file: relative(TESTS_DIR, full).replace(/\\/g, '/'), numbers, text });
    }
  }
  return tagged;
}

describe('graveyard-art property traceability', () => {
  const tagged = collect();

  it('GA-trace every property number from 1 to 14 appears in exactly one tag', () => {
    const counts = new Map<number, string[]>();
    for (const t of tagged) {
      for (const n of t.numbers) counts.set(n, [...(counts.get(n) ?? []), t.file]);
    }
    const problems: string[] = [];
    for (let n = 1; n <= PROPERTY_COUNT; n++) {
      const files = counts.get(n) ?? [];
      if (files.length !== 1) problems.push(`GA-P${n}: ${files.length} tags (${files.join(', ')})`);
    }
    for (const n of counts.keys()) {
      if (n < 1 || n > PROPERTY_COUNT) problems.push(`GA-P${n} is out of range`);
    }
    expect(problems).toEqual([]);
  });

  it('GA-trace every tagged file has a Validates line', () => {
    const missing = tagged.filter((t) => !/\/\/\s*\**Validates:/.test(t.text)).map((t) => t.file);
    expect(missing).toEqual([]);
  });

  it('GA-trace every test title in a tagged file starts with its GA-P number', () => {
    const bad: string[] = [];
    for (const t of tagged) {
      const prefix = new RegExp(`^GA-P${t.numbers[0]}(?!\\d)`);
      for (const m of t.text.matchAll(TITLE)) {
        if (!prefix.test(m[2] ?? '')) bad.push(`${t.file}: ${m[2]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
