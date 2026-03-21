import { ParsedSession } from './parser'
import { ParsedConversation } from './conversation'
import { ScoreResult, getISOWeekKey, BEHAVIORS } from './scoring'
import { estimateSessionCost, loadPricing, PricingData } from './pricing'

/** Get the actual prompt count (messages with content), falling back to user_message_count for legacy ParsedSession */
function getPromptCount(c: ParsedConversation | ParsedSession): number {
  return 'prompt_count' in c ? (c as ParsedConversation).prompt_count : c.user_message_count
}

export interface WeeklyTokenAggregation {
  week: string
  total_tokens: number
  avg_tokens_per_conversation: number
  avg_cache_hit_rate: number
  conversation_count: number
  /** @deprecated Use avg_tokens_per_conversation */
  avg_tokens_per_session?: number
  /** @deprecated Use conversation_count */
  session_count?: number
}

export interface ConversationEfficiency {
  avg_tokens_per_prompt: number
  avg_cache_hit_rate: number
  total_tokens: number
  total_conversations: number
  most_efficient_conversation: { id: string; tokens_per_prompt: number } | null
  /** @deprecated Use total_conversations */
  total_sessions?: number
  /** @deprecated Use most_efficient_conversation */
  most_efficient_session?: { id: string; tokens_per_prompt: number } | null
}

/** @deprecated Use ConversationEfficiency */
export type SessionEfficiency = ConversationEfficiency

// Base enriched type that works with both ParsedConversation and ParsedSession
export type EnrichedConversation = (Omit<ParsedConversation, 'user_prompts' | 'tools_used'> | Omit<ParsedSession, 'user_prompts' | 'tools_used'>) & {
  overall_score: number | null
  estimated_cost: number
}

/** @deprecated Use EnrichedConversation */
export type EnrichedSession = EnrichedConversation

export interface ConversationAnalyticsResult {
  conversations: EnrichedConversation[]
  aggregates: {
    avg_tokens_per_conversation: number
    avg_tokens_per_prompt: number
    avg_cache_hit_rate: number
    total_conversations: number
    total_estimated_cost: number
    /** @deprecated Use avg_tokens_per_conversation */
    avg_tokens_per_session?: number
    /** @deprecated Use total_conversations */
    total_sessions?: number
  }
  weekly: WeeklyTokenAggregation[]
  /** @deprecated Use conversations */
  sessions?: EnrichedConversation[]
}

/** @deprecated Use ConversationAnalyticsResult */
export type SessionAnalyticsResult = ConversationAnalyticsResult

export function computeWeeklyTokenAggregation(conversations: (ParsedConversation | ParsedSession)[]): WeeklyTokenAggregation[] {
  if (conversations.length === 0) return []

  const weekGroups = new Map<string, { conversations: (ParsedConversation | ParsedSession)[]; monday: string }>()

  for (const conv of conversations) {
    if (!conv.started_at) continue

    const weekInfo = getISOWeekKey(conv.started_at)
    if (!weekInfo) continue

    const group = weekGroups.get(weekInfo.key)
    if (group) {
      group.conversations.push(conv)
    } else {
      weekGroups.set(weekInfo.key, { conversations: [conv], monday: weekInfo.monday })
    }
  }

  const result: WeeklyTokenAggregation[] = []
  for (const [week, { conversations: weekConvs }] of weekGroups) {
    const totalTokens = weekConvs.reduce((sum, c) => sum + c.total_tokens, 0)
    const avgTokensPerConv = Math.round(totalTokens / weekConvs.length)
    const avgCacheHitRate = weekConvs.reduce((sum, c) => sum + c.cache_hit_rate, 0) / weekConvs.length

    result.push({
      week,
      total_tokens: totalTokens,
      avg_tokens_per_conversation: avgTokensPerConv,
      avg_tokens_per_session: avgTokensPerConv, // deprecated alias
      avg_cache_hit_rate: Math.round(avgCacheHitRate * 10000) / 10000,
      conversation_count: weekConvs.length,
      session_count: weekConvs.length, // deprecated alias
    })
  }

  result.sort((a, b) => a.week.localeCompare(b.week))
  return result
}

export function computeConversationEfficiency(conversations: (ParsedConversation | ParsedSession)[]): ConversationEfficiency {
  if (conversations.length === 0) {
    return {
      avg_tokens_per_prompt: 0,
      avg_cache_hit_rate: 0,
      total_tokens: 0,
      total_conversations: 0,
      total_sessions: 0,
      most_efficient_conversation: null,
      most_efficient_session: null,
    }
  }

  const totalTokens = conversations.reduce((sum, c) => sum + c.total_tokens, 0)
  const totalPrompts = conversations.reduce((sum, c) => sum + getPromptCount(c), 0)
  const avgTokensPerPrompt = totalPrompts > 0 ? totalTokens / totalPrompts : 0
  const avgCacheHitRate = conversations.reduce((sum, c) => sum + c.cache_hit_rate, 0) / conversations.length

  // Most efficient = lowest tokens_per_prompt among conversations that have prompts
  let mostEfficient: { id: string; tokens_per_prompt: number } | null = null
  for (const c of conversations) {
    if (getPromptCount(c) > 0 && c.total_tokens > 0) {
      if (!mostEfficient || c.tokens_per_prompt < mostEfficient.tokens_per_prompt) {
        mostEfficient = { id: c.id, tokens_per_prompt: Math.round(c.tokens_per_prompt) }
      }
    }
  }

  return {
    avg_tokens_per_prompt: Math.round(avgTokensPerPrompt),
    avg_cache_hit_rate: Math.round(avgCacheHitRate * 10000) / 10000,
    total_tokens: totalTokens,
    total_conversations: conversations.length,
    total_sessions: conversations.length, // deprecated alias
    most_efficient_conversation: mostEfficient,
    most_efficient_session: mostEfficient, // deprecated alias
  }
}

/** @deprecated Use computeConversationEfficiency */
export const computeSessionEfficiency = computeConversationEfficiency

export function joinConversationsWithScores(
  conversations: (ParsedConversation | ParsedSession)[],
  scores: ScoreResult[],
  pricing?: PricingData,
  configBehaviors?: Record<string, boolean>,
): EnrichedConversation[] {
  const scoreMap = new Map<string, number | null>()
  for (const score of scores) {
    if (score.overall_score == null) continue
    // Compute effective score: conversation behavior OR config behavior
    if (configBehaviors && score.fluency_behaviors) {
      const effectiveCount = BEHAVIORS.filter(b =>
        score.fluency_behaviors![b] || configBehaviors[b]
      ).length
      scoreMap.set(score.session_id, Math.round((effectiveCount / BEHAVIORS.length) * 100))
    } else {
      scoreMap.set(score.session_id, score.overall_score ?? null)
    }
  }

  let pricingData: PricingData | undefined
  try {
    pricingData = pricing || loadPricing()
  } catch {
    // pricing.json not found — costs will be 0
  }

  return conversations.map(conv => {
    // Strip large fields not needed for analytics UI to avoid OOM on IPC
    const { user_prompts, tools_used, ...rest } = conv

    let estimated_cost = 0
    if (pricingData) {
      const cost = estimateSessionCost(
        conv.total_input_tokens,
        conv.total_output_tokens,
        conv.total_cache_creation_tokens,
        conv.total_cache_read_tokens,
        conv.model,
        conv.started_at,
        pricingData,
      )
      estimated_cost = cost.total_cost
    }

    return {
      ...rest,
      overall_score: scoreMap.get(conv.id) ?? null,
      estimated_cost,
    }
  })
}

/** @deprecated Use joinConversationsWithScores */
export const joinSessionsWithScores = joinConversationsWithScores

export function buildConversationAnalytics(
  conversations: (ParsedConversation | ParsedSession)[],
  scores: ScoreResult[],
  configBehaviors?: Record<string, boolean>,
): ConversationAnalyticsResult {
  const enriched = joinConversationsWithScores(conversations, scores, undefined, configBehaviors)
  const weekly = computeWeeklyTokenAggregation(conversations)
  const efficiency = computeConversationEfficiency(conversations)

  const totalEstimatedCost = enriched.reduce((sum, c) => sum + c.estimated_cost, 0)

  const avgTokensPerConv = efficiency.total_conversations > 0
    ? Math.round(efficiency.total_tokens / efficiency.total_conversations)
    : 0

  return {
    conversations: enriched,
    sessions: enriched, // deprecated alias
    aggregates: {
      avg_tokens_per_conversation: avgTokensPerConv,
      avg_tokens_per_session: avgTokensPerConv, // deprecated alias
      avg_tokens_per_prompt: efficiency.avg_tokens_per_prompt,
      avg_cache_hit_rate: efficiency.avg_cache_hit_rate,
      total_conversations: efficiency.total_conversations,
      total_sessions: efficiency.total_conversations, // deprecated alias
      total_estimated_cost: Math.round(totalEstimatedCost * 100) / 100,
    },
    weekly,
  }
}

/** @deprecated Use buildConversationAnalytics */
export const buildSessionAnalytics = buildConversationAnalytics
