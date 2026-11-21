// Poetry constraint to PEP 440 translation (pyproject spec, Requirement 6).
// Linear scans only. No regex with nested quantifiers (ReDoS). Total: never throws.

export type PoetryTranslation =
  | { readonly kind: 'ok'; readonly spec: string }
  | { readonly kind: 'alternatives' }
  | { readonly kind: 'unsupported' };

const UNSUPPORTED: PoetryTranslation = { kind: 'unsupported' };

/** Operator prefixes, longest first. */
const OPERATORS = ['~=', '>=', '<=', '==', '!=', '^', '~', '>', '<'] as const;

const MAX_PART_DIGITS = 9;

interface Version {
  readonly texts: readonly string[];
  readonly nums: readonly number[];
  readonly wildcard: boolean;
}

function isOperatorOnly(token: string): boolean {
  return (OPERATORS as readonly string[]).includes(token);
}

function isWhitespaceChar(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v';
}

// Requirement 6.8
/** Parses `part ('.' part)* ('.*')?` with parts of 1 to 9 ASCII digits, or null. */
function parseVersion(text: string): Version | null {
  let body = text;
  let wildcard = false;
  if (body.endsWith('.*')) {
    wildcard = true;
    body = body.slice(0, -2);
  }
  if (body.length === 0) return null;
  const texts = body.split('.');
  const nums: number[] = [];
  for (const part of texts) {
    if (part.length < 1 || part.length > MAX_PART_DIGITS) return null;
    for (let i = 0; i < part.length; i++) {
      const c = part.charCodeAt(i);
      if (c < 0x30 || c > 0x39) return null;
    }
    nums.push(Number(part));
  }
  return { texts, nums, wildcard };
}

/** Version with part `index` increased by one and every later part zero, same length as `nums`. */
function bump(nums: readonly number[], index: number): string {
  const out: number[] = [];
  for (let i = 0; i < nums.length; i++) {
    if (i < index) out.push(nums[i]);
    else if (i === index) out.push(nums[i] + 1);
    else out.push(0);
  }
  return out.join('.');
}

/** Translates one term. Returns the PEP 440 term, '' for a dropped term, or null when unsupported. */
function translateTerm(term: string): string | null {
  // Requirement 6.4
  if (term === '*') return '';

  let op = '';
  for (const candidate of OPERATORS) {
    if (term.startsWith(candidate)) {
      op = candidate;
      break;
    }
  }
  const v = parseVersion(term.slice(op.length));
  if (v === null) return null;
  const n = v.nums.length;
  const text = v.texts.join('.');

  if (op === '^') {
    // Requirement 6.2
    if (v.wildcard || n > 3) return null;
    let index = n - 1;
    for (let i = 0; i < n; i++) {
      if (v.nums[i] !== 0) {
        index = i;
        break;
      }
    }
    return `>=${text},<${bump(v.nums, index)}`;
  }
  if (op === '~') {
    // Requirement 6.3
    if (v.wildcard || n > 3) return null;
    return `>=${text},<${bump(v.nums, n >= 2 ? 1 : 0)}`;
  }
  if (op === '~=') {
    // Requirement 6.6
    if (v.wildcard || n < 2 || n > 4) return null;
    return `~=${text}`;
  }
  if (op === '') {
    if (v.wildcard) {
      // Requirement 6.4
      return n <= 3 ? `==${text}.*` : null;
    }
    // Requirement 6.5
    return n <= 4 ? `==${text}` : null;
  }
  // Requirement 6.6 (>=, >, <=, <, ==, !=)
  if (v.wildcard) {
    if ((op === '==' || op === '!=') && n <= 3) return `${op}${text}.*`;
    return null;
  }
  return n <= 4 ? `${op}${text}` : null;
}

// Requirement 6.1
/** Splits at commas and whitespace; an operator-only token joins the next token. Null when malformed. */
function tokenize(text: string): string[] | null {
  const terms: string[] = [];
  let current = '';
  let pendingOp = '';
  let termSinceComma = false;
  let lastWasComma = false;

  // Returns false when the token sequence is malformed.
  const flush = (atComma: boolean): boolean => {
    if (current.length === 0) return true;
    let token = current;
    current = '';
    if (pendingOp !== '') {
      if (isOperatorOnly(token)) return false;
      token = pendingOp + token;
      pendingOp = '';
    }
    if (isOperatorOnly(token)) {
      if (atComma) return false;
      pendingOp = token;
      return true;
    }
    terms.push(token);
    termSinceComma = true;
    lastWasComma = false;
    return true;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ',') {
      if (!flush(true)) return null;
      if (pendingOp !== '' || !termSinceComma) return null;
      termSinceComma = false;
      lastWasComma = true;
    } else if (isWhitespaceChar(ch)) {
      if (!flush(false)) return null;
    } else {
      current += ch;
    }
  }
  if (!flush(true)) return null;
  if (pendingOp !== '') return null;
  if (lastWasComma) return null;
  return terms;
}

/** Requirement 6. Total: never throws. */
export function poetryToPep440(constraint: string): PoetryTranslation {
  const text = constraint.trim();
  // Requirement 6.4, 6.9
  if (text === '' || text === '*') return { kind: 'ok', spec: '*' };
  // Requirement 6.7
  if (text.includes('|')) return { kind: 'alternatives' };

  const tokens = tokenize(text);
  if (tokens === null) return UNSUPPORTED;

  const out: string[] = [];
  for (const token of tokens) {
    const translated = translateTerm(token);
    // Requirement 6.8
    if (translated === null) return UNSUPPORTED;
    if (translated !== '') out.push(translated);
  }
  return { kind: 'ok', spec: out.length === 0 ? '*' : out.join(',') };
}
