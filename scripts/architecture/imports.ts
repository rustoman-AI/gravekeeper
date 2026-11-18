import ts from 'typescript';

// Requirement 22.13
export type ImportKind =
  | 'import'
  | 'import-type'
  | 'export-from'
  | 'import-equals-require'
  | 'import-type-expression'
  | 'dynamic-import'
  | 'require-call';

// Requirement 22.14
export interface ImportRef {
  /** The module specifier, or `null` when the argument is not a string literal. */
  specifier: string | null;
  /** 1-based line. */
  line: number;
  kind: ImportKind;
}

function literalText(node: ts.Node | undefined): string | null {
  if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) {
    return node.text;
  }
  return null;
}

/**
 * Lists every module reference of a source text. Parses only, never executes code.
 * Syntax errors do not throw: the TypeScript parser always returns a tree.
 */
export function extractImports(filePath: string, text: string): ImportRef[] {
  const scriptKind = /\.tsx$/i.test(filePath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, scriptKind);
  const refs: ImportRef[] = [];

  const add = (node: ts.Node, kind: ImportKind, specifier: string | null): void => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    refs.push({ specifier, line: line + 1, kind });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const typeOnly = node.importClause?.isTypeOnly === true;
      add(node, typeOnly ? 'import-type' : 'import', literalText(node.moduleSpecifier));
    } else if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) add(node, 'export-from', literalText(node.moduleSpecifier));
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      add(node, 'import-equals-require', literalText(node.moduleReference.expression));
    } else if (ts.isImportTypeNode(node)) {
      const arg = node.argument;
      add(
        node,
        'import-type-expression',
        ts.isLiteralTypeNode(arg) ? literalText(arg.literal) : null,
      );
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword) {
        add(node, 'dynamic-import', literalText(node.arguments[0]));
      } else if (ts.isIdentifier(callee) && callee.text === 'require') {
        add(node, 'require-call', literalText(node.arguments[0]));
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return refs;
}
