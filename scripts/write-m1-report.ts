// Milestone 1 report writer (Requirements 16.10, 17.1, 17.2, 20.10).
// Run: `npm run report:m1`. Reads test-results/m1-measurements.json, lists docs/screenshots/m1/,
// reads docs/m1-design-changes.md and the group headings of the spec's tasks.md, and writes
// docs/milestone-1-report.md. Missing measurements render as "not measured".
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLIENT_JS_BUDGET_BYTES, SCENE_RENDER_BUDGET_MS } from '../view-model/constants'

export interface KnownGap {
  readonly number: number
  readonly title: string
}

const NOT_MEASURED = 'not measured'

const AXE_SCREENS: ReadonlyArray<readonly [string, string]> = [
  ['landing', 'Landing'],
  ['scanning', 'Scanning'],
  ['results-scene-request', 'Results scene (request/request)'],
  ['results-list-request', 'List view (request/request)'],
  ['detail-uuid', 'Detail panel (uuid)'],
  ['detail-forgotten', 'Detail panel (forgotten package)'],
]

const FIRST_GAP_GROUP = 31
const LAST_GAP_GROUP = 47

type Json = Record<string, unknown>

function obj(value: unknown): Json | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : undefined
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function fmt(n: number): string {
  return String(Math.round(n * 10) / 10)
}

function sceneSection(title: string, value: unknown): string[] {
  const m = obj(value)
  const median = num(m?.medianMs)
  if (median === undefined) return [`- ${title}: ${NOT_MEASURED}`]
  const verdict = median > SCENE_RENDER_BUDGET_MS ? 'exceeded' : 'within budget'
  const throttle = num(m?.throttle)
  const runs = Array.isArray(m?.runsMs)
    ? (m.runsMs as unknown[]).filter((r): r is number => num(r) !== undefined)
    : []
  const detail = [
    throttle !== undefined ? `${fmt(throttle)}x CPU throttle` : undefined,
    runs.length > 0 ? `${runs.length} runs: ${runs.map(fmt).join(', ')} ms` : undefined,
  ].filter((x): x is string => x !== undefined)
  return [
    `- ${title}: median ${fmt(median)} ms against ${SCENE_RENDER_BUDGET_MS} ms budget (${verdict})` +
      (detail.length > 0 ? ` (${detail.join('; ')})` : ''),
  ]
}

function clientJsSection(value: unknown): string[] {
  const m = obj(value)
  const total = num(m?.gzipBytes)
  if (total === undefined) return [`- Client JavaScript (gzip): ${NOT_MEASURED}`]
  const margin = CLIENT_JS_BUDGET_BYTES - total
  const verdict = margin < 0 ? 'exceeded' : 'within budget'
  const lines = [
    `- Total: ${total} bytes gzipped against ${CLIENT_JS_BUDGET_BYTES} bytes budget (${verdict})`,
    margin < 0
      ? `- Margin: ${-margin} bytes over budget`
      : `- Margin: ${margin} bytes under budget`,
  ]
  const largest = Array.isArray(m?.largest) ? (m.largest as unknown[]) : []
  const rows = largest
    .map((l) => obj(l))
    .filter((l): l is Json => l !== undefined && str(l.file) !== undefined && num(l.gzipBytes) !== undefined)
  if (rows.length > 0) {
    lines.push('- Largest files:')
    for (const r of rows) lines.push(`  - \`${String(r.file)}\`: ${String(r.gzipBytes)} bytes`)
  }
  return lines
}

function axeSection(value: unknown): string[] {
  const all = obj(value)
  const lines = ['| Screen | Result |', '| --- | --- |']
  for (const [key, label] of AXE_SCREENS) {
    const r = obj(all?.[key])
    const count = num(r?.violationCount)
    let cell = NOT_MEASURED
    if (count !== undefined) {
      const ids = Array.isArray(r?.ruleIds) ? (r.ruleIds as unknown[]).filter((x) => typeof x === 'string') : []
      cell = count === 0 ? '0 violations' : `${count} violation(s)${ids.length > 0 ? `: ${ids.join(', ')}` : ''}`
    }
    lines.push(`| ${label} | ${cell} |`)
  }
  return lines
}

function deploySection(value: unknown): string[] {
  const d = obj(value)
  if (d === undefined) return [`- Deployed URL check: ${NOT_MEASURED}`]
  const field = (label: string, v: string | number | undefined) => `- ${label}: ${v === undefined ? NOT_MEASURED : v}`
  return [
    field('URL', str(d.url)),
    field('verify:deploy', str(d.verifyDeploy)),
    field('Deployed spec', str(d.deployedSpec)),
    field('axe violations on deployment', num(d.axeViolations)),
    field('Commit', str(d.commit)),
    field('Vercel status', str(d.vercelStatus)),
    field('Checked at', str(d.checkedAt)),
  ]
}

function screenshotSection(files: readonly string[]): string[] {
  const pngs = files.filter((f) => f.toLowerCase().endsWith('.png')).sort()
  if (pngs.length === 0) return [`Screenshots: ${NOT_MEASURED} (no files in docs/screenshots/m1/)`]
  const lines: string[] = []
  for (const f of pngs) {
    lines.push(`![${f.replace(/\.png$/i, '')}](screenshots/m1/${f})`, '')
  }
  return lines
}

/** Extracts groups 31 to 47 from the headings of a tasks.md text. */
export function parseKnownGaps(tasksMd: string): KnownGap[] {
  const gaps: KnownGap[] = []
  for (const line of tasksMd.split(/\r?\n/)) {
    const m = /^- \[.\] (\d+)\. (.+?)\s*$/.exec(line)
    if (!m) continue
    const n = Number(m[1])
    if (n >= FIRST_GAP_GROUP && n <= LAST_GAP_GROUP) gaps.push({ number: n, title: m[2] })
  }
  return gaps
}

/** Builds the report markdown. Pure: no file access, no environment access. */
export function renderReport(
  measurements: unknown,
  files: readonly string[],
  designChanges?: string,
  knownGaps?: readonly KnownGap[],
): string {
  const m = obj(measurements) ?? {}
  const scene = obj(m.sceneRender)
  const out: string[] = ['# Milestone 1 report', '']

  out.push('## Screenshots', '', ...screenshotSection(files))

  out.push('## Scene render time', '')
  out.push(...sceneSection('request/request', scene?.request))
  out.push(...sceneSection('300 plots (synthetic)', scene?.synthetic300), '')

  out.push('## Client JavaScript size', '', ...clientJsSection(m.clientJs), '')

  out.push('## Accessibility (axe)', '', ...axeSection(m.m1A11y), '')

  out.push('## Deployed URL check', '', ...deploySection(m.deployCheck), '')

  out.push('## Changes to the design', '')
  const changes = designChanges?.trim()
  out.push(changes ? changes : '_No design changes recorded._', '')

  out.push('## Known gaps', '')
  if (knownGaps === undefined || knownGaps.length === 0) {
    out.push(`Task list: ${NOT_MEASURED}.`)
  } else {
    out.push('Not done yet:', '')
    for (const g of knownGaps) out.push(`- Group ${g.number}: ${g.title}`)
  }
  out.push('')

  out.push('## Credits', '', "Kiro credit usage can't be seen from inside the session.", '')
  return out.join('\n')
}

function readJson(file: string): unknown {
  if (!existsSync(file)) return undefined
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

function main(): void {
  const root = process.cwd()
  const measurements = readJson(path.join(root, 'test-results', 'm1-measurements.json'))
  const shotsDir = path.join(root, 'docs', 'screenshots', 'm1')
  const files = existsSync(shotsDir) ? readdirSync(shotsDir) : []
  const changesFile = path.join(root, 'docs', 'm1-design-changes.md')
  const designChanges = existsSync(changesFile) ? readFileSync(changesFile, 'utf8') : undefined
  const tasksFile = path.join(root, '.kiro', 'specs', 'graveyard-ui', 'tasks.md')
  const gaps = existsSync(tasksFile) ? parseKnownGaps(readFileSync(tasksFile, 'utf8')) : []
  const target = path.join(root, 'docs', 'milestone-1-report.md')
  writeFileSync(target, renderReport(measurements, files, designChanges, gaps))
  console.log(`wrote ${path.relative(root, target)}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
