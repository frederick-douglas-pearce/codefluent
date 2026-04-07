import {
  extractEnforcementStatements,
  mapToHookSuggestion,
  isHookCovered,
  extractKeywords,
  detectEnforcementGaps,
  EnforcementStatement,
  EnforcementGap,
  EnforcementGapReport,
} from '../../src/enforcementGaps'

// ---- extractEnforcementStatements ----

describe('extractEnforcementStatements', () => {
  it('detects "always" pattern', () => {
    const result = extractEnforcementStatements('Always run tests before committing', 'project root')
    expect(result).toHaveLength(1)
    expect(result[0].pattern).toBe('always')
    expect(result[0].statement).toBe('Always run tests before committing')
    expect(result[0].lineNumber).toBe(1)
    expect(result[0].source).toBe('project root')
  })

  it('detects "never" pattern', () => {
    const result = extractEnforcementStatements('Never push directly to main', 'project root')
    expect(result).toHaveLength(1)
    expect(result[0].pattern).toBe('never')
  })

  it('detects "must" pattern', () => {
    const result = extractEnforcementStatements('You must run lint before committing', 'project root')
    expect(result).toHaveLength(1)
    expect(result[0].pattern).toBe('must')
  })

  it('detects "must not" pattern', () => {
    const result = extractEnforcementStatements('You must not skip tests', 'project root')
    expect(result).toHaveLength(1)
    expect(result[0].pattern).toBe('must')
  })

  it('detects "required to" pattern', () => {
    const result = extractEnforcementStatements('Developers are required to write tests', 'project root')
    expect(result).toHaveLength(1)
    expect(result[0].pattern).toBe('required to')
  })

  it('detects "every time" pattern', () => {
    const result = extractEnforcementStatements('Run the build every time you change code', 'project root')
    expect(result).toHaveLength(1)
    expect(result[0].pattern).toBe('every time')
  })

  it('detects "without exception" pattern', () => {
    const result = extractEnforcementStatements('Tests must pass without exception before merge', 'project root')
    expect(result).toHaveLength(1)
    expect(result[0].pattern).toBe('without exception')
  })

  it('detects "do not ever" pattern', () => {
    const result = extractEnforcementStatements('Do not ever commit secrets to the repo', 'project root')
    expect(result).toHaveLength(1)
    expect(result[0].pattern).toBe('do not ever')
  })

  it('detects "under no circumstances" pattern', () => {
    const result = extractEnforcementStatements('Under no circumstances should you skip security reviews', 'project root')
    expect(result).toHaveLength(1)
    expect(result[0].pattern).toBe('under no circumstances')
  })

  it('detects "shall always" pattern', () => {
    const result = extractEnforcementStatements('The CI pipeline shall always run before merge', 'project root')
    expect(result).toHaveLength(1)
    expect(result[0].pattern).toBe('shall always')
  })

  it('detects "should always" pattern', () => {
    const result = extractEnforcementStatements('Commits should always be signed', 'project root')
    expect(result).toHaveLength(1)
    expect(result[0].pattern).toBe('should always')
  })

  it('returns correct 1-based line numbers', () => {
    const content = 'Line 1\nLine 2\nAlways test\nLine 4'
    const result = extractEnforcementStatements(content, 'project root')
    expect(result).toHaveLength(1)
    expect(result[0].lineNumber).toBe(3)
  })

  it('skips lines inside fenced code blocks', () => {
    const content = '# Rules\n```\nAlways use strict mode\n```\nNever skip tests'
    const result = extractEnforcementStatements(content, 'project root')
    expect(result).toHaveLength(1)
    expect(result[0].statement).toBe('Never skip tests')
  })

  it('skips lines inside code blocks with language annotation', () => {
    const content = '# Example\n```typescript\nconst always_run = true\n```\nMust lint code'
    const result = extractEnforcementStatements(content, 'project root')
    expect(result).toHaveLength(1)
    expect(result[0].statement).toBe('Must lint code')
  })

  it('skips frontmatter at start of file', () => {
    const content = '---\ntitle: Always be testing\n---\nNever push without review'
    const result = extractEnforcementStatements(content, 'project root')
    expect(result).toHaveLength(1)
    expect(result[0].statement).toBe('Never push without review')
  })

  it('handles empty content', () => {
    expect(extractEnforcementStatements('', 'project root')).toEqual([])
  })

  it('handles content with no enforcement language', () => {
    const content = '# README\nThis is a project description.\nFeel free to contribute.'
    expect(extractEnforcementStatements(content, 'project root')).toEqual([])
  })

  it('detects multiple statements on different lines', () => {
    const content = 'Always run tests\nSome normal text\nNever skip linting\nMust review PRs'
    const result = extractEnforcementStatements(content, '.claude/')
    expect(result).toHaveLength(3)
    expect(result[0].lineNumber).toBe(1)
    expect(result[1].lineNumber).toBe(3)
    expect(result[2].lineNumber).toBe(4)
    expect(result[0].source).toBe('.claude/')
  })

  it('is case-insensitive', () => {
    const content = 'ALWAYS run tests\nnEVeR skip linting'
    const result = extractEnforcementStatements(content, 'project root')
    expect(result).toHaveLength(2)
  })

  it('only matches the first pattern per line', () => {
    // "must always" should match "must" since more-specific patterns come first
    // Actually "shall always" and "should always" are checked before "must",
    // but "must always" would match "must" since there's no "must always" specific pattern
    const content = 'You must always run tests'
    const result = extractEnforcementStatements(content, 'project root')
    expect(result).toHaveLength(1)
    // "must" is checked before "always" in the pattern list
    expect(result[0].pattern).toBe('must')
  })

  it('handles nested code blocks correctly', () => {
    const content = '```\ncode block\n```\nAlways test\n```\nmore code\n```'
    const result = extractEnforcementStatements(content, 'project root')
    expect(result).toHaveLength(1)
    expect(result[0].statement).toBe('Always test')
  })
})

// ---- mapToHookSuggestion ----

describe('mapToHookSuggestion', () => {
  it('maps commit keywords to PreToolUse/Bash/high', () => {
    const result = mapToHookSuggestion('Always run tests before committing')
    expect(result.event).toBe('PreToolUse')
    expect(result.matcher).toBe('Bash')
    expect(result.severity).toBe('high')
  })

  it('maps push keywords to PreToolUse/Bash/high', () => {
    const result = mapToHookSuggestion('Never push directly to main')
    expect(result.event).toBe('PreToolUse')
    expect(result.matcher).toBe('Bash')
    expect(result.severity).toBe('high')
  })

  it('maps test keywords to PreToolUse/Bash/high', () => {
    const result = mapToHookSuggestion('Must run tests before merge')
    expect(result.event).toBe('PreToolUse')
    expect(result.matcher).toBe('Bash')
    expect(result.severity).toBe('high')
  })

  it('maps npm test to PreToolUse/Bash/high', () => {
    const result = mapToHookSuggestion('Always run npm test first')
    expect(result.event).toBe('PreToolUse')
    expect(result.matcher).toBe('Bash')
    expect(result.severity).toBe('high')
  })

  it('maps pytest to PreToolUse/Bash/high', () => {
    const result = mapToHookSuggestion('Must run pytest before pushing')
    expect(result.event).toBe('PreToolUse')
    expect(result.matcher).toBe('Bash')
    expect(result.severity).toBe('high')
  })

  it('maps lint keywords to PostToolUse/Edit|Write/medium', () => {
    const result = mapToHookSuggestion('Always lint code after changes')
    expect(result.event).toBe('PostToolUse')
    expect(result.matcher).toBe('Edit|Write')
    expect(result.severity).toBe('medium')
  })

  it('maps eslint to PostToolUse/Edit|Write/medium', () => {
    const result = mapToHookSuggestion('Must run eslint on all files')
    expect(result.event).toBe('PostToolUse')
    expect(result.matcher).toBe('Edit|Write')
    expect(result.severity).toBe('medium')
  })

  it('maps formatting keywords to PostToolUse/Edit|Write/medium', () => {
    const result = mapToHookSuggestion('Always format with prettier')
    expect(result.event).toBe('PostToolUse')
    expect(result.matcher).toBe('Edit|Write')
    expect(result.severity).toBe('medium')
  })

  it('maps security keywords to PreToolUse/Bash/high', () => {
    const result = mapToHookSuggestion('Must sanitize all user input')
    expect(result.event).toBe('PreToolUse')
    expect(result.matcher).toBe('Bash')
    expect(result.severity).toBe('high')
  })

  it('maps build keywords to PostToolUse/Bash/medium', () => {
    const result = mapToHookSuggestion('Always build before deploying')
    expect(result.event).toBe('PostToolUse')
    expect(result.matcher).toBe('Bash')
    expect(result.severity).toBe('medium')
  })

  it('maps compile keywords to PostToolUse/Bash/medium', () => {
    const result = mapToHookSuggestion('Must compile the project before deploying')
    expect(result.event).toBe('PostToolUse')
    expect(result.matcher).toBe('Bash')
    expect(result.severity).toBe('medium')
  })

  it('maps review keywords to Stop/medium', () => {
    const result = mapToHookSuggestion('Must get review before merging')
    expect(result.event).toBe('Stop')
    expect(result.matcher).toBeUndefined()
    expect(result.severity).toBe('medium')
  })

  it('returns default Stop/medium for unmapped statements', () => {
    const result = mapToHookSuggestion('Always be kind to your teammates')
    expect(result.event).toBe('Stop')
    expect(result.matcher).toBeUndefined()
    expect(result.severity).toBe('medium')
  })
})

// ---- extractKeywords ----

describe('extractKeywords', () => {
  it('extracts meaningful words, removes stop words, and stems', () => {
    const kw = extractKeywords('All scripts must have the nonce attribute')
    expect(kw.has('script')).toBe(true)   // stemmed from "scripts"
    expect(kw.has('nonce')).toBe(true)
    expect(kw.has('attribute')).toBe(true)
    expect(kw.has('must')).toBe(false)    // stop word
    expect(kw.has('all')).toBe(false)     // stop word
    expect(kw.has('the')).toBe(false)     // stop word
  })

  it('lowercases and filters short words', () => {
    const kw = extractKeywords('Use CI/CD for PR')
    expect(kw.has('ci')).toBe(false)   // too short
    expect(kw.has('cd')).toBe(false)   // too short
    expect(kw.has('pr')).toBe(false)   // too short
  })

  it('returns empty set for stop-words-only text', () => {
    const kw = extractKeywords('must always be used')
    expect(kw.size).toBe(0)
  })
})

// ---- isHookCovered ----

describe('isHookCovered', () => {
  it('returns true when hook command shares keywords with statement', () => {
    const statement = 'All scripts must have the nonce attribute'
    const hookCommands = ['grep -L nonce= "$file" | grep -q . && echo "missing nonce attribute"']
    expect(isHookCovered(statement, hookCommands)).toBe(true)
  })

  it('returns false when hook command has no keyword overlap', () => {
    const statement = 'Always explain trade-offs between approaches'
    const hookCommands = ['find . -name "*.test.*" | grep -q . || exit 1']
    expect(isHookCovered(statement, hookCommands)).toBe(false)
  })

  it('returns false when no hook commands exist', () => {
    expect(isHookCovered('Must run tests before commit', [])).toBe(false)
  })

  it('matches test-related statement to test-checking hook', () => {
    const statement = 'All new features must have tests'
    const hookCommands = ['find . -name "*.test.*" -o -name "test_*" | grep -q . || echo "No test files"']
    expect(isHookCovered(statement, hookCommands)).toBe(true)
  })

  it('does not match unrelated hooks', () => {
    const statement = 'All shell commands must use execFileSync with argument arrays'
    const hookCommands = ['find . -name "*.test.*" | grep -q .']
    expect(isHookCovered(statement, hookCommands)).toBe(false)
  })

  it('matches across multiple hook commands', () => {
    const statement = 'All scripts must have the nonce attribute'
    const hookCommands = [
      'echo "test check"',
      'grep -L nonce= "$file" | echo "nonce missing"',
    ]
    expect(isHookCovered(statement, hookCommands)).toBe(true)
  })
})

// ---- detectEnforcementGaps ----

describe('detectEnforcementGaps', () => {
  const NO_HOOKS = {
    configured: false,
    count: 0,
    events: [] as string[],
    handlerTypes: [] as string[],
    matchers: [] as string[],
    hookCommands: [] as string[],
  }

  it('reports all statements as gaps when no hooks configured', () => {
    const content = 'Always run tests\nNever push to main'
    const report = detectEnforcementGaps(content, NO_HOOKS)
    expect(report.enforcementStatements).toHaveLength(2)
    expect(report.gaps).toHaveLength(2)
    expect(report.coveredCount).toBe(0)
  })

  it('marks statement as covered when hook command has keyword overlap', () => {
    const content = 'Always run tests before commit'
    const hooks = {
      configured: true,
      count: 1,
      events: ['PreToolUse'],
      handlerTypes: ['command'],
      matchers: ['Bash'],
      hookCommands: ['git commit && npm test || exit 1'],
    }
    const report = detectEnforcementGaps(content, hooks)
    expect(report.enforcementStatements).toHaveLength(1)
    expect(report.gaps).toHaveLength(0)
    expect(report.coveredCount).toBe(1)
  })

  it('produces correct counts for mixed covered/uncovered', () => {
    const content = 'Always run tests\nAlways format with prettier\nAlways get review'
    const hooks = {
      configured: true,
      count: 1,
      events: ['PreToolUse'],
      handlerTypes: ['command'],
      matchers: ['Bash'],
      hookCommands: ['find . -name "*.test.*" | grep -q . || echo "tests missing"'],
    }
    const report = detectEnforcementGaps(content, hooks)
    expect(report.enforcementStatements).toHaveLength(3)
    // "tests" keyword overlaps with hook command -> covered
    // "prettier" no overlap -> not covered
    // "review" no overlap -> not covered
    expect(report.coveredCount).toBe(1)
    expect(report.gaps).toHaveLength(2)
  })

  it('returns empty report for empty CLAUDE.md', () => {
    const report = detectEnforcementGaps('', NO_HOOKS)
    expect(report.enforcementStatements).toEqual([])
    expect(report.gaps).toEqual([])
    expect(report.coveredCount).toBe(0)
  })

  it('returns empty report for content without enforcement language', () => {
    const content = '# Project\nThis is a simple project.'
    const report = detectEnforcementGaps(content, NO_HOOKS)
    expect(report.enforcementStatements).toEqual([])
    expect(report.gaps).toEqual([])
    expect(report.coveredCount).toBe(0)
  })

  it('uses provided source label', () => {
    const content = 'Always test'
    const report = detectEnforcementGaps(content, NO_HOOKS, '.claude/')
    expect(report.enforcementStatements[0].source).toBe('.claude/')
    expect(report.gaps[0].source).toBe('.claude/')
  })

  it('defaults source to "project root"', () => {
    const content = 'Always test'
    const report = detectEnforcementGaps(content, NO_HOOKS)
    expect(report.enforcementStatements[0].source).toBe('project root')
  })

  it('gap includes suggested hook event and matcher', () => {
    const content = 'Must run tests before commit'
    const report = detectEnforcementGaps(content, NO_HOOKS)
    expect(report.gaps).toHaveLength(1)
    expect(report.gaps[0].suggestedHookEvent).toBe('PreToolUse')
    expect(report.gaps[0].suggestedMatcher).toBe('Bash')
    expect(report.gaps[0].severity).toBe('high')
  })

  it('gap for unmapped statement has Stop event and medium severity', () => {
    const content = 'Always be respectful'
    const report = detectEnforcementGaps(content, NO_HOOKS)
    expect(report.gaps[0].suggestedHookEvent).toBe('Stop')
    expect(report.gaps[0].suggestedMatcher).toBeUndefined()
    expect(report.gaps[0].severity).toBe('medium')
  })

  it('handles real-world CLAUDE.md content', () => {
    const content = [
      '# CLAUDE.md',
      '',
      '## Production Standards',
      '- **All new features must have tests.** No merging without test coverage.',
      '- Never commit secrets to the repository.',
      '- Always run `npm test` before pushing.',
      '',
      '```bash',
      '# This should always pass',
      'npm test',
      '```',
      '',
      '- Code should always be formatted with prettier.',
    ].join('\n')

    const report = detectEnforcementGaps(content, NO_HOOKS)
    // "must have" (line 4), "Never commit" (line 5), "Always run" (line 6), "should always" (line 13)
    expect(report.enforcementStatements.length).toBeGreaterThanOrEqual(3)
    // Lines inside code block should be skipped
    const statementsText = report.enforcementStatements.map(s => s.statement)
    expect(statementsText).not.toContain('# This should always pass')
  })
})
