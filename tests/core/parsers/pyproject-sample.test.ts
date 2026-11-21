import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseManifest } from '../../../core';

// Requirements 12.3, 12.5, 12.6, 12.8
// Parses the recorded psf/requests pyproject.toml and a hand-written Poetry manifest.

const FIXTURES = join(__dirname, '..', '..', 'fixtures');

function parseSample(file: string) {
  return parseManifest(readFileSync(join(FIXTURES, file), 'utf8'), 'pyproject.toml');
}

/** `name|scope|versionSpec|sourceKind`, in the order the parser returned them. */
function rows(r: ReturnType<typeof parseSample>): string[] {
  return r.dependencies.map((d) => `${d.name}|${d.scope}|${d.versionSpec}|${d.sourceKind}`);
}

describe('pyproject.toml samples', () => {
  it('sample-pyproject.toml (psf/requests): exact dependencies and warnings', () => {
    const r = parseSample('sample-pyproject.toml');
    expect(rows(r)).toEqual([
      'certifi|runtime|>=2023.5.7|registry',
      'chardet|dev|*|registry',
      'chardet|optional|>=3.0.2,<8|registry',
      'charset-normalizer|runtime|>=2,<4|registry',
      'cryptography|dev|*|registry',
      'httpbin|dev|~=0.10.0|registry',
      'idna|runtime|>=2.5,<4|registry',
      'pyopenssl|dev|*|registry',
      'pyright|dev|*|registry',
      'pysocks|optional|>=1.5.6, !=1.5.7|registry',
      'pytest|dev|>=3|registry',
      'pytest-cov|dev|*|registry',
      'pytest-httpbin|dev|==2.1.0|registry',
      'pytest-mock|dev|*|registry',
      'pytest-xdist|dev|*|registry',
      'trustme|dev|*|registry',
      'typing-extensions|dev|*|registry',
      'urllib3|runtime|>=1.26,<3|registry',
    ]);
    expect(r.warnings).toEqual([
      'pyproject.toml table [dependency-groups.test]: "requests" refers to this project itself and was skipped.',
    ]);
  });

  it('sample-poetry-pyproject.toml: caret, tilde, wildcard, group, optional and git entries', () => {
    const r = parseSample('sample-poetry-pyproject.toml');
    expect(rows(r)).toEqual([
      'black|dev|>=24.2,<24.3|registry',
      'fastapi|runtime|>=0.110.0,<0.111.0|registry',
      'httpx|runtime|>=0.27.0,<0.28.0|registry',
      'mylib|runtime|https://github.com/example/mylib.git|git',
      'pydantic|runtime|*|registry',
      'pytest|dev|>=8.0,<9.0|registry',
      'uvicorn|optional|>=0.29,<0.30|registry',
    ]);
    expect(r.warnings).toEqual([]);
  });
});
