// Fire N concurrent uncached scans to force cold Lambda instances; record each timing + status.
const BASE = process.env.E2E_BASE_URL ?? "https://gravekeeper-chi.vercel.app";
const repo = process.argv[2];
const n = Number(process.argv[3] ?? "6");
if (!repo) {
  console.error("usage: repro-concurrent.mts <repoUrl> [n]");
  process.exit(1);
}

async function one(i: number): Promise<void> {
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
    let deadline = false;
    let grade = "";
    try {
      const b = JSON.parse(text) as { ok?: boolean; notes?: { code?: string }[]; summary?: { grade?: string }; error?: { code?: string } };
      if (b.ok) {
        deadline = (b.notes ?? []).some((nn) => nn.code === "scan-deadline-reached");
        grade = String(b.summary?.grade ?? "");
      } else {
        grade = `err:${b.error?.code}`;
      }
    } catch {
      grade = `nonjson:${text.slice(0, 60).replace(/\s+/g, " ")}`;
    }
    console.log(JSON.stringify({ i, ms, status: res.status, cache, deadline, grade }));
  } catch (err) {
    console.log(JSON.stringify({ i, ms: Date.now() - started, status: "FETCH_ERROR", note: err instanceof Error ? err.message : String(err) }));
  }
}

await Promise.all(Array.from({ length: n }, (_, i) => one(i)));
