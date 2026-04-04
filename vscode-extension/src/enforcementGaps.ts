/**
 * Enforcement gap detector for CLAUDE.md files.
 *
 * Detects advisory language ("always", "never", "must") in CLAUDE.md content
 * that is NOT backed by programmatic hooks, and suggests which hook events
 * and matchers could enforce those statements.
 *
 * No VS Code API dependency — only pure logic (testable without VS Code).
 */

export interface EnforcementStatement {
  statement: string
  lineNumber: number
  source: string         // "project root", ".claude/", "~/.claude/"
  pattern: string        // Which regex matched
}

export interface EnforcementGap {
  statement: string
  lineNumber: number
  source: string
  suggestedHookEvent: string
  suggestedMatcher?: string
  severity: 'high' | 'medium'
}

export interface EnforcementGapReport {
  enforcementStatements: EnforcementStatement[]
  gaps: EnforcementGap[]
  coveredCount: number
}

/**
 * Patterns that detect enforcement/imperative language in CLAUDE.md lines.
 * Each pattern is case-insensitive and tested against individual lines.
 */
const ENFORCEMENT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bshall\s+always\b/i, label: 'shall always' },
  { pattern: /\bshould\s+always\b/i, label: 'should always' },
  { pattern: /\bunder\s+no\s+circumstances\b/i, label: 'under no circumstances' },
  { pattern: /\bdo\s+not\s+ever\b/i, label: 'do not ever' },
  { pattern: /\bwithout\s+exception\b/i, label: 'without exception' },
  { pattern: /\bevery\s+time\b/i, label: 'every time' },
  { pattern: /\brequired\s+to\s+\w+/i, label: 'required to' },
  { pattern: /\bmust\s+(not\s+)?\w+/i, label: 'must' },
  { pattern: /\bnever\s+\w+/i, label: 'never' },
  { pattern: /\balways\s+\w+/i, label: 'always' },
]

/**
 * Keyword-to-hook mapping: maps domain keywords found in enforcement
 * statements to the most appropriate hook event and matcher.
 */
const KEYWORD_TO_HOOK: Array<{
  keywords: RegExp
  event: string
  matcher?: string
  severity: 'high' | 'medium'
}> = [
  { keywords: /\b(commit|committing|pre-commit)\b/i, event: 'PreToolUse', matcher: 'Bash', severity: 'high' },
  { keywords: /\b(push|pushing)\b/i, event: 'PreToolUse', matcher: 'Bash', severity: 'high' },
  { keywords: /\b(test|tests|testing|npm\s+test|pytest)\b/i, event: 'PreToolUse', matcher: 'Bash', severity: 'high' },
  { keywords: /\b(lint|linting|eslint|format|formatting|prettier)\b/i, event: 'PostToolUse', matcher: 'Edit|Write', severity: 'medium' },
  { keywords: /\b(security|vulnerability|sanitize|escape|inject)\b/i, event: 'PreToolUse', matcher: 'Bash', severity: 'high' },
  { keywords: /\b(build|compile|compilation)\b/i, event: 'PostToolUse', matcher: 'Bash', severity: 'medium' },
  { keywords: /\b(review|approve|approval)\b/i, event: 'Stop', severity: 'medium' },
]

/**
 * Extract enforcement statements from CLAUDE.md content, skipping code blocks
 * and frontmatter sections.
 *
 * @param content - Raw CLAUDE.md content
 * @param source - Label for the file location (e.g., "project root")
 * @returns Array of enforcement statements with line numbers
 */
export function extractEnforcementStatements(
  content: string,
  source: string,
): EnforcementStatement[] {
  if (!content) return []

  const lines = content.split('\n')
  const statements: EnforcementStatement[] = []
  let inCodeBlock = false
  let inFrontmatter = false
  let pastFirstLine = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Handle frontmatter (only at start of file)
    if (i === 0 && trimmed === '---') {
      inFrontmatter = true
      continue
    }
    if (inFrontmatter) {
      if (trimmed === '---') {
        inFrontmatter = false
      }
      continue
    }

    // Handle fenced code blocks
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue

    pastFirstLine = true

    // Check each enforcement pattern against this line
    for (const { pattern, label } of ENFORCEMENT_PATTERNS) {
      if (pattern.test(line)) {
        statements.push({
          statement: line.trim(),
          lineNumber: i + 1, // 1-based
          source,
          pattern: label,
        })
        break // Only match the first pattern per line
      }
    }
  }

  return statements
}

/**
 * Map an enforcement statement to a suggested hook event + matcher
 * based on domain keywords found in the statement text.
 *
 * @param statement - The enforcement statement text
 * @returns Suggested hook event, optional matcher, and severity
 */
export function mapToHookSuggestion(
  statement: string,
): { event: string; matcher?: string; severity: 'high' | 'medium' } {
  for (const { keywords, event, matcher, severity } of KEYWORD_TO_HOOK) {
    if (keywords.test(statement)) {
      return { event, matcher, severity }
    }
  }
  // Default: generic stop hook with medium severity
  return { event: 'Stop', severity: 'medium' }
}

/**
 * Check if a hook configuration covers a given event + matcher combination.
 *
 * @param hooks - Hook configuration with events and matchers arrays
 * @param event - The hook event to check (e.g., "PreToolUse")
 * @param matcher - Optional matcher to check (e.g., "Bash")
 * @returns true if the hook config covers this event+matcher
 */
export function isHookCovered(
  hooks: { events: string[]; matchers: string[] },
  event: string,
  matcher?: string,
): boolean {
  if (!hooks.events.includes(event)) return false
  if (!matcher) return true
  return hooks.matchers.includes(matcher)
}

/**
 * Detect gaps between enforcement statements in CLAUDE.md and configured hooks.
 *
 * Scans the content for imperative/enforcement language, maps each statement
 * to a suggested hook, and checks whether existing hook configuration covers it.
 *
 * @param claudeMdContent - Raw CLAUDE.md file content
 * @param hooks - Hook configuration from scanConfigurationMaturity
 * @param source - Label for the file location (defaults to "project root")
 * @returns Report with enforcement statements, gaps, and coverage count
 */
export function detectEnforcementGaps(
  claudeMdContent: string,
  hooks: { configured: boolean; count: number; events: string[]; handlerTypes: string[]; matchers: string[] },
  source: string = 'project root',
): EnforcementGapReport {
  const enforcementStatements = extractEnforcementStatements(claudeMdContent, source)
  const gaps: EnforcementGap[] = []
  let coveredCount = 0

  for (const stmt of enforcementStatements) {
    const suggestion = mapToHookSuggestion(stmt.statement)
    const covered = isHookCovered(hooks, suggestion.event, suggestion.matcher)

    if (covered) {
      coveredCount++
    } else {
      gaps.push({
        statement: stmt.statement,
        lineNumber: stmt.lineNumber,
        source: stmt.source,
        suggestedHookEvent: suggestion.event,
        suggestedMatcher: suggestion.matcher,
        severity: suggestion.severity,
      })
    }
  }

  return {
    enforcementStatements,
    gaps,
    coveredCount,
  }
}
