import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Validates: Requirements 9.1

const TESTS_DIR = resolve(__dirname, '..');
const SCAN_DIRS = ['core', 'pipeline', 'ui'].map((d) => join(TESTS_DIR, d));
const PROPERTY_COUNT = 4;
const TAG = /Feature:\s*art-polish,\s*Property\s+AP-P(\d+)/g;
const TITLE = /^\s*(?:it|test)(?:\.\w+)?\(\s*(['"`])(.*?)\1/gm;

function walk(dir: string): string[] {
  const out: string[] = [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
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
  for (const dir of SCAN_DIRS) {
    for (const full of walk(dir)) {
      const text = readFileSync(full, 'utf8');
      const numbers = [...text.matchAll(TAG)].map((m) => Number(m[1]));
      if (numbers.length > 0) {
        tagged.push({ file: relative(TESTS_DIR, full).replace(/\\/g, '/'), numbers, text });
      }
    }
  }
  return tagged;
}

describe('art-polish property traceability', () => {
  const tagged = collect();

  it('AP-trace every property number from 1 to 4 appears in exactly one tag', () => {
    const counts = new Map<number, string[]>();
    for (const t of tagged) {
      for (const n of t.numbers) counts.set(n, [...(counts.get(n) ?? []), t.file]);
    }
    const problems: string[] = [];
    for (let n = 1; n <= PROPERTY_COUNT; n++) {
      const files = counts.get(n) ?? [];
      if (files.length !== 1) problems.push(`AP-P${n}: ${files.length} tags (${files.join(', ')})`);
    }
    for (const n of counts.keys()) {
      if (n < 1 || n > PROPERTY_COUNT) problems.push(`AP-P${n} is out of range`);
    }
    expect(problems).toEqual([]);
  });

  it('AP-trace every tagged file has a Validates line', () => {
    const missing = tagged.filter((t) => !/\/\/\s*\**Validates:/.test(t.text)).map((t) => t.file);
    expect(missing).toEqual([]);
  });

  it('AP-trace every test title in a tagged file starts with its AP-P number', () => {
    const bad: string[] = [];
    for (const t of tagged) {
      const prefix = new RegExp(`^AP-P${t.numbers[0]}(?!\\d)`);
      for (const m of t.text.matchAll(TITLE)) {
        if (!prefix.test(m[2] ?? '')) bad.push(`${t.file}: ${m[2]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
