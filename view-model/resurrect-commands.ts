import type { Ecosystem, ManifestFormat, Scope } from '../core';
import { isCommandSafe } from './resurrect-names';
import type { ManifestOrigin, ResurrectBlock, ResurrectSegment } from './types';
// resurrect Requirements 10.2 to 10.7, 10.9, 10.10: the Command_Builder.
// This module is the only place that holds Fixed_Words. A command line is built only from
// the templates below and from names that passed isCommandSafe; no other string enters a line.
export interface CommandInput {
  /** Every manifest that declares the package. */
  readonly origins: readonly ManifestOrigin[];
  /** The scopes of the package row. An empty list is treated as `runtime`. */
  readonly scopes: readonly Scope[];
  /** The name of the package to move away from. */
  readonly from: string;
  /** The name of the Alternative. */
  readonly to: string;
}
const NPM_FLAGS: Readonly<Partial<Record<Scope, string>>> = {
  dev: '--save-dev',
  optional: '--save-optional',
  peer: '--save-peer',
};
const CARGO_FLAGS: Readonly<Partial<Record<Scope, string>>> = {
  dev: '--dev',
  build: '--build',
  optional: '--optional',
};
const POETRY_HEADING = 'If this project uses Poetry';
const PEP621_HEADING = 'If this project uses another tool (PEP 621)';
const POETRY_NOTE =
  'Add --group <group> to the poetry add line if the old package was in a dependency group.';
type Variant = 'npm' | 'pip' | 'poetry' | 'pep621' | 'cargo';
interface Draft {
  readonly variant: Variant;
  readonly toolHeading: string | null;
  readonly path: string;
  readonly scope: Scope;
}
function ecosystemOf(format: ManifestFormat): Ecosystem {
  if (format === 'package.json') return 'npm';
  if (format === 'Cargo.toml') return 'cargo';
  return 'pypi';
}
function variantsOf(origin: ManifestOrigin): Array<{ variant: Variant; toolHeading: string | null }> {
  switch (origin.format) {
    case 'package.json':
      return [{ variant: 'npm', toolHeading: null }];
    case 'requirements.txt':
      return [{ variant: 'pip', toolHeading: null }];
    case 'Cargo.toml':
      return [{ variant: 'cargo', toolHeading: null }];
    case 'pyproject.toml':
      if (origin.pyprojectTool === 'poetry') return [{ variant: 'poetry', toolHeading: null }];
      if (origin.pyprojectTool === 'pep621') return [{ variant: 'pep621', toolHeading: null }];
      return [
        { variant: 'poetry', toolHeading: POETRY_HEADING },
        { variant: 'pep621', toolHeading: PEP621_HEADING },
      ];
    default:
      return [];
  }
}
function replaceLead(
  what: 'line' | 'entry',
  from: string,
  path: string,
  to: string,
): readonly ResurrectSegment[] {
  const first = what === 'line' ? 'Replace the line for ' : 'Replace the entry for ';
  const middle = what === 'line' ? ' in ' : ' in the dependencies of ';
  return [
    { kind: 'text', text: first },
    { kind: 'code', text: from },
    { kind: 'text', text: middle },
    { kind: 'code', text: path },
    { kind: 'text', text: ' with ' },
    { kind: 'code', text: to },
    { kind: 'text', text: ', then run:' },
  ];
}
function withFlag(base: string, flag: string | undefined, to: string): string {
  return flag === undefined ? `${base} ${to}` : `${base} ${flag} ${to}`;
}
interface Body {
  readonly lead: readonly ResurrectSegment[] | null;
  readonly lines: readonly string[];
  readonly note: string | null;
}
function bodyOf(draft: Draft, from: string, to: string): Body {
  switch (draft.variant) {
    case 'npm':
      return {
        lead: null,
        lines: [`npm uninstall ${from}`, withFlag('npm install', NPM_FLAGS[draft.scope], to)],
        note: null,
      };
    case 'pip':
      return { lead: replaceLead('line', from, draft.path, to), lines: [`pip install ${to}`], note: null };
    case 'poetry':
      return {
        lead: null,
        lines: [`poetry remove ${from}`, `poetry add ${to}`],
        note: POETRY_NOTE,
      };
    case 'pep621':
      return { lead: replaceLead('entry', from, draft.path, to), lines: [`pip install ${to}`], note: null };
    case 'cargo':
      return {
        lead: null,
        lines: [`cargo remove ${from}`, withFlag('cargo add', CARGO_FLAGS[draft.scope], to)],
        note: null,
      };
  }
}
function leadKey(lead: readonly ResurrectSegment[] | null): string {
  return lead === null ? '' : lead.map((s) => `${s.kind}:${s.text}`).join('\u0000');
}
/** Builds the command blocks for one Alternative. Returns [] when a name is not command-safe. */
export function buildCommandBlocks(input: CommandInput): readonly ResurrectBlock[] {
  const { origins, from, to } = input;
  const scopes: readonly Scope[] = input.scopes.length === 0 ? ['runtime'] : input.scopes;
  const drafts: Draft[] = [];
  for (const origin of origins) {
    const eco = ecosystemOf(origin.format);
    if (!isCommandSafe(eco, from) || !isCommandSafe(eco, to)) continue;
    for (const { variant, toolHeading } of variantsOf(origin)) {
      for (const scope of scopes) drafts.push({ variant, toolHeading, path: origin.path, scope });
    }
  }
  // Distinct blocks: the same heading, lead, lines and note are shown once.
  const distinctOrigins = new Set(origins.map((o) => o.path)).size;
  const seen = new Set<string>();
  const unique: Array<{ draft: Draft; body: Body }> = [];
  for (const draft of drafts) {
    const body = bodyOf(draft, from, to);
    const key = [draft.toolHeading ?? '', draft.path, leadKey(body.lead), body.lines.join('\n')].join(
      '\u0001',
    );
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ draft, body });
  }
  const many = unique.length > 1;
  return unique.map(({ draft, body }): ResurrectBlock => {
    let heading: string | null = null;
    if (draft.toolHeading !== null) {
      heading = distinctOrigins > 1 ? `${draft.path}: ${draft.toolHeading}` : draft.toolHeading;
    } else if (many) {
      heading = draft.path;
    }
    return {
      heading,
      lead: body.lead,
      lines: body.lines,
      note: body.note,
      copyLabel: `Copy commands for ${to}`,
      copyText: body.lines.join('\n'),
    };
  });
}
