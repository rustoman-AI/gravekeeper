import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  AXE_SCREENS,
  CREDITS_LINE,
  DEFAULT_DEPLOY_URL,
  KNOWN_GAPS,
  NOT_MEASURED,
  axeSection,
  deploySection,
  jsBudgetSection,
  parseFlags,
  renderReport,
  renderTimeSection,
  screenshotSection,
} from '../../scripts/write-m3-report'
import { CLIENT_JS_BUDGET_BYTES, SCENE_RENDER_BUDGET_MS } from '../../view-model/constants'

const tempDirs: string[] = []

afterEach(() => {
  for (const d of tempDirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const HEADINGS = [
  '## Screenshots',
  '## Render time',
  '## Client JavaScript',
  '## Accessibility (axe)',
  '## Deploy check',
  '## Design changes',
  '## Known gaps',
  '## Credits',
]

describe('renderReport (milestone 3)', () => {
  it('emits the sections in the required order', () => {
    const out = renderReport({}, [])
    const idx = HEADINGS.map((h) => out.indexOf(h))
    expect(idx.every((i) => i >= 0)).toBe(true)
    expect([...idx].sort((a, b) => a - b)).toEqual(idx)
  })

  it('says "not measured" for an absent file or key', () => {
    const out = renderReport(undefined, [])
    expect(out).toContain(`Render time: ${NOT_MEASURED}`)
    expect(out).toContain(`Client JavaScript (gzip): ${NOT_MEASURED}`)
    expect(out).toContain(`Screenshots: ${NOT_MEASURED}`)
    expect(out).toContain(`| Landing page | ${NOT_MEASURED} |`)
    expect(out).toContain(`- verify:deploy: ${NOT_MEASURED}`)
    expect(out).toContain('_No design changes recorded._')
    expect(renderReport({ scenePerf: {} }, [])).toContain(`- Request fixture: ${NOT_MEASURED}`)
  })

  it('builds the screenshot list from a temp directory', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'm3-shots-'))
    tempDirs.push(dir)
    mkdirSync(path.join(dir, 'm3'))
    for (const f of ['b-shot.png', 'a-shot.png', 'notes.txt']) {
      writeFileSync(path.join(dir, 'm3', f), '')
    }
    const files = readdirSync(path.join(dir, 'm3'))
    const out = renderReport({}, files)
    expect(out).toContain('![a-shot](screenshots/m3/a-shot.png)')
    expect(out).toContain('![b-shot](screenshots/m3/b-shot.png)')
    expect(out).not.toContain('notes.txt')
    expect(out.indexOf('a-shot')).toBeLessThan(out.indexOf('b-shot'))
    expect(screenshotSection([])[0]).toContain(NOT_MEASURED)
  })

  it('prints render time and budget text', () => {
    const lines = renderTimeSection({
      request: { medianMs: 12.34, runs: 3, runsMs: [11, 12.34, 13], throttle: 4 },
      synthetic300: { medianMs: SCENE_RENDER_BUDGET_MS + 50, runsMs: [1] },
      baselineMs: 20,
      regressionMaxMs: 40,
    }).join('\n')
    expect(lines).toContain(
      `median 12.3 ms against ${SCENE_RENDER_BUDGET_MS} ms budget (within budget)`,
    )
    expect(lines).toContain('(exceeded)')
    expect(lines).toContain('CPU throttle: 4x')
    expect(lines).toContain('Milestone 1 baseline: 20 ms')
    expect(lines).toContain('Regression limit: 40 ms')

    const within = jsBudgetSection({ total: CLIENT_JS_BUDGET_BYTES - 100, softCeiling: 5 }).join('\n')
    expect(within).toContain(`against ${CLIENT_JS_BUDGET_BYTES} bytes budget (within budget)`)
    expect(within).toContain('Margin: 100 bytes')
    const over = jsBudgetSection({ total: CLIENT_JS_BUDGET_BYTES + 7 }).join('\n')
    expect(over).toContain('(exceeded)')
    expect(over).toContain('Margin: 7 bytes over budget')
  })

  it('ends with the exact credits line', () => {
    expect(CREDITS_LINE).toBe(
      'Credit usage cannot be seen from here, so the credits spent on Milestone 3 are not reported.',
    )
    const out = renderReport({}, [])
    expect(out).toContain(`## Credits\n\n${CREDITS_LINE}`)
  })

  it('includes design changes text when given', () => {
    expect(renderReport({}, [], '  Moved the moon.  ')).toContain('Moved the moon.')
  })

  it('marks a failed deploy check', () => {
    expect(renderReport({}, [], undefined, { verify: 'fail' })).toContain('DEPLOY CHECK FAILED')
    expect(deploySection({ liveStatus: 500 }).join('\n')).toContain('DEPLOY CHECK FAILED')
    expect(deploySection({ verify: 'pass', deployed: 'pass', liveStatus: 200 }).join('\n')).not.toContain(
      'FAILED',
    )
  })
})

describe('axe table', () => {
  it('has exactly the 7 required screen keys', () => {
    expect(AXE_SCREENS.map(([k]) => k)).toEqual([
      'landing',
      'scanning',
      'results-scene-request',
      'results-scene-zoxide',
      'detail-uuid',
      'detail-aws-sign2',
      'results-scene-request-mobile',
    ])
    const rows = axeSection(undefined).slice(2)
    expect(rows).toHaveLength(7)
  })

  it('shows counts and rule ids', () => {
    const rows = axeSection({
      landing: { violationCount: 0, ruleIds: [], url: '/' },
      scanning: { violationCount: 2, ruleIds: ['color-contrast', 'label'], url: '/s' },
    }).join('\n')
    expect(rows).toContain('| Landing page | 0 violations |')
    expect(rows).toContain('| Scanning screen | 2 violation(s): color-contrast, label |')
  })
})

describe('known gaps', () => {
  it('includes the mobile above-the-fold gap', () => {
    expect(KNOWN_GAPS.some((g) => g.includes('390x844') && g.includes('without scrolling'))).toBe(true)
    expect(renderReport({}, [])).toContain('390x844')
  })
})

describe('parseFlags', () => {
  it('parses all flags when present', () => {
    expect(
      parseFlags([
        '--url=https://example.test',
        '--verify=pass',
        '--deployed=fail',
        '--live-status=200',
        '--live-ms=1500',
      ]),
    ).toEqual({
      url: 'https://example.test',
      verify: 'pass',
      deployed: 'fail',
      liveStatus: 200,
      liveMs: 1500,
    })
  })

  it('uses defaults and undefined when flags are missing or malformed', () => {
    expect(DEFAULT_DEPLOY_URL).toBe('https://gravekeeper-chi.vercel.app')
    expect(parseFlags([])).toEqual({
      url: DEFAULT_DEPLOY_URL,
      verify: undefined,
      deployed: undefined,
      liveStatus: undefined,
      liveMs: undefined,
    })
    const bad = parseFlags(['--verify=maybe', '--live-status=abc', '--live-ms=', '--url='])
    expect(bad.verify).toBeUndefined()
    expect(bad.liveStatus).toBeUndefined()
    expect(bad.liveMs).toBeUndefined()
    expect(bad.url).toBe(DEFAULT_DEPLOY_URL)
  })
})

describe('script source', () => {
  it('contains no process.env', () => {
    const src = readFileSync(path.join(process.cwd(), 'scripts', 'write-m3-report.ts'), 'utf8')
    expect(src.includes('process.env')).toBe(false)
  })
})
