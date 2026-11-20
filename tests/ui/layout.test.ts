import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const layoutPath = join(process.cwd(), "app", "layout.tsx");
const layoutText = readFileSync(layoutPath, "utf8");
const source = ts.createSourceFile(layoutPath, layoutText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

interface ImportInfo {
  readonly module: string;
  readonly names: readonly string[];
}

function collectImports(): ImportInfo[] {
  const found: ImportInfo[] = [];
  for (const stmt of source.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const names: string[] = [];
    const bindings = stmt.importClause?.namedBindings;
    if (bindings !== undefined && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) names.push((el.propertyName ?? el.name).text);
    }
    if (stmt.importClause?.name !== undefined) names.push("default");
    found.push({ module: stmt.moduleSpecifier.text, names });
  }
  return found;
}

function metadataTitle(): string | undefined {
  for (const stmt of source.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    if (!stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== "metadata") continue;
      if (decl.initializer === undefined || !ts.isObjectLiteralExpression(decl.initializer)) continue;
      for (const prop of decl.initializer.properties) {
        if (
          ts.isPropertyAssignment(prop) &&
          ts.isIdentifier(prop.name) &&
          prop.name.text === "title" &&
          ts.isStringLiteralLike(prop.initializer)
        ) {
          return prop.initializer.text;
        }
      }
    }
  }
  return undefined;
}

describe("app/layout.tsx", () => {
  const imports = collectImports();

  it("imports exactly IM_Fell_English_SC and Atkinson_Hyperlegible from next/font/google", () => {
    const fontImports = imports.filter((i) => i.module.startsWith("next/font"));
    expect(fontImports.map((i) => i.module)).toEqual(["next/font/google"]);
    expect([...fontImports[0].names].sort()).toEqual(["Atkinson_Hyperlegible", "IM_Fell_English_SC"]);
  });

  it("does not import Geist or Pirata_One from anywhere", () => {
    const all = imports.flatMap((i) => [i.module, ...i.names]);
    for (const name of all) {
      expect(name).not.toMatch(/geist/i);
      expect(name).not.toMatch(/pirata/i);
    }
  });

  it('declares lang="en" on the html element', () => {
    expect(layoutText).toContain('lang="en"');
  });

  it("exports metadata with a title that is not the starter text", () => {
    const title = metadataTitle();
    expect(title).toBeDefined();
    expect(title?.trim()).not.toBe("");
    expect(title).not.toBe("Create Next App");
  });
});

describe("docs/font-licences.md", () => {
  const doc = readFileSync(join(process.cwd(), "docs", "font-licences.md"), "utf8");

  it("names both fonts", () => {
    expect(doc).toContain("IM Fell English SC");
    expect(doc).toContain("Atkinson Hyperlegible");
  });

  it("names the SIL Open Font License", () => {
    expect(doc).toContain("SIL Open Font License");
  });
});
