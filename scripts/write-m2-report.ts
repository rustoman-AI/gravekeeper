// Milestone 2 report writer (Requirements 20.10, 16.10).
// Run: `npm run report:m2`. Reads test-results/m2-measurements.json, lists docs/screenshots/m2/,
// reads docs/m2-design-changes.md and the group headings of the spec's tasks.md, and writes
// docs/milestone-2-report.md. Missing measurements render as "not measured".
// It never reads or prints an environment variable.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export interface KnownGap {
  readonly number: number
  readonly title: string
  readonly done: boolean
}

const NOT_MEASURED = 'not measured'

const AXE_SCREENS: ReadonlyArray<readonly [string, string]> = [
  ['notes-section', 'Notes section'],
  ['error-invalid-url', 'Error: invalid-url'],
  ['error-invalid-request', 'Error: invalid-request'],
  ['error-repo-not-found', 'Error: repo-not-found'],
  ['error-branch-not-found', 'Error: branch-not-found'],
  ['error-too-many-manifests', 'Error: too-many-manifests'],
  ['error-manifest-not-found', 'Error: manifest-not-found'],
  ['error-upstream-503', 'Error: upstream 503'],
  ['error-upstream-502', 'Error: upstream 502'],
  ['error-deadline-exceeded', 'Error: deadline-exceeded'],
  ['error-internal-error', 'Error: internal-error'],
  ['picker', 'Manifest picker'],
  ['empty-graveyard', 'Empty graveyard'],
  ['client-failure-network-failure', 'Client failure: network-failure'],
]

const FIRST_GAP_GROUP = 47

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

function axeSection(value: unknown): string[] {
  const all = obj(value)
  const lines = ['| Screen | Result |', '| --- | --- |']
  for (const [key, label] of AXE_SCREENS) {
    const r = obj(all?.[key])
    const count = num(r?.violationCount)
    let cell = NOT_MEASURED
    if (count !== undefined) {
      const ids = Array.isArray(r?.ruleIds)
        ? (r.ruleIds as unknown[]).filter((x): x is string => typeof x === 'string')
        : []
      cell =
        count === 0
          ? '0 violations'
          : `${count} violation(s)${ids.length > 0 ? `: ${ids.join(', ')}` : ''}`
    }
    lines.push(`| ${label} | ${cell} |`)
  }
  return lines
}

function deploySection(value: unknown): string[] {
  const d = obj(value)
  if (d === undefined) return [`- Deploy check: ${NOT_MEASURED}`]
  const field = (label: string, v: string | number | undefined) =>
    `- ${label}: ${v === undefined ? NOT_MEASURED : v}`
  const live = obj(d.liveScan)
  const liveStatus = num(live?.status)
  const verify = str(d.verifyDeploy)
  const axe = num(d.axeViolations)
  const failed =
    (verify !== undefined && !/^(pass|passed|ok)$/i.test(verify)) ||
    (liveStatus !== undefined && liveStatus !== 200) ||
    (axe !== undefined && axe > 0)
  const unknown = verify === undefined || liveStatus === undefined || axe === undefined
  const lines: string[] = []
  if (failed) lines.push('**DEPLOY CHECK FAILED**', '')
  else if (unknown) lines.push('**Deploy check incomplete: some results are not measured.**', '')
  lines.push(
    field('URL', str(d.url)),
    field('verify:deploy', verify),
    field('Deployed spec', str(d.deployedSpec)),
    field('Live scan status', liveStatus),
    field('Live scan response time (ms)', num(live?.scanResponseMs)),
    field('Live scan total time (ms)', num(live?.totalMs)),
    field('Live scan headline', str(live?.headline)),
    field('axe violations on deployment', axe),
    field('Commit', str(d.commit)),
    field('Vercel status', str(d.vercelStatus)),
    field('Checked at', str(d.checkedAt)),
  )
  return lines
}

function screenshotSection(files: readonly string[]): string[] {
  const pngs = files.filter((f) => f.toLowerCase().endsWith('.png')).sort()
  if (pngs.length === 0) return [`Screenshots: ${NOT_MEASURED} (no files in docs/screenshots/m2/)`, '']
  const lines: string[] = []
  for (const f of pngs) {
    lines.push(`![${f.replace(/\.png$/i, '')}](screenshots/m2/${f})`, '')
  }
  return lines
}

/** Extracts the groups from 47 on that are not complete, from the headings of a tasks.md text. */
export function parseKnownGaps(tasksMd: string): KnownGap[] {
  const gaps: KnownGap[] = []
  for (const line of tasksMd.split(/\r?\n/)) {
    const m = /^- \[(.)\] (\d+)\. (.+?)\s*$/.exec(line)
    if (!m) continue
    const n = Number(m[2])
    if (n >= FIRST_GAP_GROUP && m[1] !== 'x') gaps.push({ number: n, title: m[3], done: false })
  }
  return gaps
}

const FIXED_GAPS: readonly string[] = [
  'Scene art and palette are awaiting the user\'s visual review.',
  'Resurrect is a placeholder: the button is disabled and does nothing.',
  'Vite reports `vite-tsconfig-paths` as redundant; the plugin is kept.',
  'The deployed-project Playwright run can fail with an ENOENT flake when it uses 2 workers. Run it with `--workers=1`.',
]

/** Builds the report markdown. Pure: no file access, no environment access. */
export function renderReport(
  measurements: unknown,
  files: readonly string[],
  designChanges?: string,
  knownGaps?: readonly KnownGap[],
): string {
  const m = obj(measurements) ?? {}
  const out: string[] = ['# Milestone 2 report', '']

  out.push('## Screenshots', '', ...screenshotSection(files))

  out.push('## Accessibility (axe)', '', ...axeSection(m.m2A11y), '')

  out.push('## Deploy check', '', ...deploySection(m.deployCheck), '')

  out.push('## Design changes', '')
  const changes = designChanges?.trim()
  out.push(changes ? changes : '_No design changes recorded._', '')

  out.push('## Known gaps', '')
  for (const g of FIXED_GAPS) out.push(`- ${g}`)
  if (knownGaps === undefined) {
    out.push(`- Task list: ${NOT_MEASURED}.`)
  } else {
    for (const g of knownGaps) out.push(`- Task group ${g.number} not complete: ${g.title}`)
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
  const measurements = readJson(path.join(root, 'test-results', 'm2-measurements.json'))
  const shotsDir = path.join(root, 'docs', 'screenshots', 'm2')
  const files = existsSync(shotsDir) ? readdirSync(shotsDir) : []
  const changesFile = path.join(root, 'docs', 'm2-design-changes.md')
  const designChanges = existsSync(changesFile) ? readFileSync(changesFile, 'utf8') : undefined
  const tasksFile = path.join(root, '.kiro', 'specs', 'graveyard-ui', 'tasks.md')
  const gaps = existsSync(tasksFile) ? parseKnownGaps(readFileSync(tasksFile, 'utf8')) : undefined
  const target = path.join(root, 'docs', 'milestone-2-report.md')
  writeFileSync(target, renderReport(measurements, files, designChanges, gaps))
  console.log(`wrote ${path.relative(root, target)}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
