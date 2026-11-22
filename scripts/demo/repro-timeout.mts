// Session 21 reproduction: scan uncached repos against production and record timing + status.
// Usage: npx tsx scripts/demo/repro-timeout.mts repo1 repo2 ...
const BASE = process.env.E2E_BASE_URL ?? "https://gravekeeper-chi.vercel.app";

const repos = process.argv.slice(2);
if (repos.length === 0) {
  console.error("give at least one https://github.com/owner/repo");
  process.exit(1);
}

interface Row {
  repo: string;
  ms: number;
  status: number | string;
  cache: string | null;
  grade?: string;
  counts?: string;
  deadlineNote?: boolean;
  slowSources?: string[];
  note?: string;
}

async function scan(repo: string): Promise<Row> {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}/api/scan`, {
      method: "POST",
      headers: { "content-type": "application/json", "cache-control": "no-cache" },
      body: JSON.stringify({ repoUrl: repo }),
    });
    const ms = Date.now() - started;
    const cache = res.headers.get("x-gravekeeper-cache");
    const text = await res.text();
    let body: Record<string, unknown> | null = null;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = null;
    }
    const row: Row = { repo, ms, status: res.status, cache };
    if (body && body.ok === true) {
      const notes = (body.notes as { code?: string }[] | undefined) ?? [];
      const sources = (body.sources as Record<string, string> | undefined) ?? {};
      const summary = (body.summary as { grade?: string; counts?: Record<string, number>; unassessed?: number } | undefined) ?? {};
      row.grade = String(summary.grade ?? "");
      row.deadlineNote = notes.some((n) => n.code === "scan-deadline-reached");
      row.slowSources = Object.entries(sources).filter(([, s]) => s !== "ok").map(([k, s]) => `${k}:${s}`);
      const c = summary.counts ?? {};
      row.counts = `A${c.ALIVE ?? "?"}/H${c.HAUNTED ?? "?"}/D${c.DEAD ?? "?"}/U${summary.unassessed ?? "?"}`;
    } else if (body && body.ok === false) {
      row.note = `error ${(body.error as { code?: string } | undefined)?.code ?? "?"}`;
    } else {
      row.note = text.slice(0, 120).replace(/\s+/g, " ");
    }
    return row;
  } catch (err) {
    return { repo, ms: Date.now() - started, status: "FETCH_ERROR", cache: null, note: err instanceof Error ? err.message : String(err) };
  }
}

for (const repo of repos) {
  const row = await scan(repo);
  console.log(JSON.stringify(row));
}
