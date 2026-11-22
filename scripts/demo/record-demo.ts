/**
 * Records the Gravekeeper demo video against production.
 *
 *   npx tsx scripts/demo/record-demo.ts
 *
 * Output goes to test-results/demo (git-ignored):
 *   raw/*.webm       Playwright recording (1920x1080, page content only)
 *   timeline.json    actual start and end of every shot, in seconds
 *   captions.srt     captions timed to the actual shots
 *   gravekeeper-demo.mp4   H.264 CRF 18, preset veryfast, silent, captions burned in
 *   frames/*.png     one frame per shot, taken from the final MP4
 *
 * The recording is Playwright recordVideo, not a desktop capture: it contains only the page,
 * so nothing else on the machine can appear in it. recordVideo does not draw the mouse, so an
 * overlay cursor is injected into every page and follows the real mouse events.
 */
import { chromium, type Browser, type Locator, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = "https://gravekeeper-chi.vercel.app";
const GH = "https://github.com/rustoman-AI/gravekeeper";
const REPOS = {
  request: "https://github.com/request/request",
  psf: "https://github.com/psf/requests",
  zoxide: "https://github.com/ajeetdsouza/zoxide",
};
const OUT = path.resolve("test-results", "demo");
const RAW = path.join(OUT, "raw");
const FRAMES = path.join(OUT, "frames");
const MP4 = path.join(OUT, "gravekeeper-demo.mp4");
const SIZE = { width: 1920, height: 1080 };

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const scanUrl = (repo: string): string => `${BASE}/?repo=${encodeURIComponent(repo)}`;

/* ---------- timeline ---------- */

let t0 = 0;
const now = (): number => (Date.now() - t0) / 1000;

async function holdUntil(sec: number): Promise<void> {
  const ms = (sec - now()) * 1000;
  if (ms > 0) await sleep(ms);
}

interface ShotLog {
  name: string;
  planned: [number, number];
  start: number;
  end: number;
}
const shots: ShotLog[] = [];

/** Seconds the schedule has slipped because an earlier shot needed longer than planned. */
let shift = 0;

/** Runs one shot. It never starts before `from` and never ends before `to` (both moved by the slip so
 *  far). If a page was slow the shot runs long, the holds inside `fn` shrink, and the overrun moves
 *  every later shot, so each hold on screen keeps its length. */
async function shot(name: string, from: number, to: number, fn: (from: number, to: number) => Promise<void>): Promise<void> {
  const f = from + shift;
  const planEnd = to + shift;
  await holdUntil(f);
  const start = now();
  await fn(start, planEnd);
  await holdUntil(planEnd);
  const end = now();
  if (end - planEnd > 0.05) shift += end - planEnd;
  shots.push({ name, planned: [from, to], start, end });
  console.log(`shot ${name}: planned ${from}-${to}s, actual ${start.toFixed(1)}-${end.toFixed(1)}s, slip ${shift.toFixed(1)}s`);
}
/* ---------- cursor and scrolling ---------- */

const CURSOR_SCRIPT = `
(() => {
  const NS = "http://www.w3.org/2000/svg";
  let el = null;
  let ring = null;
  const build = () => {
    el = document.createElementNS(NS, "svg");
    el.setAttribute("width", "30");
    el.setAttribute("height", "30");
    el.setAttribute("viewBox", "0 0 30 30");
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", "M2 2 L2 23 L7.5 18 L11 26 L14.8 24.4 L11.3 16.4 L18.6 16.4 Z");
    p.setAttribute("fill", "#ffffff");
    p.setAttribute("stroke", "#111111");
    p.setAttribute("stroke-width", "1.6");
    p.setAttribute("stroke-linejoin", "round");
    el.appendChild(p);
    const s = el.style;
    s.setProperty("position", "fixed");
    s.setProperty("left", "0");
    s.setProperty("top", "0");
    s.setProperty("z-index", "2147483647");
    s.setProperty("pointer-events", "none");
    s.setProperty("filter", "drop-shadow(0 1px 2px rgba(0,0,0,.6))");
    s.setProperty("display", "none");
    ring = document.createElement("div");
    const r = ring.style;
    r.setProperty("position", "fixed");
    r.setProperty("z-index", "2147483646");
    r.setProperty("pointer-events", "none");
    r.setProperty("width", "36px");
    r.setProperty("height", "36px");
    r.setProperty("margin", "-18px 0 0 -18px");
    r.setProperty("border-radius", "50%");
    r.setProperty("border", "3px solid rgba(255,255,255,.9)");
    r.setProperty("opacity", "0");
    r.setProperty("transition", "opacity .5s, transform .5s");
  };
  const attach = () => {
    if (!el) build();
    if (!el.isConnected) document.documentElement.appendChild(el);
    if (!ring.isConnected) document.documentElement.appendChild(ring);
  };
  let x = -100, y = -100;
  const place = () => {
    attach();
    el.style.setProperty("display", "block");
    el.style.setProperty("transform", "translate(" + (x - 2) + "px," + (y - 2) + "px)");
  };
  document.addEventListener("mousemove", (e) => { x = e.clientX; y = e.clientY; place(); }, true);
  document.addEventListener("mousedown", (e) => {
    x = e.clientX; y = e.clientY; place();
    ring.style.setProperty("left", x + "px");
    ring.style.setProperty("top", y + "px");
    ring.style.setProperty("transition", "none");
    ring.style.setProperty("transform", "scale(.4)");
    ring.style.setProperty("opacity", "1");
    void ring.offsetWidth;
    ring.style.setProperty("transition", "opacity .5s, transform .5s");
    ring.style.setProperty("transform", "scale(1.5)");
    ring.style.setProperty("opacity", "0");
  }, true);
  setInterval(() => { if (el && el.style.display === "block") attach(); }, 250);
})();
`;

const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

class Cursor {
  x = 200;
  y = 800;
  constructor(private readonly page: Page) {}

  /** Moves along an eased path for `ms` milliseconds of wall-clock time; the pointer is never teleported. */
  async move(x: number, y: number, ms = 1000): Promise<void> {
    const sx = this.x;
    const sy = this.y;
    const started = Date.now();
    for (;;) {
      const t = Math.min(1, (Date.now() - started) / ms);
      const e = ease(t);
      await this.page.mouse.move(sx + (x - sx) * e, sy + (y - sy) * e);
      if (t >= 1) break;
      await sleep(8);
    }
    this.x = x;
    this.y = y;
  }
  async to(loc: Locator, ms = 1000, dx = 0, dy = 0): Promise<void> {
    const box = await loc.boundingBox();
    if (!box) throw new Error("no bounding box for cursor target");
    await this.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, ms);
  }

  async click(): Promise<void> {
    await this.page.mouse.down();
    await sleep(90);
    await this.page.mouse.up();
  }

  /** Re-announces the pointer after a navigation so the overlay reappears where it was. */
  async refresh(): Promise<void> {
    await this.page.mouse.move(this.x, this.y);
  }
}

async function scrollBy(page: Page, total: number, ms: number): Promise<void> {
  const started = Date.now();
  let done = 0;
  for (;;) {
    const t = Math.min(1, (Date.now() - started) / ms);
    const target = Math.round(total * ease(t));
    if (target !== done) await page.mouse.wheel(0, target - done);
    done = target;
    if (t >= 1) break;
    await sleep(12);
  }
}
/** Scrolls so the top of `loc` ends up at viewport y = `topY`. */
async function scrollTo(page: Page, loc: Locator, topY: number, ms: number): Promise<void> {
  const box = await loc.boundingBox();
  if (!box) throw new Error("no bounding box to scroll to");
  await scrollBy(page, box.y - topY, ms);
}

/* ---------- pages ---------- */

async function waitResults(page: Page, repoName: string): Promise<void> {
  await page.getByRole("heading", { level: 1, name: repoName }).waitFor({ timeout: 90_000 });
  await page.evaluate("document.fonts.ready");
}

async function waitLanding(page: Page): Promise<void> {
  await page.getByRole("heading", { level: 1, name: "Gravekeeper" }).first().waitFor({ timeout: 30_000 });
  await page.evaluate("document.fonts.ready");
}

async function openGithub(page: Page, cursor: Cursor, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator("main, #repo-content-pjax-container").first().waitFor({ timeout: 30_000 });
  await sleep(700);
  const banner = page.getByRole("button", { name: /^(reject|decline|dismiss|not now)/i });
  if ((await banner.count()) > 0) await banner.first().click({ timeout: 1500 }).catch(() => undefined);
  await cursor.refresh();
}

/* ---------- shots ---------- */

async function shotLanding(page: Page, cursor: Cursor, from: number, to: number): Promise<void> {
  await cursor.move(420, 640, 1500);
  await cursor.move(960, 560, 3000);
  await cursor.move(1500, 620, 3000);
  await cursor.move(1000, 470, Math.max(1500, (to - now() - 0.2) * 1000));
  void from;
}

async function shotTypeAndScan(page: Page, cursor: Cursor, from: number, to: number): Promise<void> {
  // A cached scan returns in well under a second, which would skip the scanning screen. Hold the
  // request for 4.5 s, about the time of a cold scan, so the scanning screen is actually shown.
  let delayScan = true;
  await page.route("**/api/scan**", async (route) => {
    if (delayScan) await sleep(4500);
    await route.continue().catch(() => undefined);
  });
  const field = page.getByRole("textbox", { name: "GitHub repository URL" });
  await cursor.to(field, 1200, -120);
  await cursor.click();
  const text = REPOS.request;
  for (let i = 0; i < text.length; i++) {
    await page.keyboard.type(text[i]!);
    await sleep(70 + ((i * 37) % 60));
  }
  await sleep(500);
  await cursor.to(page.getByRole("button", { name: "Dig up" }), 900);
  await cursor.click();
  await waitResults(page, "request/request");
  delayScan = false;
  void from;
  void to;
}

async function shotResults(page: Page, cursor: Cursor, from: number, to: number): Promise<void> {
  await cursor.to(page.getByRole("heading", { level: 1, name: "request/request" }), 1500, -200);
  await holdUntil(from + 9);
  await cursor.to(page.getByRole("figure", { name: "worst single risk" }), 1400);
  void to;
}

async function shotScroll(page: Page, cursor: Cursor, from: number, to: number): Promise<void> {
  await cursor.move(1650, 620, 900);
  const group = page.getByRole("group", { name: "Dependency graveyard" });
  const box = await group.boundingBox();
  const down = Math.max(300, Math.round((box?.y ?? 0) + (box?.height ?? 900) - SIZE.height + 80));
  await scrollBy(page, down, 9500);
  await sleep(800);
  await scrollBy(page, -down, 8000);
  void from;
  void to;
}

async function shotUuid(page: Page, cursor: Cursor, from: number, to: number): Promise<void> {
  const uuid = page.getByRole("button", { name: /^uuid,/ });
  await cursor.to(uuid, 1300);
  await cursor.click();
  const dialog = page.getByRole("dialog", { name: "uuid" });
  await dialog.waitFor();
  await sleep(600);
  await cursor.to(dialog.getByRole("heading", { name: "Reasons" }), 1200, 120);
  await cursor.to(dialog.getByText("It has 1 open vulnerability, the worst of severity HIGH."), 1000, -40);
  await holdUntil(from + 7);
  await cursor.move(cursor.x, 700, 600);
  await scrollTo(page, dialog.getByRole("heading", { name: "Links" }), 380, 3200);
  await cursor.to(dialog.getByRole("link", { name: "registry page", exact: true }), 1000);
  await sleep(1200);
  await cursor.to(dialog.getByRole("link", { name: "source repository (unverified)", exact: true }), 900);
  await sleep(1200);
  await scrollTo(page, dialog.getByRole("heading", { name: "Advisories" }), 380, 2200);
  await cursor.to(dialog.getByRole("link", { name: /^GHSA-/ }), 1000);
  void to;
}

async function shotUpgrade(page: Page, cursor: Cursor, from: number, to: number): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "uuid" });
  await cursor.move(cursor.x, 760, 600);
  await scrollTo(page, dialog.getByText("Upgrade to 14.0.3"), 330, 3500);
  await cursor.to(dialog.getByText("Upgrade to 14.0.3"), 900, 160);
  await sleep(1200);
  await cursor.to(dialog.locator("code", { hasText: "npm install uuid@14.0.3" }), 1000);
  await sleep(1000);
  await cursor.to(dialog.getByRole("button", { name: /^Copy commands/ }), 900);
  await cursor.click();
  await sleep(1500);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  void from;
  void to;
}

async function shotList(page: Page, cursor: Cursor): Promise<void> {
  // The page behind the closed dialog is scrolled; bring the header back before reaching for the button.
  const y = Number(await page.evaluate("window.scrollY"));
  if (y > 0) await scrollBy(page, -y, 1200);
  const list = page.getByRole("button", { name: "List" });
  await cursor.to(list, 1000);
  await cursor.click();
  await page.getByRole("button", { name: "List", pressed: true }).waitFor();
  await sleep(4000);
}

async function shotOtherScan(page: Page, cursor: Cursor, repo: string, name: string): Promise<void> {
  await page.goto(scanUrl(repo), { waitUntil: "domcontentloaded" });
  await waitResults(page, name);
  await cursor.refresh();
  await sleep(3000);
}
async function shotGithubTree(page: Page, cursor: Cursor, url: string, to: number): Promise<void> {
  await openGithub(page, cursor, url);
  await cursor.move(900, 560, Math.max(800, (to - now() - 0.3) * 1000));
}

async function shotDesign(page: Page, cursor: Cursor, to: number): Promise<void> {
  await openGithub(page, cursor, `${GH}/blob/main/.kiro/specs/graveyard-art/design.md`);
  const heading = page.getByRole("heading", { name: /Property 1: Variant choice/ }).first();
  await heading.waitFor({ timeout: 20_000 });
  await cursor.move(1500, 600, 700);
  await scrollTo(page, heading, 330, 2600);
  await cursor.to(heading, 1200, 200);
  void to;
}

async function shotUsage(page: Page, cursor: Cursor, to: number): Promise<void> {
  await openGithub(page, cursor, `${GH}/blob/main/docs/KIRO_USAGE.md`);
  const anchor = page.getByText("Defects in product code found by property tests").first();
  await anchor.waitFor({ timeout: 20_000 });
  await cursor.move(1500, 620, 700);
  await scrollTo(page, anchor, 250, 2600);
  await cursor.to(anchor, 1000, 260);
  await sleep(1500);
  await scrollBy(page, 220, Math.max(1500, (to - now() - 1.5) * 1000));
}

async function shotTech(page: Page, cursor: Cursor, to: number): Promise<void> {
  await openGithub(page, cursor, `${GH}/blob/main/.kiro/steering/tech.md`);
  const rule = page.getByText("Agents must never set").first();
  await rule.waitFor({ timeout: 20_000 });
  await cursor.move(1500, 620, 700);
  await scrollTo(page, rule, 380, 1800);
  await cursor.to(rule, 1000, 300);
  void to;
}

async function shotMcp(page: Page, cursor: Cursor, to: number): Promise<void> {
  await openGithub(page, cursor, `${GH}/blob/main/.kiro/settings/mcp.json`);
  await cursor.move(1200, 520, Math.max(800, (to - now() - 0.3) * 1000));
}

async function shotClosing(page: Page, cursor: Cursor, to: number): Promise<void> {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await waitLanding(page);
  await cursor.refresh();
  await cursor.move(1300, 620, Math.max(1000, (to - now() - 0.3) * 1000));
}

/* ---------- captions ---------- */

interface Cue {
  shot: string;
  at: number;
  dur: number;
  text: string;
}

const CUES: Cue[] = [
  { shot: "landing", at: 0.6, dur: 5, text: "Every project depends on packages someone stopped looking after." },
  { shot: "landing", at: 6.2, dur: 5, text: "Gravekeeper shows you which ones, as a graveyard." },
  { shot: "type", at: 0.5, dur: 3.8, text: "Paste any public GitHub repository." },
  // The sixth-source sentence is 82 characters and has no break that fits 42 columns twice,
  // so it is shown as two consecutive captions with the words unchanged.
  { shot: "type", at: 5.5, dur: 3.5, text: "It checks every dependency against deps.dev, OSV, GitHub," },
  { shot: "type", at: 9.1, dur: 3.4, text: "npm, PyPI and crates.io." },
  { shot: "results", at: 0.8, dur: 6, text: "request/request: 31 of 40 dependencies are in the graveyard." },
  { shot: "results", at: 9.4, dur: 7, text: "Grade D comes from the riskiest package, not an average." },
  { shot: "scroll", at: 1.0, dur: 4.5, text: "Tombstones: archived or deprecated." },
  { shot: "scroll", at: 5.8, dur: 4.5, text: "Overgrown graves: no release and no commit in two years." },
  { shot: "scroll", at: 11.5, dur: 6, text: "Ghosts: open security advisories. Lanterns: alive." },
  { shot: "uuid", at: 1.5, dur: 6, text: "uuid is restless: deprecated, with a high-severity advisory." },
  { shot: "uuid", at: 8, dur: 8, text: "Every grave opens to the reasons and the evidence." },
  { shot: "upgrade", at: 0.8, dur: 6, text: "Where there is an honest way back, it shows it." },
  { shot: "list", at: 3.0, dur: 4.5, text: "The same results as an accessible table." },
  { shot: "psf", at: 0.4, dur: 6.5, text: "Python and Rust projects work too." },
  { shot: "kiro-specs", at: 0.3, dur: 2.8, text: "Built with Kiro, spec first." },
  { shot: "kiro-specs", at: 3.4, dur: 6, text: "12 specs, 151 requirements, 222 correctness properties." },
  { shot: "kiro-usage", at: 0.6, dur: 7, text: "Property-based tests found real bugs before users did." },
  { shot: "kiro-steering", at: 0.4, dur: 5.5, text: "Steering files hold the rules Kiro follows." },
  { shot: "kiro-hooks", at: 0.4, dur: 5, text: "Hooks run purity, architecture and related tests on every save." },
  { shot: "kiro-mcp", at: 0.4, dur: 5.2, text: "A Playwright MCP server runs the production smoke check." },
  { shot: "closing", at: 0.5, dur: 4.5, text: "Gravekeeper: gravekeeper-chi.vercel.app" },
  { shot: "closing", at: 5.3, dur: 4.4, text: "Open source, MIT: github.com/rustoman-AI/gravekeeper" },
];

function wrap(text: string, max = 42): string {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + 1 + word.length > max) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  lines.push(line);
  if (lines.length > 2 || lines.some((l) => l.length > max)) throw new Error(`caption does not fit 2x${max}: ${text}`);
  return lines.join("\n");
}

function srtTime(sec: number): string {
  const ms = Math.round(sec * 1000);
  const p = (n: number, w: number): string => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3_600_000), 2)}:${p(Math.floor(ms / 60_000) % 60, 2)}:${p(Math.floor(ms / 1000) % 60, 2)},${p(ms % 1000, 3)}`;
}

function writeSrt(): void {
  const startOf = (name: string): number => {
    const s = shots.find((x) => x.name === name);
    if (!s) throw new Error(`caption refers to unknown shot ${name}`);
    return s.start;
  };
  const total = shots[shots.length - 1]!.end;
  const cues = CUES.map((c) => ({ start: startOf(c.shot) + c.at, end: startOf(c.shot) + c.at + c.dur, text: wrap(c.text) }));
  for (let i = 0; i < cues.length; i++) {
    const next = cues[i + 1];
    if (next && cues[i]!.end > next.start - 0.05) cues[i]!.end = next.start - 0.05;
    cues[i]!.end = Math.min(cues[i]!.end, total - 0.1);
    if (cues[i]!.end - cues[i]!.start < 1.5) throw new Error(`caption shorter than 1.5 s: ${cues[i]!.text}`);
  }
  const body = cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join("\n");
  writeFileSync(path.join(OUT, "captions.srt"), body, "utf8");
}

/* ---------- ffmpeg ---------- */

function findFfmpeg(): string {
  if (spawnSync("ffmpeg", ["-version"]).status === 0) return "ffmpeg";
  const root = path.join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WinGet", "Packages");
  if (existsSync(root)) {
    for (const pkg of readdirSync(root).filter((d) => d.startsWith("Gyan.FFmpeg"))) {
      for (const build of readdirSync(path.join(root, pkg)).filter((d) => d.startsWith("ffmpeg-"))) {
        const exe = path.join(root, pkg, build, "bin", "ffmpeg.exe");
        if (existsSync(exe)) return exe;
      }
    }
  }
  throw new Error("ffmpeg not found on PATH or in the WinGet packages folder");
}

function ffmpeg(exe: string, args: string[]): void {
  const r = spawnSync(exe, ["-hide_banner", "-loglevel", "error", "-y", ...args], { cwd: OUT, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
}

function encode(exe: string, raw: string, offset: number, length: number): void {
  // libass sizes are in a 288-line script space; x3.75 gives 1080p pixels (11 is about 41 px).
  const style = [
    "FontName=Arial",
    "FontSize=11",
    "PrimaryColour=&H00FFFFFF",
    "OutlineColour=&H00202020",
    "BorderStyle=1",
    "Outline=0.6",
    "Shadow=0",
    "Alignment=2",
    "MarginV=14",
  ].join(",");
  ffmpeg(exe, [
    "-ss", offset.toFixed(3),
    "-i", raw,
    "-t", length.toFixed(3),
    "-vf", `fps=30,scale=1920:1080,subtitles=captions.srt:force_style='${style}'`,
    "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p",
    "-an", "-movflags", "+faststart",
    MP4,
  ]);
}

function extractFrames(exe: string): void {
  rmSync(FRAMES, { recursive: true, force: true });
  mkdirSync(FRAMES, { recursive: true });
  shots.forEach((s, i) => {
    const mid = (s.start + s.end) / 2;
    ffmpeg(exe, ["-ss", mid.toFixed(2), "-i", MP4, "-frames:v", "1", "-update", "1", path.join("frames", `${String(i + 1).padStart(2, "0")}-${s.name}.png`)]);
  });
}

/* ---------- main ---------- */

async function warm(browser: Browser): Promise<void> {
  const ctx = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const [repo, name] of [
    [REPOS.request, "request/request"],
    [REPOS.psf, "psf/requests"],
    [REPOS.zoxide, "ajeetdsouza/zoxide"],
  ] as const) {
    await page.goto(scanUrl(repo), { waitUntil: "domcontentloaded" });
    await waitResults(page, name);
    console.log(`warmed ${name}`);
  }
  await ctx.close();
}

async function main(): Promise<void> {
  const ffmpegExe = findFfmpeg();
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(RAW, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  await warm(browser);

  const ctx = await browser.newContext({
    viewport: SIZE,
    deviceScaleFactor: 1,
    recordVideo: { dir: RAW, size: SIZE },
    permissions: ["clipboard-read", "clipboard-write"],
    colorScheme: "dark",
  });
  await ctx.addInitScript(CURSOR_SCRIPT);
  const page = await ctx.newPage();
  const pageCreated = Date.now();
  const cursor = new Cursor(page);

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await waitLanding(page);
  t0 = Date.now();
  await cursor.refresh();

  await shot("landing", 0, 12, (from, to) => shotLanding(page, cursor, from, to));
  await shot("type", 12, 25, (from, to) => shotTypeAndScan(page, cursor, from, to));
  await shot("results", 25, 45, (from, to) => shotResults(page, cursor, from, to));
  await shot("scroll", 45, 65, (from, to) => shotScroll(page, cursor, from, to));
  await shot("uuid", 65, 85, (from, to) => shotUuid(page, cursor, from, to));
  await shot("upgrade", 85, 100, (from, to) => shotUpgrade(page, cursor, from, to));
  await shot("list", 100, 105, () => shotList(page, cursor));
  await shot("psf", 105, 109, () => shotOtherScan(page, cursor, REPOS.psf, "psf/requests"));
  await shot("zoxide", 109, 112, () => shotOtherScan(page, cursor, REPOS.zoxide, "ajeetdsouza/zoxide"));
  await shot("kiro-specs", 112, 118, (_f, to) => shotGithubTree(page, cursor, `${GH}/tree/main/.kiro/specs`, to));
  await shot("kiro-design", 118, 126, (_f, to) => shotDesign(page, cursor, to));
  await shot("kiro-usage", 126, 136, (_f, to) => shotUsage(page, cursor, to));
  await shot("kiro-steering", 136, 143, (_f, to) => shotTech(page, cursor, to));
  await shot("kiro-hooks", 143, 149, (_f, to) => shotGithubTree(page, cursor, `${GH}/tree/main/.kiro/hooks`, to));
  await shot("kiro-mcp", 149, 155, (_f, to) => shotMcp(page, cursor, to));
  await shot("closing", 155, 165, (_f, to) => shotClosing(page, cursor, to));

  const end = now();
  await ctx.close();
  const rawPath = (await page.video()?.path()) ?? "";
  await browser.close();
  if (!rawPath) throw new Error("no recording was produced");

  const offset = (t0 - pageCreated) / 1000;
  writeFileSync(path.join(OUT, "timeline.json"), JSON.stringify({ offset, end, shots }, null, 2));
  writeSrt();
  encode(ffmpegExe, rawPath, offset, end);
  extractFrames(ffmpegExe);
  console.log(`done: ${MP4} (${end.toFixed(1)} s)`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
