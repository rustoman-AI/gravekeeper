// Requirement 19.27, 19.31
// Imports nothing (the 0 to 10 score range is the CVSS scale, not a Constants-table entry).
// Pure compact encoders of the three L2 entry kinds (design D12, "Compact entries").
// Each takes a body text and returns JSON text of the same shape that keeps
// every member a Mapper reads, so Mapper output on compact and full text is equal.
// Body text that is not valid JSON is returned unchanged: the caller's own parse
// then fails the same way for compact and full text.
const SCORE_MIN = 0;
const SCORE_MAX = 10;

type Parsed = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

function parse(bodyText: string): Parsed {
  try {
    return { ok: true, value: JSON.parse(bodyText) as unknown };
  } catch {
    return { ok: false };
  }
}

function own(value: unknown, key: string): unknown {
  try {
    if (value === null || typeof value !== "object") return undefined;
    if (!Object.hasOwn(value, key)) return undefined;
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** OSV advisory (EF-6): id, aliases, withdrawn, database_specific.severity, informational markers, CVSS_V3 entries. */
export function compactOsvAdvisory(bodyText: string): string {
  const parsed = parse(bodyText);
  if (!parsed.ok) return bodyText;
  const body = parsed.value;
  const id = own(body, "id");
  if (!isObject(body) || typeof id !== "string" || id.length === 0) return "{}";

  const out: Record<string, unknown> = { id };

  const rawAliases = own(body, "aliases");
  if (Array.isArray(rawAliases)) {
    const aliases: string[] = [];
    for (let i = 0; i < rawAliases.length; i += 1) {
      const alias: unknown = rawAliases[i];
      if (typeof alias === "string") aliases.push(alias);
    }
    out.aliases = aliases;
  }

  const withdrawn = own(body, "withdrawn");
  if (typeof withdrawn === "string" && withdrawn.length > 0) out.withdrawn = withdrawn;

  const label = own(own(body, "database_specific"), "severity");
  if (typeof label === "string") out.database_specific = { severity: label };

  const affected = own(body, "affected");
  if (Array.isArray(affected)) {
    const seen = new Set<string>();
    const kept: unknown[] = [];
    for (let i = 0; i < affected.length; i += 1) {
      const value = own(own(affected[i], "database_specific"), "informational");
      if (typeof value === "string" && !seen.has(value)) {
        seen.add(value);
        kept.push({ database_specific: { informational: value } });
      }
    }
    if (kept.length > 0) out.affected = kept;
  }

  const severity = own(body, "severity");
  if (Array.isArray(severity)) {
    const kept: unknown[] = [];
    for (let i = 0; i < severity.length; i += 1) {
      const entry: unknown = severity[i];
      const score = own(entry, "score");
      if (own(entry, "type") === "CVSS_V3" && typeof score === "string") {
        kept.push({ type: "CVSS_V3", score });
      }
    }
    if (kept.length > 0) out.severity = kept;
  }

  return JSON.stringify(out);
}

/** deps.dev advisory (EF-25): cvss3Score only, when a finite number in [0, 10]. */
export function compactDepsDevAdvisory(bodyText: string): string {
  const parsed = parse(bodyText);
  if (!parsed.ok) return bodyText;
  const score = own(parsed.value, "cvss3Score");
  if (typeof score !== "number" || !Number.isFinite(score) || score < SCORE_MIN || score > SCORE_MAX) {
    return "{}";
  }
  return JSON.stringify({ cvss3Score: score });
}

/** crates.io owners (EF-21): one user entry per distinct login, one team entry per team, `other` if none valid. */
export function compactCratesOwners(bodyText: string): string {
  const parsed = parse(bodyText);
  if (!parsed.ok) return bodyText;
  const list = own(parsed.value, "users");
  if (!Array.isArray(list)) return "{}";
  if (list.length === 0) return JSON.stringify({ users: [] });

  const logins = new Set<string>();
  const users: { login?: string; kind: string }[] = [];
  let teams = 0;
  for (let i = 0; i < list.length; i += 1) {
    const item: unknown = list[i];
    const kind = own(item, "kind");
    if (kind === "user") {
      const login = own(item, "login");
      if (typeof login === "string" && login.length > 0 && !logins.has(login)) {
        logins.add(login);
        users.push({ login, kind: "user" });
      }
    } else if (kind === "team") {
      teams += 1;
    }
  }
  for (let t = 0; t < teams; t += 1) users.push({ kind: "team" });
  if (users.length === 0) users.push({ kind: "other" });
  return JSON.stringify({ users });
}
