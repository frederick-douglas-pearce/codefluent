/**
 * Heuristic task classification for conversations.
 *
 * Classifies conversations by branch prefix (if available) or keyword
 * patterns in the first few user prompts.
 */

export type TaskType =
  | 'feature'
  | 'bug_fix'
  | 'refactor'
  | 'debug'
  | 'test'
  | 'docs'
  | 'chore'
  | 'exploration'

export const TASK_TYPES: TaskType[] = [
  'feature',
  'bug_fix',
  'refactor',
  'debug',
  'test',
  'docs',
  'chore',
  'exploration',
]

export const BRANCH_PREFIX_MAP: Record<string, TaskType> = {
  feature: 'feature',
  feat: 'feature',
  fix: 'bug_fix',
  bugfix: 'bug_fix',
  hotfix: 'bug_fix',
  refactor: 'refactor',
  test: 'test',
  docs: 'docs',
  chore: 'chore',
  ci: 'chore',
  build: 'chore',
}

const SKIP_BRANCHES = new Set(['main', 'master', 'develop'])

const KEYWORD_PATTERNS: [TaskType, RegExp][] = [
  ['bug_fix', /\b(fix|bug|broken|crash(es|ing)?|error|issue|wrong|not working|fails?|failing)\b/],
  ['debug', /\b(debug|trace|breakpoint|inspect|why is|what'?s wrong|figure out why|investigate)\b/],
  ['refactor', /\b(refactor|restructure|reorganize|clean ?up|simplify|extract|move .+ to)\b/],
  ['test', /\b(test|spec|coverage|assert|mock|stub|unit test|integration test)\b/],
  ['docs', /\b(doc(s|ument)?|readme|comment|jsdoc|docstring|typedoc)\b/],
  ['chore', /\b(ci|pipeline|deploy|build|lint(er|ing)?|format(ter)?|upgrade|bump|dependabot|release|configure)\b/],
  ['feature', /\b(add|implement|create|build|new|feature|introduce|support for)\b/],
  ['exploration', /\b(explore|experiment|try|prototype|spike|poc|proof of concept|how (do|does|can|to)|what is|explain)\b/],
]

/**
 * Classify a conversation by its git branch prefix.
 * Returns null for main/master/develop, null branch, or unrecognized prefixes.
 */
export function classifyByBranch(gitBranch: string | null): TaskType | null {
  if (!gitBranch) return null

  const slashIndex = gitBranch.indexOf('/')
  if (slashIndex === -1) {
    // No slash — check if it's a skip branch, otherwise unrecognized
    if (SKIP_BRANCHES.has(gitBranch.toLowerCase())) return null
    return null
  }

  const prefix = gitBranch.slice(0, slashIndex).toLowerCase()
  if (SKIP_BRANCHES.has(prefix)) return null

  return BRANCH_PREFIX_MAP[prefix] || null
}

/**
 * Classify a conversation by keyword patterns in user prompts.
 * Only scans the first 3 prompts. First matching pattern wins.
 */
export function classifyByKeywords(userPrompts: string[]): TaskType | null {
  if (userPrompts.length === 0) return null

  const text = userPrompts.slice(0, 3).join(' ').toLowerCase()

  for (const [taskType, pattern] of KEYWORD_PATTERNS) {
    if (pattern.test(text)) return taskType
  }

  return null
}

/**
 * Classify a conversation using branch prefix first, then keyword fallback.
 */
export function classifyTask(gitBranch: string | null, userPrompts: string[]): TaskType | null {
  return classifyByBranch(gitBranch) || classifyByKeywords(userPrompts)
}
