// Static client JavaScript budget gate (Requirement 17.2, design "JS budget enforcement").
// Run after `next build`: `npm run check:bundle`.
//
// Artifact mapping (Next.js 16, Turbopack), verified against a real build:
// - `.next/server/app/index.html`: prerendered route `/`. Its `<script src>` and
//   `<link rel="preload" as="script">` URLs are the initial scripts. Scripts with the
//   `noModule` attribute (legacy polyfills) are skipped because modern browsers never load them.
// - `.next/server/app/page_client-reference-manifest.js`: assigns
//   `globalThis.__RSC_MANIFEST["/page"]`. `clientModules["[project]/components/graveyard-app.tsx"].chunks`
//   lists the chunks of the statically imported modules. Lazy chunks (list view, detail panel,
//   picker, loaded by next/dynamic) are not listed there and not in the HTML, so they are excluded.
// - URLs `/_next/static/...` map to files `.next/static/...`.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

import { CLIENT_JS_BUDGET_BYTES } from '../view-model/constants'

export interface ChunkFile {
  readonly file: string
  readonly bytes: Uint8Array | string
}

export interface ChunkSize {
  readonly file: string
  readonly gzipBytes: number
}

export interface BudgetVerdict {
  readonly ok: boolean
  readonly total: number
  readonly budget: number
  readonly margin: number
}

export const GRAVEYARD_APP_MODULE_SUFFIX = 'components/graveyard-app.tsx'
const TOP_CHUNK_COUNT = 5

/** Gzip size (level 9) of each file, de-duplicated by file name (first occurrence wins). */
export function sumGzipBytes(files: readonly ChunkFile[]): { total: number; chunks: ChunkSize[] } {
  const seen = new Set<string>()
  const chunks: ChunkSize[] = []
  for (const f of files) {
    if (seen.has(f.file)) continue
    seen.add(f.file)
    chunks.push({ file: f.file, gzipBytes: gzipSync(f.bytes, { level: 9 }).length })
  }
  return { total: chunks.reduce((sum, c) => sum + c.gzipBytes, 0), chunks }
}

export function dedupeFiles(files: readonly string[]): string[] {
  return [...new Set(files)]
}

export function budgetVerdict(total: number, budget: number): BudgetVerdict {
  return { ok: total <= budget, total, budget, margin: budget - total }
}

export function largestChunks(chunks: readonly ChunkSize[], count = TOP_CHUNK_COUNT): ChunkSize[] {
  return [...chunks]
    .sort((a, b) => b.gzipBytes - a.gzipBytes || a.file.localeCompare(b.file))
    .slice(0, count)
}

export function budgetMessage(verdict: BudgetVerdict, chunks: readonly ChunkSize[]): string {
  const top = largestChunks(chunks)
    .map((c) => `  ${c.gzipBytes} B  ${c.file}`)
    .join('\n')
  const head = verdict.ok
    ? `Client JS within budget: total ${verdict.total} B gzip, CLIENT_JS_BUDGET_BYTES ${verdict.budget} B, margin ${verdict.margin} B.`
    : `Client JS over budget: total ${verdict.total} B gzip exceeds CLIENT_JS_BUDGET_BYTES ${verdict.budget} B by ${-verdict.margin} B.`
  return `${head}\nFive largest chunks:\n${top}`
}

/** Initial script URLs of the prerendered HTML (`<script src>` and `<link rel="preload" as="script">`). */
export function extractScriptUrls(html: string): string[] {
  const urls: string[] = []
  for (const m of html.matchAll(/<(script|link)\b[^>]*>/gi)) {
    const tag = m[0]
    const kind = m[1].toLowerCase()
    if (/\bnomodule\b/i.test(tag)) continue
    if (kind === 'script') {
      const src = /\bsrc="([^"]+)"/i.exec(tag)
      if (src) urls.push(src[1])
    } else if (/\brel="preload"/i.test(tag) && /\bas="script"/i.test(tag)) {
      const href = /\bhref="([^"]+)"/i.exec(tag)
      if (href) urls.push(href[1])
    }
  }
  return urls
}

/** Chunk URLs the client reference manifest lists for graveyard-app.tsx. */
export function extractManifestChunks(manifestSource: string): string[] {
  const start = manifestSource.indexOf('= {')
  const end = manifestSource.lastIndexOf('}')
  if (start < 0 || end < start) return []
  const manifest = JSON.parse(manifestSource.slice(start + 2, end + 1)) as {
    clientModules?: Record<string, { chunks?: string[] }>
  }
  const out: string[] = []
  for (const [key, mod] of Object.entries(manifest.clientModules ?? {})) {
    if (key.endsWith(GRAVEYARD_APP_MODULE_SUFFIX)) out.push(...(mod.chunks ?? []))
  }
  return out
}

/** `/_next/static/chunks/a.js?dpl=x` -> `static/chunks/a.js` (relative to `.next`), or undefined for non-JS. */
export function urlToNextFile(url: string): string | undefined {
  const clean = url.split(/[?#]/)[0]
  const idx = clean.indexOf('/_next/')
  const rel = idx >= 0 ? clean.slice(idx + '/_next/'.length) : clean.replace(/^\/+/, '')
  return rel.endsWith('.js') ? rel : undefined
}

export function collectInitialFiles(html: string, manifestSource: string): string[] {
  const files: string[] = []
  for (const url of [...extractScriptUrls(html), ...extractManifestChunks(manifestSource)]) {
    const file = urlToNextFile(url)
    if (file) files.push(file)
  }
  return dedupeFiles(files)
}

function main(): number {
  const nextDir = path.resolve(process.cwd(), '.next')
  const htmlPath = path.join(nextDir, 'server', 'app', 'index.html')
  const manifestPath = path.join(nextDir, 'server', 'app', 'page_client-reference-manifest.js')
  for (const p of [htmlPath, manifestPath]) {
    if (!existsSync(p)) {
      console.error(`check:bundle: missing ${p}. Run \`npm run build\` first.`)
      return 1
    }
  }
  const files = collectInitialFiles(readFileSync(htmlPath, 'utf8'), readFileSync(manifestPath, 'utf8'))
  const loaded: ChunkFile[] = []
  for (const file of files) {
    const abs = path.join(nextDir, file)
    if (!existsSync(abs)) {
      console.error(`check:bundle: chunk listed but not found: ${abs}`)
      return 1
    }
    loaded.push({ file, bytes: readFileSync(abs) })
  }
  const { total, chunks } = sumGzipBytes(loaded)
  const verdict = budgetVerdict(total, CLIENT_JS_BUDGET_BYTES)
  const message = budgetMessage(verdict, chunks)
  if (verdict.ok) console.log(message)
  else console.error(message)
  return verdict.ok ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main())
}
