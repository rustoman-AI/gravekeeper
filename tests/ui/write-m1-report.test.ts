import { afterEach, describe, expect, it } from 'vitest'

import { parseKnownGaps, renderReport } from '../../scripts/write-m1-report'
import { CLIENT_JS_BUDGET_BYTES, SCENE_RENDER_BUDGET_MS } from '../../view-model/constants'

const SCREENSHOTS = [
  'landing.png',
  'scanning.png',
  'results-scene.png',
  'results-list.png',
  'detail-uuid.png',
  'detail-forgotten.png',
]

const SCREENS = [
  'landing',
  'scanning',
  'results-scene-request',
  'results-list-request',
  'detail-uuid',
  'detail-forgotten',
]

function measurements(over: { sceneMs?: number; bytes?: number; a11y?: Record<string, unknown> } = {}) {
  const sceneMs = over.sceneMs ?? 100
  const bytes = over.bytes ?? CLIENT_JS_BUDGET_BYTES - 1000
  const clean = Object.fromEntries(
    SCREENS.map((s) => [s, { violationCount: 0, ruleIds: [], url: `/${s}` }]),
  )
  return {
    sceneRender: {
      request: { medianMs: sceneMs, runs: 3, runsMs: [sceneMs, sceneMs, sceneMs], throttle: 4 },
      synthetic300: { medianMs: sceneMs, runs: 3, runsMs: [sceneMs, sceneMs, sceneMs], throttle: 4 },
    },
    clientJs: {
      gzipBytes: bytes,
      budget: CLIENT_JS_BUDGET_BYTES,
      margin: CLIENT_JS_BUDGET_BYTES - bytes,
      files: 3,
      largest: [{ file: 'static/chunks/app.js', gzipBytes: 1234 }],
    },
    m1A11y: { ...clean, ...over.a11y },
    deployCheck: { url: 'https://example.test' },
  }
}

const savedSentinel = process.env.GK_TEST_SENTINEL

afterEach(() => {
  if (savedSentinel === undefined) delete process.env.GK_TEST_SENTINEL
  else process.env.GK_TEST_SENTINEL = savedSentinel
})

describe('renderReport', () => {
  it('names every screenshot', () => {
    const out = renderReport(measurements(), SCREENSHOTS)
    for (const f of SCREENSHOTS) expect(out).toContain(f)
  })

  it('prints render time and byte total next to their budget constants', () => {
    const out = renderReport(measurements({ sceneMs: SCENE_RENDER_BUDGET_MS - 7, bytes: 4567 }), SCREENSHOTS)
    expect(out).toContain(`median ${SCENE_RENDER_BUDGET_MS - 7} ms against ${SCENE_RENDER_BUDGET_MS} ms budget (within budget)`)
    expect(out).toContain(`4567 bytes gzipped against ${CLIENT_JS_BUDGET_BYTES} bytes budget (within budget)`)
    expect(out).not.toContain('exceeded')
  })

  it('marks both budgets as exceeded when they are', () => {
    const out = renderReport(
      measurements({ sceneMs: SCENE_RENDER_BUDGET_MS + 1, bytes: CLIENT_JS_BUDGET_BYTES + 1 }),
      SCREENSHOTS,
    )
    expect(out).toContain(`ms budget (exceeded)`)
    expect(out).toContain(`bytes budget (exceeded)`)
    expect(out).toContain('1 bytes over budget')
  })

  it('lists rule ids for a screen with violations', () => {
    const out = renderReport(
      measurements({
        a11y: { 'detail-uuid': { violationCount: 2, ruleIds: ['color-contrast', 'label'], url: '/x' } },
      }),
      SCREENSHOTS,
    )
    expect(out).toContain('2 violation(s): color-contrast, label')
    expect(out).toContain('| Landing | 0 violations |')
  })

  it('says "not measured" for missing keys', () => {
    const out = renderReport({}, [])
    expect(out).toContain('request/request: not measured')
    expect(out).toContain('300 plots (synthetic): not measured')
    expect(out).toContain('Client JavaScript (gzip): not measured')
    expect(out).toContain('| Landing | not measured |')
    expect(out).toContain('Deployed URL check: not measured')
    expect(out).toContain('Screenshots: not measured')
  })

  it('never prints an environment variable value', () => {
    const sentinel = 'sentinel-9f3c1a7e-do-not-print'
    process.env.GK_TEST_SENTINEL = sentinel
    const out = renderReport(measurements(), SCREENSHOTS, 'notes', [{ number: 31, title: 'Gap' }])
    expect(out).not.toContain(sentinel)
    const token = process.env.GITHUB_TOKEN
    if (token) expect(out.includes(token)).toBe(false)
  })
})

describe('parseKnownGaps', () => {
  it('extracts only groups 31 to 47', () => {
    const md = [
      '- [x] 30. Done group',
      '- [ ] 31. First gap',
      '  - [ ] 31.1 Subtask',
      '- [-] 40. Middle gap  ',
      '- [ ] 47. Last gap',
      '- [ ] 48. Beyond',
    ].join('\r\n')
    expect(parseKnownGaps(md)).toEqual([
      { number: 31, title: 'First gap' },
      { number: 40, title: 'Middle gap' },
      { number: 47, title: 'Last gap' },
    ])
  })
})
