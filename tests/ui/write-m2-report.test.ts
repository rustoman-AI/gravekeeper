import { afterEach, describe, expect, it } from 'vitest'

import { renderReport } from '../../scripts/write-m2-report'

const SCREENS = [
  'notes-section',
  'error-invalid-url',
  'error-invalid-request',
  'error-repo-not-found',
  'error-branch-not-found',
  'error-too-many-manifests',
  'error-manifest-not-found',
  'error-upstream-503',
  'error-upstream-502',
  'error-deadline-exceeded',
  'error-internal-error',
  'picker',
  'empty-graveyard',
  'client-failure-network-failure',
]

const SCREENSHOTS = SCREENS.map((s) => `${s}.png`)

const FAILURE_MARKER = 'DEPLOY CHECK FAILED'

interface DeployOver {
  verifyDeploy?: string
  status?: number
  axe?: number
}

function deployCheck(over: DeployOver = {}) {
  return {
    url: 'https://deploy.example.test',
    verifyDeploy: over.verifyDeploy ?? 'pass',
    deployedSpec: 'graveyard-ui',
    liveScan: { status: over.status ?? 200, scanResponseMs: 1234, totalMs: 4321, headline: 'All good' },
    axeViolations: over.axe ?? 0,
    commit: 'abc1234',
    vercelStatus: 'READY',
    checkedAt: '2025-01-01T00:00:00Z',
  }
}

function measurements(over: { a11y?: Record<string, unknown>; deploy?: unknown } = {}) {
  const clean = Object.fromEntries(
    SCREENS.map((s) => [s, { violationCount: 0, ruleIds: [], url: `/${s}` }]),
  )
  return {
    m2A11y: { ...clean, ...over.a11y },
    deployCheck: 'deploy' in over ? over.deploy : deployCheck(),
  }
}

const savedSentinel = process.env.GK_TEST_SENTINEL

afterEach(() => {
  if (savedSentinel === undefined) delete process.env.GK_TEST_SENTINEL
  else process.env.GK_TEST_SENTINEL = savedSentinel
})

describe('renderReport (milestone 2)', () => {
  it('names every one of the 14 screenshots', () => {
    const out = renderReport(measurements(), SCREENSHOTS)
    expect(SCREENSHOTS).toHaveLength(14)
    for (const f of SCREENSHOTS) expect(out).toContain(f)
  })

  it('lists rule ids for a screen with violations and shows 0 for clean ones', () => {
    const out = renderReport(
      measurements({
        a11y: { picker: { violationCount: 2, ruleIds: ['color-contrast', 'label'], url: '/p' } },
      }),
      SCREENSHOTS,
    )
    expect(out).toContain('| Manifest picker | 2 violation(s): color-contrast, label |')
    expect(out).toContain('| Notes section | 0 violations |')
    expect(out).toContain('| Client failure: network-failure | 0 violations |')
  })

  it('prints the credits line', () => {
    const out = renderReport(measurements(), SCREENSHOTS)
    expect(out).toContain("Kiro credit usage can't be seen from inside the session.")
  })

  it('does not mark a passing deploy check as failed', () => {
    const out = renderReport(measurements(), SCREENSHOTS)
    expect(out).not.toContain(FAILURE_MARKER)
    expect(out).not.toContain('incomplete')
    expect(out).toContain('https://deploy.example.test')
  })

  it.each([
    ['verify:deploy fails', { verifyDeploy: 'fail' }],
    ['live scan returns 500', { status: 500 }],
    ['axe finds violations', { axe: 3 }],
  ])('marks a failed deploy check when %s', (_label, over) => {
    const out = renderReport(measurements({ deploy: deployCheck(over) }), SCREENSHOTS)
    expect(out).toContain(FAILURE_MARKER)
  })

  it('says "not measured" and "incomplete" when the deploy check is missing', () => {
    const out = renderReport({ m2A11y: measurements().m2A11y }, SCREENSHOTS)
    expect(out).toContain('Deploy check: not measured')
    const partial = renderReport(measurements({ deploy: { url: 'https://x.test' } }), SCREENSHOTS)
    expect(partial).toContain('incomplete')
    expect(partial).toContain('not measured')
    expect(partial).not.toContain(FAILURE_MARKER)
  })

  it('says "not measured" for everything when given nothing', () => {
    const out = renderReport({}, [])
    expect(out).toContain('| Notes section | not measured |')
    expect(out).toContain('Screenshots: not measured')
    expect(out).toContain('Deploy check: not measured')
  })

  it('never prints an environment variable value', () => {
    const sentinel = 'sentinel-9f3c1a7e-do-not-print'
    process.env.GK_TEST_SENTINEL = sentinel
    const out = renderReport(measurements(), SCREENSHOTS, 'notes', [
      { number: 47, title: 'Gap', done: false },
    ])
    expect(out).not.toContain(sentinel)
    const token = process.env.GITHUB_TOKEN
    if (token) expect(out.includes(token)).toBe(false)
  })
})
