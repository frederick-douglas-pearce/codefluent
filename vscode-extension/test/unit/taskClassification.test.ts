import {
  classifyByBranch,
  classifyByKeywords,
  classifyTask,
  TASK_TYPES,
  BRANCH_PREFIX_MAP,
  TaskType,
} from '../../src/taskClassification'

// ─── TASK_TYPES constant ───────────────────────────────────────────

describe('TASK_TYPES', () => {
  it('has 8 task types', () => {
    expect(TASK_TYPES).toHaveLength(8)
  })

  it('contains all expected types', () => {
    expect(TASK_TYPES).toEqual([
      'feature', 'bug_fix', 'refactor', 'debug', 'test', 'docs', 'chore', 'exploration',
    ])
  })
})

// ─── BRANCH_PREFIX_MAP ─────────────────────────────────────────────

describe('BRANCH_PREFIX_MAP', () => {
  it('maps feature prefixes', () => {
    expect(BRANCH_PREFIX_MAP['feature']).toBe('feature')
    expect(BRANCH_PREFIX_MAP['feat']).toBe('feature')
  })

  it('maps bug fix prefixes', () => {
    expect(BRANCH_PREFIX_MAP['fix']).toBe('bug_fix')
    expect(BRANCH_PREFIX_MAP['bugfix']).toBe('bug_fix')
    expect(BRANCH_PREFIX_MAP['hotfix']).toBe('bug_fix')
  })

  it('maps chore prefixes', () => {
    expect(BRANCH_PREFIX_MAP['chore']).toBe('chore')
    expect(BRANCH_PREFIX_MAP['ci']).toBe('chore')
    expect(BRANCH_PREFIX_MAP['build']).toBe('chore')
  })
})

// ─── classifyByBranch ──────────────────────────────────────────────

describe('classifyByBranch', () => {
  it('returns null for null branch', () => {
    expect(classifyByBranch(null)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(classifyByBranch('')).toBeNull()
  })

  it('returns null for main', () => {
    expect(classifyByBranch('main')).toBeNull()
  })

  it('returns null for master', () => {
    expect(classifyByBranch('master')).toBeNull()
  })

  it('returns null for develop', () => {
    expect(classifyByBranch('develop')).toBeNull()
  })

  it('returns null for branch without slash', () => {
    expect(classifyByBranch('my-branch')).toBeNull()
  })

  it('classifies feature/ prefix', () => {
    expect(classifyByBranch('feature/add-login')).toBe('feature')
  })

  it('classifies feat/ prefix', () => {
    expect(classifyByBranch('feat/add-login')).toBe('feature')
  })

  it('classifies fix/ prefix', () => {
    expect(classifyByBranch('fix/broken-button')).toBe('bug_fix')
  })

  it('classifies bugfix/ prefix', () => {
    expect(classifyByBranch('bugfix/broken-button')).toBe('bug_fix')
  })

  it('classifies hotfix/ prefix', () => {
    expect(classifyByBranch('hotfix/critical-issue')).toBe('bug_fix')
  })

  it('classifies refactor/ prefix', () => {
    expect(classifyByBranch('refactor/cleanup-utils')).toBe('refactor')
  })

  it('classifies test/ prefix', () => {
    expect(classifyByBranch('test/add-unit-tests')).toBe('test')
  })

  it('classifies docs/ prefix', () => {
    expect(classifyByBranch('docs/update-readme')).toBe('docs')
  })

  it('classifies chore/ prefix', () => {
    expect(classifyByBranch('chore/update-deps')).toBe('chore')
  })

  it('classifies ci/ prefix', () => {
    expect(classifyByBranch('ci/fix-pipeline')).toBe('chore')
  })

  it('classifies build/ prefix', () => {
    expect(classifyByBranch('build/update-webpack')).toBe('chore')
  })

  it('is case insensitive', () => {
    expect(classifyByBranch('Feature/add-login')).toBe('feature')
    expect(classifyByBranch('FIX/broken-button')).toBe('bug_fix')
    expect(classifyByBranch('DOCS/update-readme')).toBe('docs')
  })

  it('returns null for unrecognized prefix', () => {
    expect(classifyByBranch('release/v1.0')).toBeNull()
    expect(classifyByBranch('unknown/something')).toBeNull()
  })
})

// ─── classifyByKeywords ────────────────────────────────────────────

describe('classifyByKeywords', () => {
  it('returns null for empty prompts', () => {
    expect(classifyByKeywords([])).toBeNull()
  })

  it('detects bug_fix keywords', () => {
    expect(classifyByKeywords(['fix the login page'])).toBe('bug_fix')
    expect(classifyByKeywords(['there is a bug in the parser'])).toBe('bug_fix')
    expect(classifyByKeywords(['the button is broken'])).toBe('bug_fix')
    expect(classifyByKeywords(['the app crashes on startup'])).toBe('bug_fix')
    expect(classifyByKeywords(['this test fails'])).toBe('bug_fix')
    expect(classifyByKeywords(['it is not working'])).toBe('bug_fix')
  })

  it('detects debug keywords', () => {
    expect(classifyByKeywords(['debug the authentication flow'])).toBe('debug')
    expect(classifyByKeywords(['why is the server slow'])).toBe('debug')
    // "what's wrong" contains "wrong" which matches bug_fix first (ordered matching trade-off)
    expect(classifyByKeywords(["what's wrong with this code"])).toBe('bug_fix')
    expect(classifyByKeywords(['investigate the memory leak'])).toBe('debug')
  })

  it('detects refactor keywords', () => {
    expect(classifyByKeywords(['refactor the user module'])).toBe('refactor')
    expect(classifyByKeywords(['clean up the utils file'])).toBe('refactor')
    expect(classifyByKeywords(['simplify this function'])).toBe('refactor')
  })

  it('detects test keywords', () => {
    expect(classifyByKeywords(['write a unit test for the parser'])).toBe('test')
    expect(classifyByKeywords(['add test coverage for scoring'])).toBe('test')
    expect(classifyByKeywords(['create a mock for the API'])).toBe('test')
  })

  it('detects docs keywords', () => {
    expect(classifyByKeywords(['update the readme'])).toBe('docs')
    expect(classifyByKeywords(['add jsdoc comments'])).toBe('docs')
    expect(classifyByKeywords(['document the API'])).toBe('docs')
  })

  it('detects chore keywords', () => {
    expect(classifyByKeywords(['update the CI pipeline'])).toBe('chore')
    expect(classifyByKeywords(['bump the dependency versions'])).toBe('chore')
    expect(classifyByKeywords(['configure the linter'])).toBe('chore')
  })

  it('detects feature keywords', () => {
    expect(classifyByKeywords(['add a new dashboard'])).toBe('feature')
    expect(classifyByKeywords(['implement user authentication'])).toBe('feature')
    expect(classifyByKeywords(['create a settings page'])).toBe('feature')
  })

  it('detects exploration keywords', () => {
    expect(classifyByKeywords(['explore different caching strategies'])).toBe('exploration')
    expect(classifyByKeywords(['how do I use the API'])).toBe('exploration')
    // "dependency" no longer in chore patterns; "what is" matches exploration
    expect(classifyByKeywords(['what is dependency injection'])).toBe('exploration')
    // "prototype a new layout" — "new" matches feature first; use unambiguous prompt
    expect(classifyByKeywords(['prototype a possible layout'])).toBe('exploration')
  })

  it('bug_fix takes priority over feature (ordered matching)', () => {
    // "fix" matches bug_fix before "add" matches feature
    expect(classifyByKeywords(['fix and add the new feature'])).toBe('bug_fix')
  })

  it('only scans first 3 prompts', () => {
    const prompts = [
      'hello world',
      'how are you',
      'nice weather',
      'fix the critical bug',  // 4th prompt — should be ignored
    ]
    expect(classifyByKeywords(prompts)).toBeNull()
  })

  it('returns null when no keywords match', () => {
    expect(classifyByKeywords(['hello world'])).toBeNull()
    expect(classifyByKeywords(['just chatting'])).toBeNull()
  })
})

// ─── classifyTask ──────────────────────────────────────────────────

describe('classifyTask', () => {
  it('branch classification takes priority over keywords', () => {
    expect(classifyTask('feature/add-login', ['fix the bug'])).toBe('feature')
  })

  it('falls back to keywords when branch is null', () => {
    expect(classifyTask(null, ['fix the login page'])).toBe('bug_fix')
  })

  it('falls back to keywords when branch is unrecognized', () => {
    expect(classifyTask('main', ['implement new feature'])).toBe('feature')
  })

  it('returns null when both are null', () => {
    expect(classifyTask(null, [])).toBeNull()
    expect(classifyTask(null, ['hello world'])).toBeNull()
  })

  it('returns null when branch is develop and no keyword match', () => {
    expect(classifyTask('develop', ['just chatting'])).toBeNull()
  })
})
