import { ParsedSession } from './parser'
import { ScoreResult, getISOWeekKey } from './scoring'
import { estimateSessionCost, loadPricing, PricingData } from './pricing'

export interface WeeklyTokenAggregation {
  week: string
  total_tokens: number
  avg_tokens_per_session: number
  avg_cache_hit_rate: number
  session_count: number
}

export interface SessionEfficiency {
  avg_tokens_per_prompt: number
  avg_cache_hit_rate: number
  total_tokens: number
  total_sessions: number
  most_efficient_session: { id: string; tokens_per_prompt: number } | null
}

export interface EnrichedSession extends Omit<ParsedSession, 'user_prompts' | 'tools_used'> {
  overall_score: number | null
  estimated_cost: number
}

export interface SessionAnalyticsResult {
  sessions: EnrichedSession[]
  aggregates: {
    avg_tokens_per_session: number
    avg_tokens_per_prompt: number
    avg_cache_hit_rate: number
    total_sessions: number
    total_estimated_cost: number
  }
  weekly: WeeklyTokenAggregation[]
}

export function computeWeeklyTokenAggregation(sessions: ParsedSession[]): WeeklyTokenAggregation[] {
  if (sessions.length === 0) return []

  const weekGroups = new Map<string, { sessions: ParsedSession[]; monday: string }>()

  for (const session of sessions) {
    if (!session.started_at) continue

    const weekInfo = getISOWeekKey(session.started_at)
    if (!weekInfo) continue

    const group = weekGroups.get(weekInfo.key)
    if (group) {
      group.sessions.push(session)
    } else {
      weekGroups.set(weekInfo.key, { sessions: [session], monday: weekInfo.monday })
    }
  }

  const result: WeeklyTokenAggregation[] = []
  for (const [week, { sessions: weekSessions }] of weekGroups) {
    const totalTokens = weekSessions.reduce((sum, s) => sum + s.total_tokens, 0)
    const avgTokensPerSession = Math.round(totalTokens / weekSessions.length)
    const avgCacheHitRate = weekSessions.reduce((sum, s) => sum + s.cache_hit_rate, 0) / weekSessions.length

    result.push({
      week,
      total_tokens: totalTokens,
      avg_tokens_per_session: avgTokensPerSession,
      avg_cache_hit_rate: Math.round(avgCacheHitRate * 10000) / 10000,
      session_count: weekSessions.length,
    })
  }

  result.sort((a, b) => a.week.localeCompare(b.week))
  return result
}

export function computeSessionEfficiency(sessions: ParsedSession[]): SessionEfficiency {
  if (sessions.length === 0) {
    return {
      avg_tokens_per_prompt: 0,
      avg_cache_hit_rate: 0,
      total_tokens: 0,
      total_sessions: 0,
      most_efficient_session: null,
    }
  }

  const totalTokens = sessions.reduce((sum, s) => sum + s.total_tokens, 0)
  const avgTokensPerPrompt = sessions.reduce((sum, s) => sum + s.tokens_per_prompt, 0) / sessions.length
  const avgCacheHitRate = sessions.reduce((sum, s) => sum + s.cache_hit_rate, 0) / sessions.length

  // Most efficient = lowest tokens_per_prompt among sessions that have prompts
  let mostEfficient: { id: string; tokens_per_prompt: number } | null = null
  for (const s of sessions) {
    if (s.user_message_count > 0 && s.total_tokens > 0) {
      if (!mostEfficient || s.tokens_per_prompt < mostEfficient.tokens_per_prompt) {
        mostEfficient = { id: s.id, tokens_per_prompt: Math.round(s.tokens_per_prompt) }
      }
    }
  }

  return {
    avg_tokens_per_prompt: Math.round(avgTokensPerPrompt),
    avg_cache_hit_rate: Math.round(avgCacheHitRate * 10000) / 10000,
    total_tokens: totalTokens,
    total_sessions: sessions.length,
    most_efficient_session: mostEfficient,
  }
}

export function joinSessionsWithScores(
  sessions: ParsedSession[],
  scores: ScoreResult[],
  pricing?: PricingData,
): EnrichedSession[] {
  const scoreMap = new Map<string, number | null>()
  for (const score of scores) {
    scoreMap.set(score.session_id, score.overall_score ?? null)
  }

  let pricingData: PricingData | undefined
  try {
    pricingData = pricing || loadPricing()
  } catch {
    // pricing.json not found — costs will be 0
  }

  return sessions.map(session => {
    // Strip large fields not needed for analytics UI to avoid OOM on IPC
    const { user_prompts, tools_used, ...rest } = session

    let estimated_cost = 0
    if (pricingData) {
      const cost = estimateSessionCost(
        session.total_input_tokens,
        session.total_output_tokens,
        session.total_cache_creation_tokens,
        session.total_cache_read_tokens,
        session.model,
        session.started_at,
        pricingData,
      )
      estimated_cost = cost.total_cost
    }

    return {
      ...rest,
      overall_score: scoreMap.get(session.id) ?? null,
      estimated_cost,
    }
  })
}

export function buildSessionAnalytics(
  sessions: ParsedSession[],
  scores: ScoreResult[],
): SessionAnalyticsResult {
  const enriched = joinSessionsWithScores(sessions, scores)
  const weekly = computeWeeklyTokenAggregation(sessions)
  const efficiency = computeSessionEfficiency(sessions)

  const totalEstimatedCost = enriched.reduce((sum, s) => sum + s.estimated_cost, 0)

  return {
    sessions: enriched,
    aggregates: {
      avg_tokens_per_session: efficiency.total_sessions > 0
        ? Math.round(efficiency.total_tokens / efficiency.total_sessions)
        : 0,
      avg_tokens_per_prompt: efficiency.avg_tokens_per_prompt,
      avg_cache_hit_rate: efficiency.avg_cache_hit_rate,
      total_sessions: efficiency.total_sessions,
      total_estimated_cost: Math.round(totalEstimatedCost * 100) / 100,
    },
    weekly,
  }
}
