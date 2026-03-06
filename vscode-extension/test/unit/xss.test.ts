import * as fs from 'fs'
import * as path from 'path'

// --- Extract escapeHtml from the real source file ---

const VSCODE_APP_PATH = path.resolve(__dirname, '../../media/app.js')
const WEBAPP_APP_PATH = path.resolve(__dirname, '../../../webapp/static/app.js')

function extractEscapeHtml(filePath: string): (str: any) => string {
  const src = fs.readFileSync(filePath, 'utf-8')
  const match = src.match(/function escapeHtml\(str\)\s*\{[^}]+\}/)
  if (!match) throw new Error(`escapeHtml not found in ${filePath}`)
  // Wrap in parens to make it an expression, then evaluate
  const fn = new Function(`return (${match[0].replace('function escapeHtml', 'function')})`)()
  return fn
}

const escapeHtml = extractEscapeHtml(VSCODE_APP_PATH)

// --- 1. escapeHtml function logic tests ---

describe('escapeHtml()', () => {
  test('escapes <script> tags', () => {
    const payload = '<script>alert("xss")</script>'
    const result = escapeHtml(payload)
    expect(result).not.toContain('<script>')
    expect(result).not.toContain('</script>')
    expect(result).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
  })

  test('escapes all 5 HTML entities (&, <, >, ", \')', () => {
    const input = '& < > " \''
    const result = escapeHtml(input)
    expect(result).toBe('&amp; &lt; &gt; &quot; &#039;')
  })

  test('handles non-string input (numbers)', () => {
    expect(escapeHtml(42)).toBe('42')
  })

  test('handles non-string input (null)', () => {
    expect(escapeHtml(null)).toBe('null')
  })

  test('handles non-string input (undefined)', () => {
    expect(escapeHtml(undefined)).toBe('undefined')
  })

  test('handles empty string', () => {
    expect(escapeHtml('')).toBe('')
  })

  test('passes through clean strings unchanged', () => {
    const clean = 'Hello world 123'
    expect(escapeHtml(clean)).toBe(clean)
  })

  test('neutralizes event handler injection (img onerror)', () => {
    const payload = '<img src=x onerror=alert(1)>'
    const result = escapeHtml(payload)
    // The < and > are escaped so the browser won't parse it as an HTML tag
    expect(result).not.toContain('<img')
    expect(result).not.toContain('<')
    expect(result).toBe('&lt;img src=x onerror=alert(1)&gt;')
  })

  test('neutralizes nested/combined payloads', () => {
    const payload = '"><script>alert(document.cookie)</script><input value="'
    const result = escapeHtml(payload)
    expect(result).not.toContain('<script>')
    expect(result).not.toContain('">')
    expect(result).toBe(
      '&quot;&gt;&lt;script&gt;alert(document.cookie)&lt;/script&gt;&lt;input value=&quot;'
    )
  })

  test('neutralizes SVG-based XSS', () => {
    const payload = '<svg onload=alert(1)>'
    const result = escapeHtml(payload)
    expect(result).not.toContain('<svg')
    expect(result).toBe('&lt;svg onload=alert(1)&gt;')
  })

  test('webapp escapeHtml is identical to vscode extension', () => {
    const webappFn = extractEscapeHtml(WEBAPP_APP_PATH)
    const payloads = [
      '<script>alert(1)</script>',
      '& < > " \'',
      '<img onerror=alert(1)>',
      'clean text',
      '',
    ]
    for (const payload of payloads) {
      expect(webappFn(payload)).toBe(escapeHtml(payload))
    }
  })
})

// --- 2. Source-level verification: every XSS vector uses escapeHtml() ---

describe('XSS vector coverage in media/app.js (VS Code extension)', () => {
  const src = fs.readFileSync(VSCODE_APP_PATH, 'utf-8')

  test('renderFluencyScore escapes project name', () => {
    expect(src).toContain('escapeHtml(project)')
  })

  test('renderFluencyScore escapes one_line_summary', () => {
    expect(src).toMatch(/escapeHtml\(scoreData\.one_line_summary/)
  })

  test('renderFluencyScore escapes coding_pattern', () => {
    expect(src).toMatch(/escapeHtml\(PATTERN_LABELS\[scoreData\.coding_pattern\]/)
  })

  test('renderFluencyScore escapes unknown pattern labels', () => {
    // In the pattern legend: PATTERN_LABELS[p] || escapeHtml(p)
    expect(src).toMatch(/PATTERN_LABELS\[p\]\s*\|\|\s*escapeHtml\(p\)/)
  })

  test('renderQuickWins escapes task title', () => {
    expect(src).toContain('escapeHtml(s.task)')
  })

  test('renderQuickWins escapes repo name', () => {
    expect(src).toContain('escapeHtml(s.repo)')
  })

  test('renderQuickWins escapes category', () => {
    expect(src).toContain('escapeHtml(s.category)')
  })

  test('renderQuickWins escapes estimated_minutes', () => {
    expect(src).toContain('escapeHtml(s.estimated_minutes)')
  })

  test('renderQuickWins escapes prompt text', () => {
    expect(src).toContain('escapeHtml(s.prompt)')
  })

  test('renderRecCard escapes title', () => {
    expect(src).toContain('escapeHtml(rec.title)')
  })

  test('renderRecCard escapes advice', () => {
    expect(src).toContain('escapeHtml(rec.advice)')
  })

  test('renderRecCard escapes prompt', () => {
    expect(src).toContain('escapeHtml(rec.prompt)')
  })

  test('renderRecCard escapes source', () => {
    expect(src).toContain('escapeHtml(rec.source)')
  })

  test('error catch blocks escape error messages', () => {
    expect(src).toContain('escapeHtml(e.message)')
  })

  test('renderOptimizerResults escapes input prompt', () => {
    expect(src).toContain('escapeHtml(inputPrompt)')
  })

  test('renderOptimizerResults escapes optimized_prompt', () => {
    expect(src).toContain('escapeHtml(data.optimized_prompt)')
  })

  test('renderOptimizerResults escapes explanation', () => {
    expect(src).toContain('escapeHtml(data.explanation)')
  })

  test('renderOptimizerResults escapes one_line_summary', () => {
    expect(src).toContain('escapeHtml(data.one_line_summary)')
  })

  test('renderOptimizerBehaviorTags escapes behavior labels', () => {
    expect(src).toMatch(/escapeHtml\(BEHAVIOR_LABELS\[key\]\s*\|\|\s*key\)/)
  })
})

// --- 3. Accessibility and Onboarding verification ---

describe('WCAG AA contrast fix', () => {
  test('VS Code extension uses #635C57 for --text-secondary fallback', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../media/style.css'), 'utf-8')
    expect(css).toContain('#635C57')
    expect(css).not.toContain('#78716C')
  })

  test('webapp uses #635C57 for --text-secondary', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../../webapp/static/style.css'), 'utf-8')
    expect(css).toContain('#635C57')
    expect(css).not.toContain('#78716C')
  })
})

describe('Focus-visible outlines', () => {
  test('VS Code extension CSS includes :focus-visible rule', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../media/style.css'), 'utf-8')
    expect(css).toContain(':focus-visible')
  })

  test('webapp CSS includes :focus-visible rule', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../../webapp/static/style.css'), 'utf-8')
    expect(css).toContain(':focus-visible')
  })
})

describe('Tooltip ARIA attributes', () => {
  test('VS Code extension app.js includes role="tooltip" via renderTooltip', () => {
    const src = fs.readFileSync(VSCODE_APP_PATH, 'utf-8')
    expect(src).toContain('role="tooltip"')
    expect(src).toContain('aria-describedby')
  })

  test('webapp app.js includes role="tooltip" via renderTooltip', () => {
    const src = fs.readFileSync(WEBAPP_APP_PATH, 'utf-8')
    expect(src).toContain('role="tooltip"')
    expect(src).toContain('aria-describedby')
  })

  test('VS Code extension index.html has ARIA on static tooltip', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../../media/index.html'), 'utf-8')
    expect(html).toContain('role="tooltip"')
    expect(html).toContain('aria-describedby')
  })

  test('webapp index.html has ARIA on static tooltip', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../../../webapp/static/index.html'), 'utf-8')
    expect(html).toContain('role="tooltip"')
    expect(html).toContain('aria-describedby')
  })
})

describe('Onboarding card', () => {
  test('VS Code extension uses vscode.getState/setState for onboarding persistence', () => {
    const src = fs.readFileSync(VSCODE_APP_PATH, 'utf-8')
    expect(src).toContain('hasSeenOnboarding')
    expect(src).toContain('vscode.getState()')
    expect(src).toContain('vscode.setState(')
  })

  test('webapp uses localStorage for onboarding persistence', () => {
    const src = fs.readFileSync(WEBAPP_APP_PATH, 'utf-8')
    expect(src).toContain('hasSeenOnboarding')
    expect(src).toContain('localStorage')
  })

  test('VS Code extension index.html has dismiss button with aria-label', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../../media/index.html'), 'utf-8')
    expect(html).toContain('aria-label="Dismiss onboarding"')
  })

  test('webapp index.html has dismiss button with aria-label', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../../../webapp/static/index.html'), 'utf-8')
    expect(html).toContain('aria-label="Dismiss onboarding"')
  })
})

describe('Force rescore checkbox', () => {
  test('VS Code extension app.js reads force-rescore checkbox state', () => {
    const src = fs.readFileSync(VSCODE_APP_PATH, 'utf-8')
    expect(src).toContain("getElementById('force-rescore').checked")
  })

  test('webapp app.js reads force-rescore checkbox state', () => {
    const src = fs.readFileSync(WEBAPP_APP_PATH, 'utf-8')
    expect(src).toContain("getElementById('force-rescore').checked")
  })
})

describe('XSS vector coverage in webapp/static/app.js', () => {
  const src = fs.readFileSync(WEBAPP_APP_PATH, 'utf-8')

  test('renderFluencyScore escapes project name', () => {
    expect(src).toContain('escapeHtml(project)')
  })

  test('renderFluencyScore escapes one_line_summary', () => {
    expect(src).toMatch(/escapeHtml\(scoreData\.one_line_summary/)
  })

  test('renderFluencyScore escapes coding_pattern', () => {
    expect(src).toMatch(/escapeHtml\(PATTERN_LABELS\[scoreData\.coding_pattern\]/)
  })

  test('renderQuickWins escapes task title', () => {
    expect(src).toContain('escapeHtml(s.task)')
  })

  test('renderQuickWins escapes repo name', () => {
    expect(src).toContain('escapeHtml(s.repo)')
  })

  test('renderQuickWins escapes category', () => {
    expect(src).toContain('escapeHtml(s.category)')
  })

  test('renderQuickWins escapes estimated_minutes', () => {
    expect(src).toContain('escapeHtml(s.estimated_minutes)')
  })

  test('renderQuickWins escapes prompt text', () => {
    expect(src).toContain('escapeHtml(s.prompt)')
  })

  test('renderRecCard escapes title', () => {
    expect(src).toContain('escapeHtml(rec.title)')
  })

  test('renderRecCard escapes advice', () => {
    expect(src).toContain('escapeHtml(rec.advice)')
  })

  test('renderRecCard escapes prompt', () => {
    expect(src).toContain('escapeHtml(rec.prompt)')
  })

  test('renderRecCard escapes source', () => {
    expect(src).toContain('escapeHtml(rec.source)')
  })

  test('error catch blocks escape error messages', () => {
    expect(src).toContain('escapeHtml(e.message)')
  })

  test('no inline onclick handlers in render output', () => {
    // Extract only the render function bodies (template literals in render functions)
    // to avoid false positives from the event delegation section
    const renderFunctions = src.match(/function render\w+[\s\S]*?^}/gm) || []
    for (const fn of renderFunctions) {
      expect(fn).not.toMatch(/onclick\s*=/)
    }
  })

  test('renderOptimizerResults escapes input prompt', () => {
    expect(src).toContain('escapeHtml(inputPrompt)')
  })

  test('renderOptimizerResults escapes optimized_prompt', () => {
    expect(src).toContain('escapeHtml(data.optimized_prompt)')
  })

  test('renderOptimizerResults escapes explanation', () => {
    expect(src).toContain('escapeHtml(data.explanation)')
  })

  test('renderOptimizerResults escapes one_line_summary', () => {
    expect(src).toContain('escapeHtml(data.one_line_summary)')
  })

  test('renderOptimizerBehaviorTags escapes behavior labels', () => {
    expect(src).toMatch(/escapeHtml\(BEHAVIOR_LABELS\[key\]\s*\|\|\s*key\)/)
  })
})
