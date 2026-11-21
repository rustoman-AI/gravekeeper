import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseManifest } from '../../../core';
import { directReferenceKind } from '../../../core/formats/requirements-lexical';
import {
  arbNameToken,
  arbNoiseLine,
  arbOrderingName,
  arbPypiNameToken,
  arbRequirementLine,
  arbSpecLine,
} from '../../support/arbitraries/requirements';
import { cfg } from '../../support/fc-config';

// Feature: pyproject, Property PY-P8: PEP 508 entries agree with the requirements.txt grammar
// Validates: Requirements 3.4, 3.5, 3.9

/** TOML basic string with every character that needs it escaped. */
function tomlString(s: string): string {
  let out = '"';
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (c < 0x20 || c === 0x7f) out += `\\u${c.toString(16).padStart(4, '0')}`;
    else out += ch;
  }
  return `${out}"`;
}

const pyprojectOf = (line: string): string => `[project]\nname = "host"\ndependencies = [${tomlString(line)}]\n`;

/** Lines both grammars can see: single line, no backslash, no whitespace before `#`, no leading `-`. */
const isComparable = (line: string): boolean =>
  // A blank line or a line starting with `#` is not an entry in requirements.txt (silently ignored), so it is outside the agreement.
  !/[\x00-\x1f\x7f\u0085\u2028\u2029\\]/.test(line) &&
  !/\s#/.test(line) &&
  line.trim() !== '' &&
  !line.trim().startsWith('#') &&
  !line.trim().startsWith('-');

/**
 * A bare direct reference (`git+...#egg=name`, `./p#egg=name`) has no `name @`. The design (D11, criterion 3.8)
 * makes it unreadable for the PEP 508 reader, so those lines are outside the agreement.
 */
const isNotBareReference = (line: string): boolean => directReferenceKind(line.trim()) === null;

const arbLine: fc.Arbitrary<string> = fc
  .oneof(
    { weight: 4, arbitrary: arbPypiNameToken.chain((n) => arbSpecLine(n)).map((s) => s.line) },
    { weight: 2, arbitrary: arbOrderingName.chain((n) => arbRequirementLine(n)).map((l) => l.line) },
    { weight: 3, arbitrary: arbNoiseLine },
    { weight: 1, arbitrary: arbNameToken.chain((n) => fc.constantFrom(`${n}[a,b]>=1`, `${n} [x] @ ./p`, `${n}>=1 ; python_version<"3"`, `${n} @ ./p ; os_name=="nt"`, `${n};marker`)) },
  )
  .filter((l) => isComparable(l) && isNotBareReference(l));

describe('PEP 508 and requirements.txt agreement', () => {
  it('PY-P8: a PEP 621 entry and a requirements.txt line give the same name, rawName, versionSpec and sourceKind, or both are skipped', () => {
    fc.assert(
      fc.property(arbLine, (line) => {
        const py = parseManifest(pyprojectOf(line), 'pyproject.toml');
        const rq = parseManifest(line, 'requirements.txt');

        expect(py.dependencies.length).toBe(rq.dependencies.length);
        // A skipped entry gives a warning on each side; warning text differs by design (location label), so only presence is compared.
        expect(py.warnings.length > 0).toBe(rq.warnings.length > 0);

        const a = py.dependencies[0];
        const b = rq.dependencies[0];
        if (a === undefined || b === undefined) return;
        expect(a.name).toBe(b.name);
        expect(a.rawName).toBe(b.rawName);
        expect(a.versionSpec).toBe(b.versionSpec);
        expect(a.sourceKind).toBe(b.sourceKind);
        expect(a.scope).toBe('runtime');
        expect(b.scope).toBe('runtime');
        expect(a.ecosystem).toBe('pypi');
      }),
      cfg(),
    );
  });

  it('PY-P8: generated valid lines are read, not vacuously skipped by both', () => {
    fc.assert(
      fc.property(
        arbPypiNameToken.chain((n) => arbSpecLine(n)).filter((s) => isComparable(s.line) && isNotBareReference(s.line)),
        (s) => {
          const py = parseManifest(pyprojectOf(s.line), 'pyproject.toml');
          expect(py.warnings).toEqual([]);
          expect(py.dependencies).toHaveLength(1);
          expect(py.dependencies[0]?.versionSpec).toBe(s.versionSpec);
          expect(py.dependencies[0]?.sourceKind).toBe(s.sourceKind);
        },
      ),
      cfg(),
    );
  });
});
