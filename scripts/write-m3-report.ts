// Milestone 3 report writer (Requirements 19.4, 19.5, 19.6).
// Run: `npm run report:m3`. Reads test-results/m3-measurements.json, lists docs/screenshots/m3/,
// reads docs/m3-design-changes.md, and writes docs/milestone-3-report.md.
// Deploy check values come from --verify=<pass|fail>, --deployed=<pass|fail>,
// --live-status=<n> and --live-ms=<n>. Anything missing renders as "not measured".
// It never reads or prints an environment variable.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { CLIENT_JS_BUDGET_BYTES, SCENE_RENDER_BUDGET_MS } from '../view-model/constants'

export interface DeployFlags {
  readonly url?: string
  readonly verify?: 'pass' | 'fail'
  readonly deployed?: 'pass' | 'fail'
  readonly liveStatus?: number
  readonly liveMs?: number
}

export const NOT_MEASURED = 'not measured'

export const DEFAULT_DEPLOY_URL = 'https://gravekeeper-chi.vercel.app'

export const CREDITS_LINE =
  'Credit usage cannot be seen from here, so the credits spent on Milestone 3 are not reported.'

export const KNOWN_GAPS: readonly string[] = [
  'Screenshots use reduced motion, so fog and flicker are not visible in them.',
  'The render time comes from a local production build, not from the deployed site.',
  'Tilt and depth need CSS `rotate` and `scale`.',
  'axe cannot judge contrast through gradients; the token test does.',
  'On a 390x844 phone the results header still takes most of the first screen, so only the top of the first graves is visible without scrolling (about half a grave for request/request, the top edge for zoxide). R5.11 requires only the art top.',
]

export const AXE_SCREENS: ReadonlyArray<readonly [string, string]> = [
  ['landing', 'Landing page'],
  ['scanning', 'Scanning screen'],
  ['results-scene-request', 'Results scene, request/request (1440x900)'],
  ['results-scene-zoxide', 'Results scene, ajeetdsouza/zoxide (1440x900)'],
  ['detail-uuid', 'Detail panel, uuid'],
  ['detail-aws-sign2', 'Detail panel, aws-sign2'],
  ['results-scene-request-mobile', 'Results scene, request/request (390x844)'],
]

type Json = Record<string, unknown>

function obj(value: unknown): Json | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : undefined
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

const show = (v: string | number | undefined): string => (v === undefined ? NOT_MEASURED : String(v))

function perfLine(title: string, value: unknown): string[] {
  const m = obj(value)
  const median = num(m?.medianMs)
  if (median === undefined) return [`- ${title}: ${NOT_MEASURED}`]
  const verdict = median > SCENE_RENDER_BUDGET_MS ? 'exceeded' : 'within budget'
  const runsMs = Array.isArray(m?.runsMs)
    ? (m.runsMs as unknown[]).filter((x): x is number => num(x) !== undefined)
    : []
  const throttle = num(m?.throttle)
  const lines = [
    `- ${title}: median ${median.toFixed(1)} ms against ${SCENE_RENDER_BUDGET_MS} ms budget (${verdict})`,
  ]
  lines.push(
    `  - Runs (${show(num(m?.runs) ?? (runsMs.length > 0 ? runsMs.length : undefined))}): ${
      runsMs.length > 0 ? runsMs.map((r) => `${r.toFixed(1)} ms`).join(', ') : NOT_MEASURED
    }`,
  )
  if (throttle !== undefined) lines.push(`  - CPU throttle: ${throttle}x`)
  return lines
}

export function renderTimeSection(scenePerf: unknown): string[] {
  const p = obj(scenePerf)
  if (p === undefined) return [`Render time: ${NOT_MEASURED}`]
  const lines = [
    ...perfLine('Request fixture', p.request),
    ...perfLine('Synthetic 300 plots', p.synthetic300),
  ]
  const base = num(p.baselineMs)
  const reg = num(p.regressionMaxMs)
  if (base !== undefined) lines.push(`- Milestone 1 baseline: ${base} ms`)
  if (reg !== undefined) lines.push(`- Regression limit: ${reg} ms`)
  return lines
}

export function jsBudgetSection(jsBudget: unknown): string[] {
  const j = obj(jsBudget)
  const total = num(j?.total)
  if (total === undefined) return [`Client JavaScript (gzip): ${NOT_MEASURED}`]
  const margin = CLIENT_JS_BUDGET_BYTES - total
  const lines = [
    `- Total: ${total} bytes gzipped against ${CLIENT_JS_BUDGET_BYTES} bytes budget (${
      margin < 0 ? 'exceeded' : 'within budget'
    })`,
    margin < 0 ? `- Margin: ${-margin} bytes over budget` : `- Margin: ${margin} bytes`,
  ]
  const soft = num(j?.softCeiling)
  if (soft !== undefined) lines.push(`- Soft ceiling: ${soft} bytes`)
  return lines
}

export function axeSection(value: unknown): string[] {
  const all = obj(value)
  const lines = ['| Screen | Result |', '| --- | --- |']
  const known = new Set(AXE_SCREENS.map(([k]) => k))
  const rows: Array<readonly [string, string]> = [...AXE_SCREENS]
  if (all !== undefined) {
    for (const k of Object.keys(all)) if (!known.has(k)) rows.push([k, k])
  }
  for (const [key, label] of rows) {
    const r = obj(all?.[key])
    // The spec writes { violationCount, ruleIds, url }. A `violations` array is also accepted.
    const violations = Array.isArray(r?.violations) ? (r.violations as unknown[]) : undefined
    const count = num(r?.violationCount) ?? violations?.length
    let cell = NOT_MEASURED
    if (count !== undefined) {
      const rawIds: unknown[] = Array.isArray(r?.ruleIds)
        ? (r.ruleIds as unknown[])
        : (violations ?? []).map((v) => (typeof v === 'string' ? v : obj(v)?.id))
      const ids = rawIds.filter((x): x is string => typeof x === 'string')
      cell =
        count === 0
          ? '0 violations'
          : `${count} violation(s)${ids.length > 0 ? `: ${ids.join(', ')}` : ''}`
    }
    lines.push(`| ${label} | ${cell} |`)
  }
  return lines
}

export function deploySection(flags: DeployFlags): string[] {
  const passFail = (v: 'pass' | 'fail' | undefined) => (v === undefined ? NOT_MEASURED : v)
  const lines: string[] = []
  if (flags.verify === 'fail' || flags.deployed === 'fail' || (flags.liveStatus !== undefined && flags.liveStatus !== 200)) {
    lines.push('**DEPLOY CHECK FAILED**', '')
  }
  lines.push(
    `- URL: ${show(flags.url)}`,
    `- verify:deploy: ${passFail(flags.verify)}`,
    `- Deployed spec: ${passFail(flags.deployed)}`,
    `- Live scan status: ${show(flags.liveStatus)}`,
    `- Live scan time (ms): ${show(flags.liveMs)}`,
  )
  return lines
}

export function screenshotSection(files: readonly string[]): string[] {
  const pngs = files.filter((f) => f.toLowerCase().endsWith('.png')).sort()
  if (pngs.length === 0) return [`Screenshots: ${NOT_MEASURED} (no files in docs/screenshots/m3/)`, '']
  const lines: string[] = []
  for (const f of pngs) lines.push(`![${f.replace(/\.png$/i, '')}](screenshots/m3/${f})`, '')
  return lines
}

/** Parses `--name=value` flags. Unknown or malformed flags are ignored. */
export function parseFlags(argv: readonly string[]): DeployFlags {
  const get = (name: string): string | undefined => {
    const prefix = `--${name}=`
    const hit = argv.find((a) => a.startsWith(prefix))
    const v = hit?.slice(prefix.length)
    return v === undefined || v === '' ? undefined : v
  }
  const pf = (v: string | undefined): 'pass' | 'fail' | undefined =>
    v === 'pass' || v === 'fail' ? v : undefined
  const n = (v: string | undefined): number | undefined => {
    if (v === undefined || !/^\d+$/.test(v)) return undefined
    return Number(v)
  }
  return {
    url: get('url') ?? DEFAULT_DEPLOY_URL,
    verify: pf(get('verify')),
    deployed: pf(get('deployed')),
    liveStatus: n(get('live-status')),
    liveMs: n(get('live-ms')),
  }
}

/** Builds the report markdown. Pure: no file access, no environment access. */
export function renderReport(
  measurements: unknown,
  files: readonly string[],
  designChanges?: string,
  flags: DeployFlags = {},
): string {
  const m = obj(measurements) ?? {}
  const out: string[] = ['# Milestone 3 report', '']
  out.push('## Screenshots', '', ...screenshotSection(files))
  out.push('## Render time', '', ...renderTimeSection(m.scenePerf), '')
  out.push('## Client JavaScript', '', ...jsBudgetSection(m.jsBudget), '')
  out.push('## Accessibility (axe)', '', ...axeSection(m.m3A11y), '')
  out.push('## Deploy check', '', ...deploySection(flags), '')
  out.push('## Design changes', '')
  const changes = designChanges?.trim()
  out.push(changes ? changes : '_No design changes recorded._', '')
  out.push('## Known gaps', '')
  for (const g of KNOWN_GAPS) out.push(`- ${g}`)
  out.push('')
  out.push('## Credits', '', CREDITS_LINE, '')
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
  const measurements = readJson(path.join(root, 'test-results', 'm3-measurements.json'))
  const shotsDir = path.join(root, 'docs', 'screenshots', 'm3')
  const files = existsSync(shotsDir) ? readdirSync(shotsDir) : []
  const changesFile = path.join(root, 'docs', 'm3-design-changes.md')
  const designChanges = existsSync(changesFile) ? readFileSync(changesFile, 'utf8') : undefined
  const target = path.join(root, 'docs', 'milestone-3-report.md')
  writeFileSync(target, renderReport(measurements, files, designChanges, parseFlags(process.argv.slice(2))))
  console.log(`wrote ${path.relative(root, target)}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
