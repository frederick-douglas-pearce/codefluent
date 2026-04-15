import { TimestampedMessage } from './parser'
import { ParsedConversation } from './conversation'

/** Max messages to scan forward from an error looking for resolution. */
const MAX_RECOVERY_WINDOW = 20

export type RecoveryStrategy = 'retry_same_tool' | 'switch_tool' | 'user_intervention'

export interface ConversationErrorRecovery {
  error_count: number
  recovery_count: number
  avg_failure_to_resolution_turns: number | null
  recovery_strategy_diversity: number  // unique strategies / recovery_count, 0-1
  error_tools: string[]
}

export interface AggregateErrorRecovery {
  total_error_count: number
  total_recovery_count: number
  recovery_rate: number                  // recovery_count / error_count, 0-1
  avg_failure_to_resolution_turns: number | null
  conversations_with_errors: number
  conversation_count: number
  insufficient_data: boolean             // true when conversations_with_errors < 5
}

export interface WeeklyErrorRecovery {
  week: string
  error_count: number
  recovery_rate: number
  conversations_with_errors: number
  conversation_count: number
}

function roundRate(x: number): number {
  return Math.round(x * 10000) / 10000
}

/** Get ISO week key from a timestamp string. Returns null on invalid input. */
function isoWeekKey(timestamp: string): string | null {
  const d = new Date(timestamp)
  if (isNaN(d.getTime())) return null
  // ISO week calculation: Thursday-based ISO 8601 weeks
  const jan4 = new Date(d.getFullYear(), 0, 4)
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000) + 1
  const dayOfWeek = d.getDay() || 7 // Mon=1..Sun=7
  const weekNum = Math.ceil((dayOfYear - dayOfWeek + 10) / 7)
  // Handle year boundaries
  let year = d.getFullYear()
  if (weekNum < 1) {
    year--
    return `${year}-W52`
  }
  if (weekNum > 52) {
    const dec31 = new Date(year, 11, 31)
    const dec31Day = dec31.getDay() || 7
    if (dec31Day < 4) {
      return `${year + 1}-W01`
    }
  }
  return `${year}-W${String(weekNum).padStart(2, '0')}`
}

/**
 * Analyze a single conversation's message stream for error-recovery patterns.
 *
 * Algorithm:
 * 1. Build tool_use_id -> tool_name map from assistant messages
 * 2. Find tool_result messages with is_error === true
 * 3. For each error, scan forward (max 20 msgs) for a successful tool_result
 * 4. Categorize recovery strategy: retry_same_tool, switch_tool, user_intervention
 */
export function computeConversationErrorRecovery(
  messages: TimestampedMessage[],
): ConversationErrorRecovery {
  // Build tool_use_id -> tool_name map from assistant messages
  const toolUseIdToName = new Map<string, string>()
  for (const msg of messages) {
    if (msg.type === 'assistant' && msg.tool_use_ids && msg.tool_names) {
      for (let j = 0; j < msg.tool_use_ids.length; j++) {
        const id = msg.tool_use_ids[j]
        const name = msg.tool_names[j]
        if (id && name) toolUseIdToName.set(id, name)
      }
    }
  }

  // Find errors and their resolutions
  const errorTools = new Set<string>()
  const strategies = new Set<RecoveryStrategy>()
  let errorCount = 0
  let recoveryCount = 0
  const resolutionTurns: number[] = []

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.type !== 'tool_result' || !msg.is_error) continue

    errorCount++
    const errorToolName = msg.tool_use_id ? toolUseIdToName.get(msg.tool_use_id) : undefined
    if (errorToolName) errorTools.add(errorToolName)

    // Scan forward for resolution
    let hasUserIntervention = false
    const limit = Math.min(i + MAX_RECOVERY_WINDOW + 1, messages.length)
    for (let j = i + 1; j < limit; j++) {
      const next = messages[j]
      if (next.type === 'user' && next.content) {
        hasUserIntervention = true
      }
      if (next.type === 'tool_result' && !next.is_error) {
        // Resolution found
        recoveryCount++
        resolutionTurns.push(j - i)

        // Categorize strategy
        const resolutionToolName = next.tool_use_id
          ? toolUseIdToName.get(next.tool_use_id)
          : undefined
        let strategy: RecoveryStrategy
        if (hasUserIntervention) {
          strategy = 'user_intervention'
        } else if (errorToolName && resolutionToolName && errorToolName === resolutionToolName) {
          strategy = 'retry_same_tool'
        } else {
          strategy = 'switch_tool'
        }
        strategies.add(strategy)
        break
      }
    }
  }

  const avgTurns = resolutionTurns.length > 0
    ? resolutionTurns.reduce((sum, t) => sum + t, 0) / resolutionTurns.length
    : null
  const diversity = recoveryCount > 0 ? strategies.size / recoveryCount : 0

  return {
    error_count: errorCount,
    recovery_count: recoveryCount,
    avg_failure_to_resolution_turns: avgTurns !== null ? roundRate(avgTurns) : null,
    recovery_strategy_diversity: roundRate(diversity),
    error_tools: Array.from(errorTools).sort(),
  }
}

/**
 * Compute aggregate error recovery metrics across all conversations.
 * Returns insufficient_data: true when fewer than 5 conversations have errors.
 */
export function computeErrorRecoveryMetrics(
  conversations: ParsedConversation[],
): AggregateErrorRecovery {
  if (conversations.length === 0) {
    return {
      total_error_count: 0,
      total_recovery_count: 0,
      recovery_rate: 0,
      avg_failure_to_resolution_turns: null,
      conversations_with_errors: 0,
      conversation_count: 0,
      insufficient_data: true,
    }
  }

  let totalErrors = 0
  let totalRecoveries = 0
  let convsWithErrors = 0
  const turnsValues: number[] = []

  for (const conv of conversations) {
    totalErrors += conv.error_count
    totalRecoveries += conv.recovery_count
    if (conv.error_count > 0) {
      convsWithErrors++
      if (conv.avg_failure_to_resolution_turns !== null) {
        turnsValues.push(conv.avg_failure_to_resolution_turns)
      }
    }
  }

  const recoveryRate = totalErrors > 0 ? totalRecoveries / totalErrors : 0
  const avgTurns = turnsValues.length > 0
    ? turnsValues.reduce((sum, t) => sum + t, 0) / turnsValues.length
    : null

  return {
    total_error_count: totalErrors,
    total_recovery_count: totalRecoveries,
    recovery_rate: roundRate(recoveryRate),
    avg_failure_to_resolution_turns: avgTurns !== null ? roundRate(avgTurns) : null,
    conversations_with_errors: convsWithErrors,
    conversation_count: conversations.length,
    insufficient_data: convsWithErrors < 5,
  }
}

/**
 * Compute weekly error recovery breakdown.
 */
export function computeWeeklyErrorRecovery(
  conversations: ParsedConversation[],
): WeeklyErrorRecovery[] {
  if (conversations.length === 0) return []

  const weekGroups = new Map<string, ParsedConversation[]>()

  for (const conv of conversations) {
    if (!conv.started_at) continue
    const week = isoWeekKey(conv.started_at)
    if (!week) continue

    const group = weekGroups.get(week)
    if (group) {
      group.push(conv)
    } else {
      weekGroups.set(week, [conv])
    }
  }

  const result: WeeklyErrorRecovery[] = []
  for (const [week, weekConvs] of weekGroups) {
    const totalErrors = weekConvs.reduce((sum, c) => sum + c.error_count, 0)
    const totalRecoveries = weekConvs.reduce((sum, c) => sum + c.recovery_count, 0)
    const convsWithErrors = weekConvs.filter(c => c.error_count > 0).length

    result.push({
      week,
      error_count: totalErrors,
      recovery_rate: totalErrors > 0 ? roundRate(totalRecoveries / totalErrors) : 0,
      conversations_with_errors: convsWithErrors,
      conversation_count: weekConvs.length,
    })
  }

  result.sort((a, b) => a.week.localeCompare(b.week))
  return result
}
