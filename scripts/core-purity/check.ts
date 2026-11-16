import * as path from 'node:path';
import ts from 'typescript';

/** The single module of /core allowed to import `smol-toml` (Requirement 13.11). */
export const TOML_WRAPPER_PATH = 'core/parsers/toml-tree.ts';

export type ViolationRule =
  | 'forbidden-layer-import'
  | 'import-not-allowed'
  | 'toml-import-outside-wrapper'
  | 'forbidden-global'
  | 'nondeterministic-call'
  | 'package-not-pinned';

export interface Violation {
  file: string;
  /** 1-based line. */
  line: number;
  /** 1-based column. */
  column: number;
  rule: ViolationRule;
  message: string;
}

export interface CheckSourceOptions {
  /**
   * Bare package names that /core may import. The CLI (scripts/check-core-purity.ts)
   * passes CORE_ALLOWED_PACKAGES from core/model/constants.ts.
   */
  allowedPackages?: readonly string[];
}

const FORBIDDEN_LAYERS = ['adapters', 'app', 'components'];
const FORBIDDEN_GLOBALS = new Set(['fetch', 'XMLHttpRequest']);
const GLOBAL_OBJECTS = new Set(['globalThis', 'window', 'self', 'global']);
const TOML_PACKAGE = 'smol-toml';

/**
 * Converts a file path to a project-root-relative POSIX path that starts at the
 * last `core` segment (so `C:\proj\core\a.ts` and `core/a.ts` both give `core/a.ts`).
 * Paths without a `core` segment are only normalized.
 */
function toRootRelative(filePath: string): string {
  const posix = path.posix.normalize(filePath.replace(/\\/g, '/'));
  const segments = posix.split('/');
  const index = segments.lastIndexOf('core');
  return index >= 0 ? segments.slice(index).join('/') : posix.replace(/^\.\//, '');
}

function isInside(resolved: string, dir: string): boolean {
  return resolved === dir || resolved.startsWith(`${dir}/`);
}

function literalText(node: ts.Node | undefined): string | undefined {
  if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) {
    return node.text;
  }
  return undefined;
}

function isNamedIdentifier(node: ts.Node, name: string): boolean {
  return ts.isIdentifier(node) && node.text === name;
}

/** True when the identifier is a property name rather than a reference or binding. */
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

export function checkSource(
  filePath: string,
  sourceText: string,
  options: CheckSourceOptions = {},
): Violation[] {
  const allowedPackages = options.allowedPackages ?? [TOML_PACKAGE];
  const kind = /\.tsx$/i.test(filePath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  const selfPath = toRootRelative(filePath);
  const selfDir = path.posix.dirname(selfPath);
  const violations: Violation[] = [];

  const report = (node: ts.Node, rule: ViolationRule, message: string): void => {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );
    violations.push({ file: filePath, line: line + 1, column: character + 1, rule, message });
  };

  const checkSpecifier = (node: ts.Node, specifier: string): void => {
    let resolved: string | undefined;
    if (specifier.startsWith('./') || specifier.startsWith('../') || specifier === '.' || specifier === '..') {
      resolved = path.posix.normalize(path.posix.join(selfDir, specifier));
    } else if (specifier.startsWith('@/')) {
      resolved = path.posix.normalize(specifier.slice(2));
    }

    if (resolved !== undefined) {
      const layer = FORBIDDEN_LAYERS.find((dir) => isInside(resolved, dir));
      if (layer) {
        report(node, 'forbidden-layer-import', `Core must not import from /${layer}: "${specifier}"`);
      }
      if (specifier.startsWith('@/') || !isInside(resolved, 'core')) {
        report(
          node,
          'import-not-allowed',
          `Import "${specifier}" is not a relative path inside /core or an allowed package`,
        );
      }
      return;
    }

    if (!allowedPackages.includes(specifier)) {
      report(
        node,
        'import-not-allowed',
        `Import "${specifier}" is not a relative path inside /core or an allowed package`,
      );
      return;
    }
    if (specifier === TOML_PACKAGE && selfPath !== TOML_WRAPPER_PATH) {
      report(
        node,
        'toml-import-outside-wrapper',
        `"${TOML_PACKAGE}" may only be imported from ${TOML_WRAPPER_PATH}`,
      );
    }
  };

  const checkModuleReference = (node: ts.Node, arg: ts.Node | undefined): void => {
    const text = literalText(arg);
    if (text !== undefined) {
      checkSpecifier(arg ?? node, text);
    } else {
      report(node, 'import-not-allowed', 'Module specifier must be a string literal');
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) checkModuleReference(node, node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      checkModuleReference(node, node.moduleReference.expression);
    } else if (ts.isImportTypeNode(node)) {
      if (ts.isLiteralTypeNode(node.argument)) {
        checkModuleReference(node, node.argument.literal);
      } else {
        checkModuleReference(node, undefined);
      }
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword || isNamedIdentifier(callee, 'require')) {
        checkModuleReference(node, node.arguments[0]);
      } else if (isNamedIdentifier(callee, 'Date')) {
        report(node, 'nondeterministic-call', 'Date() reads the system clock');
      }
    } else if (ts.isNewExpression(node)) {
      if (isNamedIdentifier(node.expression, 'Date') && (node.arguments?.length ?? 0) === 0) {
        report(node, 'nondeterministic-call', 'new Date() without arguments reads the system clock');
      }
    } else if (ts.isPropertyAccessExpression(node)) {
      if (isNamedIdentifier(node.expression, 'Date') && node.name.text === 'now') {
        report(node, 'nondeterministic-call', 'Date.now reads the system clock');
      } else if (isNamedIdentifier(node.expression, 'Math') && node.name.text === 'random') {
        report(node, 'nondeterministic-call', 'Math.random is non-deterministic');
      } else if (
        FORBIDDEN_GLOBALS.has(node.name.text) &&
        ts.isIdentifier(node.expression) &&
        GLOBAL_OBJECTS.has(node.expression.text)
      ) {
        report(node, 'forbidden-global', `Core must not reference ${node.name.text}`);
      }
    } else if (ts.isElementAccessExpression(node)) {
      const key = literalText(node.argumentExpression);
      if (isNamedIdentifier(node.expression, 'Date') && key === 'now') {
        report(node, 'nondeterministic-call', 'Date["now"] reads the system clock');
      } else if (isNamedIdentifier(node.expression, 'Math') && key === 'random') {
        report(node, 'nondeterministic-call', 'Math["random"] is non-deterministic');
      } else if (
        key !== undefined &&
        FORBIDDEN_GLOBALS.has(key) &&
        ts.isIdentifier(node.expression) &&
        GLOBAL_OBJECTS.has(node.expression.text)
      ) {
        report(node, 'forbidden-global', `Core must not reference ${key}`);
      }
    } else if (
      ts.isIdentifier(node) &&
      FORBIDDEN_GLOBALS.has(node.text) &&
      !isPropertyNamePosition(node)
    ) {
      report(node, 'forbidden-global', `Core must not reference ${node.text}`);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

export interface CheckPackageJsonOptions {
  /** Packages that must be pinned in `dependencies`. The CLI passes CORE_ALLOWED_PACKAGES. */
  allowedPackages?: readonly string[];
  /** File name used in reported violations. */
  filePath?: string;
}

const EXACT_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function propertyName(prop: ts.PropertyAssignment): string | undefined {
  const name = prop.name;
  return ts.isStringLiteral(name) || ts.isIdentifier(name) ? name.text : undefined;
}

/** Requires each allowed package to have an exact-version entry in `dependencies` (Requirement 13.10). */
export function checkPackageJson(
  text: string,
  options: CheckPackageJsonOptions = {},
): Violation[] {
  const allowedPackages = options.allowedPackages ?? [TOML_PACKAGE];
  const file = options.filePath ?? 'package.json';
  const sourceFile = ts.parseJsonText(file, text);
  const violations: Violation[] = [];

  const at = (node: ts.Node | undefined): { line: number; column: number } => {
    if (!node) return { line: 1, column: 1 };
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    return { line: line + 1, column: character + 1 };
  };

  const root = sourceFile.statements[0]?.expression;
  const rootProps =
    root && ts.isObjectLiteralExpression(root)
      ? root.properties.filter(ts.isPropertyAssignment)
      : [];
  const depsProp = rootProps.find((p) => propertyName(p) === 'dependencies');
  const deps =
    depsProp && ts.isObjectLiteralExpression(depsProp.initializer)
      ? depsProp.initializer
      : undefined;
  const entries = deps ? deps.properties.filter(ts.isPropertyAssignment) : [];

  for (const pkg of allowedPackages) {
    const entry = entries.find((p) => propertyName(p) === pkg);
    if (!entry) {
      violations.push({
        file,
        ...at(depsProp),
        rule: 'package-not-pinned',
        message: `"${pkg}" must be listed in dependencies with an exact version`,
      });
      continue;
    }
    const version = ts.isStringLiteral(entry.initializer) ? entry.initializer.text : undefined;
    if (version === undefined || !EXACT_VERSION.test(version)) {
      violations.push({
        file,
        ...at(entry),
        rule: 'package-not-pinned',
        message: `"${pkg}" must be pinned to an exact version (found ${
          version === undefined ? 'a non-string value' : `"${version}"`
        })`,
      });
    }
  }
  return violations;
}
