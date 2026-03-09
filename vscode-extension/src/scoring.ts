import Anthropic from '@anthropic-ai/sdk'
import { ParsedSession } from './parser'
import { loadScoringPrompt, loadConfigPrompt, loadOptimizerPrompt, loadSingleScoringPrompt, fillTemplate } from './prompts'

export type ScoringErrorType = 'rate_limit' | 'network' | 'server' | 'auth' | 'invalid_request' | 'unknown'

export interface RetryOptions {
  maxAttempts?: number
  baseDelayMs?: number
  delayFn?: (ms: number) => Promise<void>
}

export interface ScoreResult {
  fluency_behaviors?: Record<string, boolean>
  coding_pattern?: string
  coding_pattern_quality?: string
  overall_score?: number
  one_line_summary?: string
  session_id: string
  error?: string
  low_confidence?: boolean
  suspicious_perfect_score?: boolean
  prompt_version?: string
}

export interface AggregateResult {
  sessions_scored: number
  sessions_requested?: number
  sessions_skipped?: number
  average_score: number
  behavior_prevalence: Record<string, number>
  pattern_distribution: Record<string, number>
  config_behaviors?: Record<string, boolean>
  score_history?: ScoreHistoryEntry[]
}

export interface ScoreHistoryEntry {
  period: string          // "2026-W04" (YYYY-Www) — ISO week
  period_start: string    // "2026-01-20" — Monday of that week (for display)
  score: number           // average effective score for that week (0-100)
  sessions_scored: number
}

export interface ConfigScoreResult {
  fluency_behaviors: Record<string, boolean>
  one_line_summary: string
}

export interface OptimizerResult {
  input_behaviors: Record<string, boolean>
  input_score: number
  optimized_prompt?: string
  behaviors_added: string[]
  explanation?: string
  one_line_summary: string
}

export interface SingleScoreResult {
  fluency_behaviors: Record<string, boolean>
  overall_score: number
  one_line_summary: string
}

export interface OptimizeResponse {
  already_good?: boolean
  input_score: number
  input_behaviors: Record<string, boolean>
  optimized_prompt?: string
  output_score?: number
  output_behaviors?: Record<string, boolean>
  behaviors_added?: string[]
  explanation?: string
  one_line_summary: string
  prompt_version: string
}

const _scoringPrompt = loadScoringPrompt()
const SCORING_PROMPT_TEMPLATE = _scoringPrompt.template
export const SCORING_PROMPT_VERSION = _scoringPrompt.version

const _configPrompt = loadConfigPrompt()
const CONFIG_SCORING_PROMPT_TEMPLATE = _configPrompt.template
export const CONFIG_SCORING_PROMPT_VERSION = _configPrompt.version

const _optimizerPrompt = loadOptimizerPrompt()
const OPTIMIZER_PROMPT_TEMPLATE = _optimizerPrompt.template
export const OPTIMIZER_PROMPT_VERSION = _optimizerPrompt.version

const _singleScoringPrompt = loadSingleScoringPrompt()
const SINGLE_SCORING_PROMPT_TEMPLATE = _singleScoringPrompt.template
export const SINGLE_SCORING_PROMPT_VERSION = _singleScoringPrompt.version

const BEHAVIORS = [
  'iteration_and_refinement', 'clarifying_goals', 'specifying_format',
  'providing_examples', 'setting_interaction_terms', 'checking_facts',
  'questioning_reasoning', 'identifying_missing_context',
  'adjusting_approach', 'building_on_responses', 'providing_feedback',
]

const VALID_CODING_PATTERNS = [
  'conceptual_inquiry', 'generation_then_comprehension', 'hybrid_code_explanation',
  'ai_delegation', 'progressive_ai_reliance', 'iterative_ai_debugging',
]
const HIGH_QUALITY_PATTERNS = [
  'conceptual_inquiry', 'generation_then_comprehension', 'hybrid_code_explanation',
]
const LOW_QUALITY_PATTERNS = [
  'ai_delegation', 'progressive_ai_reliance', 'iterative_ai_debugging',
]

/** Remove API keys and sensitive tokens from error messages. */
function sanitizeError(msg: string): string {
  return msg.replace(/sk-ant-[a-zA-Z0-9_-]+/g, '[REDACTED]')
}

export function classifyError(e: unknown): { type: ScoringErrorType; retryable: boolean; message: string } {
  const msg = sanitizeError(e instanceof Error ? e.message : String(e))
  const statusCode = (e as any)?.status ?? (e as any)?.statusCode

  if (statusCode === 429) {
    return { type: 'rate_limit', message: msg, retryable: true }
  }
  if (statusCode === 401 || statusCode === 403) {
    return { type: 'auth', message: msg, retryable: false }
  }
  if (statusCode === 400) {
    return { type: 'invalid_request', message: msg, retryable: false }
  }
  if (typeof statusCode === 'number' && statusCode >= 500) {
    return { type: 'server', message: msg, retryable: true }
  }
  if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed|network timeout|socket hang up/i.test(msg)) {
    return { type: 'network', message: msg, retryable: true }
  }
  return { type: 'unknown', message: msg, retryable: false }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  context: string,
  options: RetryOptions = {},
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 1000, delayFn } = options
  const sleep = delayFn ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)))
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e
      const { retryable, message, type } = classifyError(e)

      if (!retryable || attempt === maxAttempts) {
        console.error(`[CodeFluent] ${context} failed (${type}, attempt ${attempt}/${maxAttempts}): ${message}`)
        throw e
      }

      const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 200
      console.warn(`[CodeFluent] ${context} retrying (${type}, attempt ${attempt}/${maxAttempts}) in ${Math.round(delay)}ms: ${message}`)
      await sleep(delay)
    }
  }
  throw lastError
}

function extractTextFromResponse(response: Anthropic.Message): string {
  if (!response.content.length) {
    throw new Error('API returned empty response content')
  }
  const first = response.content[0]
  if (first.type !== 'text') {
    throw new Error(`API returned unexpected content type: ${first.type}`)
  }
  return first.text.trim()
}

function derivePatternQuality(pattern: string): string {
  if (HIGH_QUALITY_PATTERNS.includes(pattern)) return 'high'
  if (LOW_QUALITY_PATTERNS.includes(pattern)) return 'low'
  return 'unknown'
}

export function validateScoreResult(raw: unknown, sessionId: string, promptCount: number): ScoreResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { session_id: sessionId, error: 'API response is not a valid object' }
  }

  const obj = raw as Record<string, any>

  // fluency_behaviors: ensure all 11 keys, missing default to false, strip unknown, non-booleans default to false
  const rawBehaviors = typeof obj.fluency_behaviors === 'object' && obj.fluency_behaviors !== null && !Array.isArray(obj.fluency_behaviors)
    ? obj.fluency_behaviors : {}
  const fluency_behaviors: Record<string, boolean> = {}
  for (const b of BEHAVIORS) {
    fluency_behaviors[b] = typeof rawBehaviors[b] === 'boolean' ? rawBehaviors[b] : false
  }

  // overall_score: default 0, clamp 0-100, round to integer
  let overall_score = 0
  if (typeof obj.overall_score === 'number' && !isNaN(obj.overall_score)) {
    overall_score = Math.round(Math.min(100, Math.max(0, obj.overall_score)))
  }

  // coding_pattern: must be in VALID_CODING_PATTERNS
  const coding_pattern = typeof obj.coding_pattern === 'string' && VALID_CODING_PATTERNS.includes(obj.coding_pattern)
    ? obj.coding_pattern : 'unknown'

  // coding_pattern_quality: derived from pattern, not trusted from LLM
  const coding_pattern_quality = derivePatternQuality(coding_pattern)

  // one_line_summary: default "", truncate to 200
  let one_line_summary = ''
  if (typeof obj.one_line_summary === 'string') {
    one_line_summary = obj.one_line_summary.slice(0, 200)
  }

  const allBehaviorsTrue = Object.values(fluency_behaviors).every(v => v === true)
  const suspicious_perfect_score = overall_score === 100 && allBehaviorsTrue

  return {
    session_id: sessionId,
    fluency_behaviors,
    overall_score,
    coding_pattern,
    coding_pattern_quality,
    one_line_summary,
    low_confidence: promptCount < 3,
    suspicious_perfect_score,
  }
}

export function validateConfigScoreResult(raw: unknown): ConfigScoreResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Config scoring API response is not a valid object')
  }

  const obj = raw as Record<string, any>

  const rawBehaviors = typeof obj.fluency_behaviors === 'object' && obj.fluency_behaviors !== null && !Array.isArray(obj.fluency_behaviors)
    ? obj.fluency_behaviors : {}
  const fluency_behaviors: Record<string, boolean> = {}
  for (const b of BEHAVIORS) {
    fluency_behaviors[b] = typeof rawBehaviors[b] === 'boolean' ? rawBehaviors[b] : false
  }

  let one_line_summary = ''
  if (typeof obj.one_line_summary === 'string') {
    one_line_summary = obj.one_line_summary.slice(0, 200)
  }

  return { fluency_behaviors, one_line_summary }
}

export async function scoreClaudeMd(
  content: string,
  client: Anthropic,
  retryOptions?: RetryOptions,
): Promise<ConfigScoreResult> {
  const truncated = content.slice(0, 4000)
  const prompt = fillTemplate(CONFIG_SCORING_PROMPT_TEMPLATE, { CONTENT: truncated })

  const response = await withRetry(
    () => client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
    'scoreClaudeMd',
    retryOptions,
  )

  let text = extractTextFromResponse(response)
  if (text.startsWith('```')) {
    text = text.split('\n').slice(1).join('\n').replace(/```\s*$/, '').trim()
  }
  return validateConfigScoreResult(JSON.parse(text))
}

export async function scoreSessions(
  sessionIds: string[],
  allSessions: Record<string, ParsedSession>,
  cached: Record<string, any>,
  client: Anthropic,
  forceRescore = false,
  retryOptions?: RetryOptions,
): Promise<Record<string, ScoreResult>> {
  const results: Record<string, ScoreResult> = {}

  for (const sid of sessionIds) {
    if (cached[sid] && !forceRescore && cached[sid].prompt_version === SCORING_PROMPT_VERSION) {
      results[sid] = cached[sid]
      continue
    }

    const session = allSessions[sid]
    if (!session || !session.user_prompts.length) continue

    const promptsText = session.user_prompts.slice(0, 20)
      .map((p, i) => `<user_prompt index="${i + 1}">${p}</user_prompt>`)
      .join('\n\n')

    const prompt = fillTemplate(SCORING_PROMPT_TEMPLATE, {
      USED_PLAN_MODE: String(session.used_plan_mode),
      THINKING_COUNT: String(session.thinking_count),
      TOOLS_USED: session.tools_used.join(', '),
      PROMPTS: promptsText,
    })

    try {
      const response = await withRetry(
        () => client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
        `scoreSession(${sid})`,
        retryOptions,
      )
      let text = extractTextFromResponse(response)
      if (text.startsWith('```')) {
        text = text.split('\n').slice(1).join('\n').replace(/```\s*$/, '').trim()
      }
      const score = validateScoreResult(JSON.parse(text), sid, session.user_prompts.length)
      score.prompt_version = SCORING_PROMPT_VERSION
      results[sid] = score
      cached[sid] = score
    } catch (e: any) {
      console.error(`[CodeFluent] Failed to score session ${sid}: ${sanitizeError(e.message || String(e))}`)
      results[sid] = { error: sanitizeError(e.message || String(e)), session_id: sid }
    }
  }

  return results
}

export function computeAggregate(
  scoredSessions: any[],
  configBehaviors?: Record<string, boolean>,
): AggregateResult {
  const n = scoredSessions.length
  const prevalence: Record<string, number> = {}
  const totalBehaviors = BEHAVIORS.length

  // Compute per-session effective scores based on behavior counts (session OR config)
  // Attach effective_score to each session object so the frontend can display it directly
  let scoreSum = 0
  for (const s of scoredSessions) {
    let effectiveCount = 0
    for (const b of BEHAVIORS) {
      const sessionHas = s.fluency_behaviors?.[b]
      const configHas = configBehaviors?.[b]
      if (sessionHas || configHas) effectiveCount++
    }
    const effectiveScore = Math.round((effectiveCount / totalBehaviors) * 100)
    s.effective_score = effectiveScore
    scoreSum += effectiveScore
  }

  for (const b of BEHAVIORS) {
    const count = scoredSessions.filter(s => {
      const sessionHas = s.fluency_behaviors?.[b]
      const configHas = configBehaviors?.[b]
      return sessionHas || configHas
    }).length
    prevalence[b] = n ? Math.round((count / n) * 100) / 100 : 0
  }

  const patterns: Record<string, number> = {}
  for (const s of scoredSessions) {
    const p = s.coding_pattern || 'unknown'
    patterns[p] = (patterns[p] || 0) + 1
  }

  const avgScore = n ? Math.round(scoreSum / n) : 0

  const result: AggregateResult = {
    sessions_scored: n,
    average_score: avgScore,
    behavior_prevalence: prevalence,
    pattern_distribution: patterns,
  }

  if (configBehaviors) {
    result.config_behaviors = configBehaviors
  }

  return result
}

export function getISOWeekKey(dateStr: string): { key: string; monday: string } | null {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null

  // ISO week: week starts on Monday, week 1 contains Jan 4
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayOfWeek = date.getUTCDay() || 7 // Monday=1, Sunday=7
  // Set to nearest Thursday (ISO week date algorithm)
  date.setUTCDate(date.getUTCDate() + 4 - dayOfWeek)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)

  const year = date.getUTCFullYear()
  const key = `${year}-W${String(weekNum).padStart(2, '0')}`

  // Compute Monday of this ISO week
  const original = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const origDay = original.getUTCDay() || 7
  original.setUTCDate(original.getUTCDate() - (origDay - 1))
  const monday = original.toISOString().slice(0, 10)

  return { key, monday }
}

export function computeScoreHistory(
  scores: Record<string, ScoreResult>,
  sessions: ParsedSession[],
  configBehaviors?: Record<string, boolean>,
): ScoreHistoryEntry[] {
  const sessionTimestamps = new Map<string, string>()
  for (const s of sessions) {
    if (s.started_at) {
      sessionTimestamps.set(s.id, s.started_at)
    }
  }

  // Group scored sessions by ISO week
  const weekGroups = new Map<string, { monday: string; sessions: ScoreResult[] }>()

  for (const [sid, score] of Object.entries(scores)) {
    if (!score.fluency_behaviors) continue
    const timestamp = sessionTimestamps.get(sid)
    if (!timestamp) continue

    const weekInfo = getISOWeekKey(timestamp)
    if (!weekInfo) continue

    const group = weekGroups.get(weekInfo.key)
    if (group) {
      group.sessions.push(score)
    } else {
      weekGroups.set(weekInfo.key, { monday: weekInfo.monday, sessions: [score] })
    }
  }

  const totalBehaviors = BEHAVIORS.length
  const cfg = configBehaviors || {}

  const history: ScoreHistoryEntry[] = []
  for (const [period, { monday, sessions: weekSessions }] of weekGroups) {
    let scoreSum = 0
    for (const s of weekSessions) {
      let effectiveCount = 0
      for (const b of BEHAVIORS) {
        if (s.fluency_behaviors?.[b] || cfg[b]) effectiveCount++
      }
      scoreSum += (effectiveCount / totalBehaviors) * 100
    }
    history.push({
      period,
      period_start: monday,
      score: Math.round(scoreSum / weekSessions.length),
      sessions_scored: weekSessions.length,
    })
  }

  history.sort((a, b) => a.period.localeCompare(b.period))
  return history
}

export function validateOptimizerResult(raw: unknown): OptimizerResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Optimizer API response is not a valid object')
  }

  const obj = raw as Record<string, any>

  const rawBehaviors = typeof obj.input_behaviors === 'object' && obj.input_behaviors !== null && !Array.isArray(obj.input_behaviors)
    ? obj.input_behaviors : {}
  const input_behaviors: Record<string, boolean> = {}
  for (const b of BEHAVIORS) {
    input_behaviors[b] = typeof rawBehaviors[b] === 'boolean' ? rawBehaviors[b] : false
  }

  let input_score = 0
  if (typeof obj.input_score === 'number' && !isNaN(obj.input_score)) {
    input_score = Math.round(Math.min(100, Math.max(0, obj.input_score)))
  }

  let optimized_prompt: string | undefined
  if (typeof obj.optimized_prompt === 'string' && obj.optimized_prompt.length > 0) {
    optimized_prompt = obj.optimized_prompt
  }

  const behaviors_added: string[] = []
  if (Array.isArray(obj.behaviors_added)) {
    for (const b of obj.behaviors_added) {
      if (typeof b === 'string' && BEHAVIORS.includes(b)) {
        behaviors_added.push(b)
      }
    }
  }

  let explanation: string | undefined
  if (typeof obj.explanation === 'string') {
    explanation = obj.explanation.slice(0, 500)
  }

  let one_line_summary = ''
  if (typeof obj.one_line_summary === 'string') {
    one_line_summary = obj.one_line_summary.slice(0, 200)
  }

  return { input_behaviors, input_score, optimized_prompt, behaviors_added, explanation, one_line_summary }
}

export function validateSingleScoreResult(raw: unknown): SingleScoreResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Single scoring API response is not a valid object')
  }

  const obj = raw as Record<string, any>

  const rawBehaviors = typeof obj.fluency_behaviors === 'object' && obj.fluency_behaviors !== null && !Array.isArray(obj.fluency_behaviors)
    ? obj.fluency_behaviors : {}
  const fluency_behaviors: Record<string, boolean> = {}
  for (const b of BEHAVIORS) {
    fluency_behaviors[b] = typeof rawBehaviors[b] === 'boolean' ? rawBehaviors[b] : false
  }

  let overall_score = 0
  if (typeof obj.overall_score === 'number' && !isNaN(obj.overall_score)) {
    overall_score = Math.round(Math.min(100, Math.max(0, obj.overall_score)))
  }

  let one_line_summary = ''
  if (typeof obj.one_line_summary === 'string') {
    one_line_summary = obj.one_line_summary.slice(0, 200)
  }

  return { fluency_behaviors, overall_score, one_line_summary }
}

export function buildConfigBehaviorsContext(configBehaviors?: Record<string, boolean>): string {
  if (!configBehaviors) return ''
  const covered = Object.entries(configBehaviors)
    .filter(([, v]) => v)
    .map(([k]) => k)
  if (covered.length === 0) return ''
  return `\n\n## Behaviors Already Covered by Project Config (CLAUDE.md)\n\nThe following behaviors are already active via the project's CLAUDE.md file. Do NOT add these to the optimized prompt — they apply automatically:\n${covered.map(b => `- ${b}`).join('\n')}`
}

export async function optimizePrompt(
  inputPrompt: string,
  client: Anthropic,
  configBehaviors?: Record<string, boolean>,
  retryOptions?: RetryOptions,
): Promise<OptimizerResult> {
  const maxLength = Math.min(Math.max(inputPrompt.length * 3, 200), 4000)
  const prompt = fillTemplate(OPTIMIZER_PROMPT_TEMPLATE, {
    PROMPT: inputPrompt,
    MAX_LENGTH: String(maxLength),
    CONFIG_BEHAVIORS: buildConfigBehaviorsContext(configBehaviors),
  })

  const response = await withRetry(
    () => client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
    'optimizePrompt',
    retryOptions,
  )

  let text = extractTextFromResponse(response)
  if (text.startsWith('```')) {
    text = text.split('\n').slice(1).join('\n').replace(/```\s*$/, '').trim()
  }
  return validateOptimizerResult(JSON.parse(text))
}

export async function scoreSinglePrompt(
  inputPrompt: string,
  client: Anthropic,
  retryOptions?: RetryOptions,
): Promise<SingleScoreResult> {
  const prompt = fillTemplate(SINGLE_SCORING_PROMPT_TEMPLATE, {
    PROMPT: inputPrompt,
  })

  const response = await withRetry(
    () => client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
    'scoreSinglePrompt',
    retryOptions,
  )

  let text = extractTextFromResponse(response)
  if (text.startsWith('```')) {
    text = text.split('\n').slice(1).join('\n').replace(/```\s*$/, '').trim()
  }
  return validateSingleScoreResult(JSON.parse(text))
}
