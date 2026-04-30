/**
 * @jest-environment jsdom
 */
/// <reference lib="dom" />
//
// Regression coverage for #297 — Daily Token Usage chart DOM-leak.
//
// Strategy is hybrid: behavioral test of the new clearEmptyState helper
// in isolation (extracted from the source via brace-aware regex), plus
// source-level audits of the call-sites that must use it. We do not run
// renderUsageDashboard directly because it depends on ~7 globals (state,
// Chart, destroyChart, charts, renderUsagePace, formatCost, formatTokens)
// and app.js has top-level side effects that make full-file eval brittle.
// The source-level audit catches the regression class — "someone removed
// the clearEmptyState call" — without requiring that whole runtime.

import * as fs from 'fs'
import * as path from 'path'

const VSCODE_APP_PATH = path.resolve(__dirname, '../../media/app.js')
const WEBAPP_APP_PATH = path.resolve(__dirname, '../../../webapp/static/app.js')

function extractClearEmptyState(filePath: string): (container: Element | null) => void {
  const src = fs.readFileSync(filePath, 'utf-8')
  const match = src.match(/function clearEmptyState\(container\)\s*\{[\s\S]*?\n\}/)
  if (!match) throw new Error(`clearEmptyState not found in ${filePath}`)
  return new Function(`return (${match[0].replace('function clearEmptyState', 'function')})`)()
}

describe('clearEmptyState() — vscode-extension', () => {
  const clearEmptyState = extractClearEmptyState(VSCODE_APP_PATH)

  beforeEach(() => {
    document.body.innerHTML = `
      <div class="card">
        <h3>Daily Token Usage</h3>
        <canvas id="usage-chart"></canvas>
      </div>
    `
  })

  test('handles null container gracefully', () => {
    expect(() => clearEmptyState(null)).not.toThrow()
  })

  test('removes .empty-state-box children', () => {
    const card = document.querySelector('.card')!
    card.insertAdjacentHTML('beforeend', '<div class="empty-state-box">x</div>')
    expect(card.querySelector('.empty-state-box')).not.toBeNull()
    clearEmptyState(card)
    expect(card.querySelector('.empty-state-box')).toBeNull()
  })

  test('resets hidden canvas display', () => {
    const card = document.querySelector('.card')!
    const canvas = document.getElementById('usage-chart') as HTMLCanvasElement
    canvas.style.display = 'none'
    clearEmptyState(card)
    expect(canvas.style.display).toBe('')
  })

  test('idempotent on already-clean container', () => {
    const card = document.querySelector('.card')!
    clearEmptyState(card)
    expect(() => clearEmptyState(card)).not.toThrow()
    expect(card.querySelector('.empty-state-box')).toBeNull()
  })

  test('removes multiple .empty-state-box children if stacked', () => {
    const card = document.querySelector('.card')!
    card.insertAdjacentHTML('beforeend', '<div class="empty-state-box">a</div>')
    card.insertAdjacentHTML('beforeend', '<div class="empty-state-box">b</div>')
    clearEmptyState(card)
    expect(card.querySelectorAll('.empty-state-box').length).toBe(0)
  })

  test('combined: removes empty-state AND restores canvas in one call', () => {
    const card = document.querySelector('.card')!
    const canvas = document.getElementById('usage-chart') as HTMLCanvasElement
    canvas.style.display = 'none'
    card.querySelector('h3')!.insertAdjacentHTML(
      'afterend',
      '<div class="empty-state-box">No usage data yet.</div>'
    )

    clearEmptyState(card)

    expect(card.querySelector('.empty-state-box')).toBeNull()
    expect(canvas.style.display).toBe('')
  })
})

describe('clearEmptyState() — webapp parity', () => {
  test('webapp app.js has identical helper signature', () => {
    const src = fs.readFileSync(WEBAPP_APP_PATH, 'utf-8')
    expect(src).toMatch(/function clearEmptyState\(container\)\s*\{/)
  })

  test('webapp helper has same behavior as extension version', () => {
    const clearEmptyState = extractClearEmptyState(WEBAPP_APP_PATH)
    document.body.innerHTML = `
      <div class="card">
        <canvas id="usage-chart" style="display: none"></canvas>
        <div class="empty-state-box">stale</div>
      </div>
    `
    const card = document.querySelector('.card')!
    clearEmptyState(card)
    expect(card.querySelector('.empty-state-box')).toBeNull()
    expect((document.getElementById('usage-chart') as HTMLCanvasElement).style.display).toBe('')
  })
})

describe('renderUsageDashboard() call-site audits', () => {
  function renderUsageDashboardBody(filePath: string): string {
    const src = fs.readFileSync(filePath, 'utf-8')
    const match = src.match(/function renderUsageDashboard\(\)\s*\{[\s\S]*?\n\}/m)
    expect(match).toBeTruthy()
    return match![0]
  }

  test('vscode-extension calls clearEmptyState at top of function', () => {
    expect(renderUsageDashboardBody(VSCODE_APP_PATH)).toMatch(/clearEmptyState\(/)
  })

  test('webapp calls clearEmptyState at top of function', () => {
    expect(renderUsageDashboardBody(WEBAPP_APP_PATH)).toMatch(/clearEmptyState\(/)
  })
})

describe('loadData() catch-path call-site audits', () => {
  function loadDataCatchBlock(filePath: string): string {
    const src = fs.readFileSync(filePath, 'utf-8')
    const match = src.match(/} catch \(e\) \{[\s\S]*?Failed to load data[\s\S]*?\n\s*\}/m)
    expect(match).toBeTruthy()
    return match![0]
  }

  test('vscode-extension catch calls clearEmptyState before injecting error box', () => {
    expect(loadDataCatchBlock(VSCODE_APP_PATH)).toMatch(/clearEmptyState\(/)
  })

  test('webapp catch calls clearEmptyState before injecting error box', () => {
    expect(loadDataCatchBlock(WEBAPP_APP_PATH)).toMatch(/clearEmptyState\(/)
  })
})

describe('loadConversationsExplorer() catch-path stale-data audits', () => {
  function loadConversationsExplorerCatch(filePath: string): string {
    const src = fs.readFileSync(filePath, 'utf-8')
    const fnMatch = src.match(/async function loadConversationsExplorer\(\)\s*\{[\s\S]*?\n\}/m)
    expect(fnMatch).toBeTruthy()
    const catchMatch = fnMatch![0].match(/} catch \(e\) \{[\s\S]*?\n  \}/m)
    expect(catchMatch).toBeTruthy()
    return catchMatch![0]
  }

  for (const [label, filePath] of [
    ['vscode-extension', VSCODE_APP_PATH],
    ['webapp', WEBAPP_APP_PATH],
  ] as const) {
    test(`${label} catch hides conversations-summary-cards`, () => {
      expect(loadConversationsExplorerCatch(filePath))
        .toMatch(/conversations-summary-cards.*display\s*=\s*'none'/s)
    })

    test(`${label} catch hides agent-metrics-section`, () => {
      expect(loadConversationsExplorerCatch(filePath))
        .toMatch(/agent-metrics-section.*display\s*=\s*'none'/s)
    })

    test(`${label} catch hides conversations-charts-row`, () => {
      expect(loadConversationsExplorerCatch(filePath))
        .toMatch(/conversations-charts-row.*display\s*=\s*'none'/s)
    })

    test(`${label} catch hides conversations-table-container`, () => {
      expect(loadConversationsExplorerCatch(filePath))
        .toMatch(/conversations-table-container.*display\s*=\s*'none'/s)
    })
  }
})
