import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

/** Blank out comments (keeping line structure) so prose never triggers a rule. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p: string) => p + " ".repeat(m.length - p.length));
}

interface Hit {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

function scan(files: readonly string[], pattern: RegExp): Hit[] {
  const hits: Hit[] = [];
  for (const file of files) {
    const lines = stripComments(readFileSync(file, "utf8")).split("\n");
    lines.forEach((text, i) => {
      if (pattern.test(text)) hits.push({ file: relative(root, file), line: i + 1, text: text.trim() });
    });
  }
  return hits;
}

const dirFiles = (d: string): string[] => walk(join(root, d));
const appFiles = dirFiles("app");
const componentFiles = dirFiles("components");
const clientFiles = dirFiles("client");
const viewModelFiles = dirFiles("view-model");
const appTsx = appFiles.filter((f) => f.endsWith(".tsx"));
const uiFiles = [...appFiles, ...componentFiles, ...clientFiles, ...viewModelFiles];

describe("source rules", () => {
  it("scans at least one real file in every directory", () => {
    expect(appFiles.length).toBeGreaterThan(0);
    expect(appTsx.length).toBeGreaterThan(0);
    expect(componentFiles.length).toBeGreaterThan(0);
    expect(clientFiles.length).toBeGreaterThan(0);
    expect(viewModelFiles.length).toBeGreaterThan(0);
  });

  it("uses no raw HTML injection APIs", () => {
    const pattern = /dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document\s*\.\s*write\b/;
    expect(scan(uiFiles, pattern)).toEqual([]);
  });

  it("has no colour literals in components/** and app/**/*.tsx", () => {
    // Colour-like hex: 3, 4, 6 or 8 digits, not preceded by a word char, '&' (HTML entity),
    // '/' or '&#', and not directly after href=" / href={" (fragment links like "#abc").
    const hex = /(?<![\w&/])(?<!href=["'{]+)#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/;
    const fn = /\b(?:rgba?|hsla?)\(/;
    const files = [...componentFiles, ...appTsx];
    expect(scan(files, hex)).toEqual([]);
    expect(scan(files, fn)).toEqual([]);
  });

  it("imports nothing from tests/ or fixtures paths", () => {
    const pattern = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'][^"']*(?:fixtures|(?:^|[./"'])tests\/)[^"']*["']/;
    const looseTests = /(?:from|import|require)\b[^\n]*["'](?:\.{1,2}\/)*(?:@\/)?tests\//;
    expect(scan(uiFiles, pattern)).toEqual([]);
    expect(scan(uiFiles, looseTests)).toEqual([]);
  });

  it("keeps view-model free of Date.now, Math.random and fetch", () => {
    const pattern = /Date\s*\.\s*now\b|Math\s*\.\s*random\b|(?<![\w$-])fetch(?![\w$-])/; // identifier `fetch`, not 'manifest-fetch-failed'
    expect(scan(viewModelFiles, pattern)).toEqual([]);
  });
});
