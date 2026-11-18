import ts from 'typescript';

/** Name that selects zero-argument `Date()` and `new Date()` calls. */
export const ZERO_ARGUMENT_DATE = 'Date()';

// Requirements 22.6, 22.12, 13.2
export interface ForbiddenApiUse {
  /** The entry of `names` that matched. */
  name: string;
  /** 1-based line. */
  line: number;
}

const GLOBAL_OBJECTS = new Set(['globalThis', 'window', 'self', 'global']);

function literalText(node: ts.Node | undefined): string | undefined {
  if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) {
    return node.text;
  }
  return undefined;
}

function isNamedIdentifier(node: ts.Node, name: string): boolean {
  return ts.isIdentifier(node) && node.text === name;
}

/** True when the identifier is a property name rather than a reference. */
function isPropertyNamePosition(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent)) return parent.name === node;
  if (ts.isQualifiedName(parent)) return parent.right === node;
  if (
    ts.isPropertyAssignment(parent) ||
    ts.isPropertySignature(parent) ||
    ts.isPropertyDeclaration(parent) ||
    ts.isMethodDeclaration(parent) ||
    ts.isMethodSignature(parent) ||
    ts.isGetAccessorDeclaration(parent) ||
    ts.isSetAccessorDeclaration(parent) ||
    ts.isEnumMember(parent)
  ) {
    return parent.name === node;
  }
  return false;
}

/**
 * Finds uses of forbidden APIs in a source text. Parses only, never executes code.
 *
 * Each entry of `names` is one of:
 * - a plain identifier such as `fetch` or `setTimeout`: matches identifier references
 *   (and `globalThis.fetch`, `window["fetch"]`), never property names;
 * - a dotted member such as `Date.now`, `Math.random`, `performance.now`, `process.env`:
 *   matches `Date.now` and `Date["now"]`;
 * - `Date()`: matches `Date()` and `new Date()` without arguments.
 */
export function findForbiddenApi(text: string, names: readonly string[]): ForbiddenApiUse[] {
  const sourceFile = ts.createSourceFile('input.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const plain = new Set<string>();
  const members = new Map<string, Set<string>>();
  let zeroArgumentDate = false;

  for (const name of names) {
    if (name === ZERO_ARGUMENT_DATE) {
      zeroArgumentDate = true;
      continue;
    }
    const dot = name.indexOf('.');
    if (dot > 0) {
      const object = name.slice(0, dot);
      const set = members.get(object) ?? new Set<string>();
      set.add(name.slice(dot + 1));
      members.set(object, set);
    } else {
      plain.add(name);
    }
  }

  const uses: ForbiddenApiUse[] = [];
  const report = (node: ts.Node, name: string): void => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    uses.push({ name, line: line + 1 });
  };

  const checkMember = (node: ts.Node, object: ts.Expression, key: string | undefined): void => {
    if (key === undefined) return;
    if (ts.isIdentifier(object)) {
      if (members.get(object.text)?.has(key)) report(node, `${object.text}.${key}`);
      else if (plain.has(key) && GLOBAL_OBJECTS.has(object.text)) report(node, key);
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node)) {
      checkMember(node, node.expression, node.name.text);
    } else if (ts.isElementAccessExpression(node)) {
      checkMember(node, node.expression, literalText(node.argumentExpression));
    } else if (zeroArgumentDate && ts.isCallExpression(node)) {
      if (isNamedIdentifier(node.expression, 'Date')) report(node, ZERO_ARGUMENT_DATE);
    } else if (zeroArgumentDate && ts.isNewExpression(node)) {
      if (isNamedIdentifier(node.expression, 'Date') && (node.arguments?.length ?? 0) === 0) {
        report(node, ZERO_ARGUMENT_DATE);
      }
    } else if (ts.isIdentifier(node) && plain.has(node.text) && !isPropertyNamePosition(node)) {
      report(node, node.text);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return uses;
}
