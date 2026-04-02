import { ParsedConversation } from './conversation'
import { getISOWeekKey } from './scoring'

export interface AgentMetrics {
  tool_diversity_index: number       // mean of per-conversation (unique_tools / tool_use_count), 0-1
  plan_mode_adoption_rate: number    // conversations_with_plan / total, 0-1
  avg_cache_hit_rate: number         // mean of per-conversation cache_hit_rate, 0-1
  thinking_utilization_rate: number  // sum(thinking_count) / sum(assistant_message_count), 0-1
  avg_prompt_length: number          // mean character length across all user prompts
  conversation_count: number         // total conversations analyzed
}

export interface PerConversationAgentMetrics {
  id: string
  tool_diversity_index: number
  thinking_utilization_rate: number
  avg_prompt_length: number
}

export interface WeeklyAgentMetrics {
  week: string                       // ISO week format "2026-W02"
  tool_diversity_index: number
  plan_mode_adoption_rate: number
  avg_cache_hit_rate: number
  thinking_utilization_rate: number
  conversation_count: number
}

function roundRate(x: number): number {
  return Math.round(x * 10000) / 10000
}

function convToolDiversity(conv: ParsedConversation): number {
  if (conv.tool_use_count === 0) return 0
  return conv.tools_used.length / conv.tool_use_count
}

function convThinkingRate(conv: ParsedConversation): number {
  if (conv.assistant_message_count === 0) return 0
  return conv.thinking_count / conv.assistant_message_count
}

function convAvgPromptLength(conv: ParsedConversation): number {
  if (conv.user_prompts.length === 0) return 0
  const totalLen = conv.user_prompts.reduce((sum, p) => sum + p.length, 0)
  return totalLen / conv.user_prompts.length
}

export function computeAgentMetrics(conversations: ParsedConversation[]): AgentMetrics {
  if (conversations.length === 0) {
    return {
      tool_diversity_index: 0,
      plan_mode_adoption_rate: 0,
      avg_cache_hit_rate: 0,
      thinking_utilization_rate: 0,
      avg_prompt_length: 0,
      conversation_count: 0,
    }
  }

  // Tool diversity: mean of per-conversation values
  const diversitySum = conversations.reduce((sum, c) => sum + convToolDiversity(c), 0)
  const toolDiversityIndex = diversitySum / conversations.length

  // Plan mode adoption: fraction of conversations using plan mode
  const planCount = conversations.filter(c => c.used_plan_mode).length
  const planModeAdoptionRate = planCount / conversations.length

  // Cache hit rate: mean of per-conversation values
  const cacheSum = conversations.reduce((sum, c) => sum + c.cache_hit_rate, 0)
  const avgCacheHitRate = cacheSum / conversations.length

  // Thinking utilization: sum(thinking) / sum(assistant messages) across ALL conversations
  const totalThinking = conversations.reduce((sum, c) => sum + c.thinking_count, 0)
  const totalAssistant = conversations.reduce((sum, c) => sum + c.assistant_message_count, 0)
  const thinkingUtilizationRate = totalAssistant > 0 ? totalThinking / totalAssistant : 0

  // Avg prompt length: mean across ALL user prompts from all conversations
  const allPrompts = conversations.flatMap(c => c.user_prompts)
  const avgPromptLength = allPrompts.length > 0
    ? allPrompts.reduce((sum, p) => sum + p.length, 0) / allPrompts.length
    : 0

  return {
    tool_diversity_index: roundRate(toolDiversityIndex),
    plan_mode_adoption_rate: roundRate(planModeAdoptionRate),
    avg_cache_hit_rate: roundRate(avgCacheHitRate),
    thinking_utilization_rate: roundRate(thinkingUtilizationRate),
    avg_prompt_length: Math.round(avgPromptLength),
    conversation_count: conversations.length,
  }
}

export function computePerConversationMetrics(conversations: ParsedConversation[]): PerConversationAgentMetrics[] {
  return conversations.map(conv => ({
    id: conv.id,
    tool_diversity_index: roundRate(convToolDiversity(conv)),
    thinking_utilization_rate: roundRate(convThinkingRate(conv)),
    avg_prompt_length: Math.round(convAvgPromptLength(conv)),
  }))
}

export function computeWeeklyAgentMetrics(conversations: ParsedConversation[]): WeeklyAgentMetrics[] {
  if (conversations.length === 0) return []

  const weekGroups = new Map<string, ParsedConversation[]>()

  for (const conv of conversations) {
    if (!conv.started_at) continue
    const weekInfo = getISOWeekKey(conv.started_at)
    if (!weekInfo) continue

    const group = weekGroups.get(weekInfo.key)
    if (group) {
      group.push(conv)
    } else {
      weekGroups.set(weekInfo.key, [conv])
    }
  }

  const result: WeeklyAgentMetrics[] = []
  for (const [week, weekConvs] of weekGroups) {
    const n = weekConvs.length

    const diversitySum = weekConvs.reduce((sum, c) => sum + convToolDiversity(c), 0)
    const planCount = weekConvs.filter(c => c.used_plan_mode).length
    const cacheSum = weekConvs.reduce((sum, c) => sum + c.cache_hit_rate, 0)
    const totalThinking = weekConvs.reduce((sum, c) => sum + c.thinking_count, 0)
    const totalAssistant = weekConvs.reduce((sum, c) => sum + c.assistant_message_count, 0)

    result.push({
      week,
      tool_diversity_index: roundRate(diversitySum / n),
      plan_mode_adoption_rate: roundRate(planCount / n),
      avg_cache_hit_rate: roundRate(cacheSum / n),
      thinking_utilization_rate: roundRate(totalAssistant > 0 ? totalThinking / totalAssistant : 0),
      conversation_count: n,
    })
  }

  result.sort((a, b) => a.week.localeCompare(b.week))
  return result
}
