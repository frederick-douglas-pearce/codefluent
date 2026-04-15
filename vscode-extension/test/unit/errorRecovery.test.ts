import {
  computeConversationErrorRecovery,
  computeErrorRecoveryMetrics,
  computeWeeklyErrorRecovery,
} from '../../src/errorRecovery'
import { TimestampedMessage } from '../../src/parser'
import { ParsedConversation } from '../../src/conversation'

function makeMessage(overrides: Partial<TimestampedMessage> = {}): TimestampedMessage {
  return {
    type: 'user',
    timestamp: '2026-01-06T10:00:00Z',
    session_id: 'sess-1',
    file_position: 0,
    ...overrides,
  }
}

function makeConversation(overrides: Partial<ParsedConversation> = {}): ParsedConversation {
  return {
    id: 'conv-1',
    content_hash: 'hash',
    project: 'test-project',
    project_path_encoded: '-home-test',
    session_ids: ['sess-1'],
    started_at: '2026-01-06T10:00:00Z',
    ended_at: '2026-01-06T11:00:00Z',
    user_prompts: ['hello'],
    prompt_timestamps: ['2026-01-06T10:00:00Z'],
    prompt_count: 1,
    user_message_count: 1,
    assistant_message_count: 1,
    tool_use_count: 1,
    tools_used: ['Bash'],
    commands_used: [],
    thinking_count: 0,
    used_plan_mode: false,
    model: 'claude-sonnet-4-20250514',
    claude_code_version: '2.1.44',
    git_branch: 'main',
    heuristic_task_type: null,
    has_structured_output_antipattern: false,
    structured_output_antipattern_count: 0,
    error_count: 0,
    recovery_count: 0,
    avg_failure_to_resolution_turns: null,
    recovery_strategy_diversity: 0,
    error_tools: [],
    total_input_tokens: 1000,
    total_output_tokens: 500,
    total_cache_creation_tokens: 200,
    total_cache_read_tokens: 800,
    total_tokens: 2500,
    tokens_per_prompt: 1250,
    cache_hit_rate: 0.4,
    ...overrides,
  }
}

describe('computeConversationErrorRecovery', () => {
  it('returns zeros for empty message list', () => {
    const result = computeConversationErrorRecovery([])
    expect(result.error_count).toBe(0)
    expect(result.recovery_count).toBe(0)
    expect(result.avg_failure_to_resolution_turns).toBeNull()
    expect(result.recovery_strategy_diversity).toBe(0)
    expect(result.error_tools).toEqual([])
  })

  it('returns zeros when no tool_result messages present', () => {
    const messages = [
      makeMessage({ type: 'user', content: 'fix the bug' }),
      makeMessage({ type: 'assistant', tool_names: ['Bash'], tool_use_ids: ['tu-1'] }),
    ]
    const result = computeConversationErrorRecovery(messages)
    expect(result.error_count).toBe(0)
    expect(result.recovery_count).toBe(0)
  })

  it('detects a single error with no recovery', () => {
    const messages = [
      makeMessage({ type: 'assistant', tool_names: ['Bash'], tool_use_ids: ['tu-1'] }),
      makeMessage({ type: 'tool_result', is_error: true, tool_use_id: 'tu-1', error_content: 'Exit code 1' }),
    ]
    const result = computeConversationErrorRecovery(messages)
    expect(result.error_count).toBe(1)
    expect(result.recovery_count).toBe(0)
    expect(result.avg_failure_to_resolution_turns).toBeNull()
    expect(result.error_tools).toEqual(['Bash'])
  })

  it('detects error followed by recovery (retry_same_tool)', () => {
    const messages = [
      makeMessage({ type: 'assistant', tool_names: ['Bash'], tool_use_ids: ['tu-1'] }),
      makeMessage({ type: 'tool_result', is_error: true, tool_use_id: 'tu-1', error_content: 'Exit code 1' }),
      makeMessage({ type: 'assistant', tool_names: ['Bash'], tool_use_ids: ['tu-2'] }),
      makeMessage({ type: 'tool_result', tool_use_id: 'tu-2' }),
    ]
    const result = computeConversationErrorRecovery(messages)
    expect(result.error_count).toBe(1)
    expect(result.recovery_count).toBe(1)
    expect(result.avg_failure_to_resolution_turns).toBe(2) // index 3 - index 1 = 2
    expect(result.error_tools).toEqual(['Bash'])
  })

  it('detects recovery with switch_tool strategy', () => {
    const messages = [
      makeMessage({ type: 'assistant', tool_names: ['Edit'], tool_use_ids: ['tu-1'] }),
      makeMessage({ type: 'tool_result', is_error: true, tool_use_id: 'tu-1', error_content: 'File not read' }),
      makeMessage({ type: 'assistant', tool_names: ['Read'], tool_use_ids: ['tu-2'] }),
      makeMessage({ type: 'tool_result', tool_use_id: 'tu-2' }),
    ]
    const result = computeConversationErrorRecovery(messages)
    expect(result.error_count).toBe(1)
    expect(result.recovery_count).toBe(1)
    expect(result.recovery_strategy_diversity).toBe(1) // 1 unique strategy / 1 recovery
  })

  it('detects user_intervention strategy when user message appears between error and resolution', () => {
    const messages = [
      makeMessage({ type: 'assistant', tool_names: ['Bash'], tool_use_ids: ['tu-1'] }),
      makeMessage({ type: 'tool_result', is_error: true, tool_use_id: 'tu-1' }),
      makeMessage({ type: 'user', content: 'try a different approach' }),
      makeMessage({ type: 'assistant', tool_names: ['Bash'], tool_use_ids: ['tu-2'] }),
      makeMessage({ type: 'tool_result', tool_use_id: 'tu-2' }),
    ]
    const result = computeConversationErrorRecovery(messages)
    expect(result.error_count).toBe(1)
    expect(result.recovery_count).toBe(1)
    expect(result.avg_failure_to_resolution_turns).toBe(3) // index 4 - index 1 = 3
  })

  it('handles multiple errors with mixed recovery', () => {
    const messages = [
      makeMessage({ type: 'assistant', tool_names: ['Bash'], tool_use_ids: ['tu-1'] }),
      makeMessage({ type: 'tool_result', is_error: true, tool_use_id: 'tu-1' }),
      makeMessage({ type: 'assistant', tool_names: ['Bash'], tool_use_ids: ['tu-2'] }),
      makeMessage({ type: 'tool_result', tool_use_id: 'tu-2' }),
      makeMessage({ type: 'assistant', tool_names: ['Edit'], tool_use_ids: ['tu-3'] }),
      makeMessage({ type: 'tool_result', is_error: true, tool_use_id: 'tu-3' }),
      // No recovery for the second error
    ]
    const result = computeConversationErrorRecovery(messages)
    expect(result.error_count).toBe(2)
    expect(result.recovery_count).toBe(1)
    expect(result.error_tools).toEqual(['Bash', 'Edit'])
  })

  it('computes diversity across multiple strategies', () => {
    const messages = [
      // Error 1: retry_same_tool
      makeMessage({ type: 'assistant', tool_names: ['Bash'], tool_use_ids: ['tu-1'] }),
      makeMessage({ type: 'tool_result', is_error: true, tool_use_id: 'tu-1' }),
      makeMessage({ type: 'assistant', tool_names: ['Bash'], tool_use_ids: ['tu-2'] }),
      makeMessage({ type: 'tool_result', tool_use_id: 'tu-2' }),
      // Error 2: switch_tool
      makeMessage({ type: 'assistant', tool_names: ['Edit'], tool_use_ids: ['tu-3'] }),
      makeMessage({ type: 'tool_result', is_error: true, tool_use_id: 'tu-3' }),
      makeMessage({ type: 'assistant', tool_names: ['Read'], tool_use_ids: ['tu-4'] }),
      makeMessage({ type: 'tool_result', tool_use_id: 'tu-4' }),
    ]
    const result = computeConversationErrorRecovery(messages)
    expect(result.error_count).toBe(2)
    expect(result.recovery_count).toBe(2)
    expect(result.recovery_strategy_diversity).toBe(1) // 2 unique / 2 recoveries = 1
  })

  it('does not scan beyond MAX_RECOVERY_WINDOW', () => {
    // Create an error followed by 21 non-result messages, then a success
    const messages: TimestampedMessage[] = [
      makeMessage({ type: 'assistant', tool_names: ['Bash'], tool_use_ids: ['tu-1'] }),
      makeMessage({ type: 'tool_result', is_error: true, tool_use_id: 'tu-1' }),
    ]
    // Add 21 assistant messages (beyond window)
    for (let k = 0; k < 21; k++) {
      messages.push(makeMessage({ type: 'assistant', file_position: k + 2 }))
    }
    messages.push(makeMessage({ type: 'tool_result', tool_use_id: 'tu-1' }))

    const result = computeConversationErrorRecovery(messages)
    expect(result.error_count).toBe(1)
    expect(result.recovery_count).toBe(0) // Beyond window
  })

  it('handles error without tool_use_id linkage', () => {
    const messages = [
      makeMessage({ type: 'tool_result', is_error: true, error_content: 'unknown error' }),
      makeMessage({ type: 'tool_result' }),
    ]
    const result = computeConversationErrorRecovery(messages)
    expect(result.error_count).toBe(1)
    expect(result.recovery_count).toBe(1)
    expect(result.error_tools).toEqual([]) // No tool name resolved
  })
})

describe('computeErrorRecoveryMetrics', () => {
  it('returns empty result for no conversations', () => {
    const result = computeErrorRecoveryMetrics([])
    expect(result.total_error_count).toBe(0)
    expect(result.total_recovery_count).toBe(0)
    expect(result.recovery_rate).toBe(0)
    expect(result.avg_failure_to_resolution_turns).toBeNull()
    expect(result.conversations_with_errors).toBe(0)
    expect(result.conversation_count).toBe(0)
    expect(result.insufficient_data).toBe(true)
  })

  it('aggregates across conversations', () => {
    const convs = [
      makeConversation({ error_count: 3, recovery_count: 2, avg_failure_to_resolution_turns: 2.5 }),
      makeConversation({ id: 'conv-2', error_count: 1, recovery_count: 1, avg_failure_to_resolution_turns: 4.0 }),
      makeConversation({ id: 'conv-3', error_count: 0, recovery_count: 0 }),
    ]
    const result = computeErrorRecoveryMetrics(convs)
    expect(result.total_error_count).toBe(4)
    expect(result.total_recovery_count).toBe(3)
    expect(result.recovery_rate).toBe(0.75)
    expect(result.conversations_with_errors).toBe(2)
    expect(result.conversation_count).toBe(3)
    expect(result.insufficient_data).toBe(true) // < 5 conversations with errors
  })

  it('returns insufficient_data false when >= 5 conversations have errors', () => {
    const convs = Array.from({ length: 5 }, (_, i) =>
      makeConversation({ id: `conv-${i}`, error_count: 1, recovery_count: 1, avg_failure_to_resolution_turns: 2.0 }),
    )
    const result = computeErrorRecoveryMetrics(convs)
    expect(result.insufficient_data).toBe(false)
    expect(result.conversations_with_errors).toBe(5)
  })

  it('handles zero errors without division by zero', () => {
    const convs = [makeConversation()]
    const result = computeErrorRecoveryMetrics(convs)
    expect(result.recovery_rate).toBe(0)
    expect(result.avg_failure_to_resolution_turns).toBeNull()
  })
})

describe('computeWeeklyErrorRecovery', () => {
  it('returns empty for no conversations', () => {
    const result = computeWeeklyErrorRecovery([])
    expect(result).toEqual([])
  })

  it('groups conversations by ISO week', () => {
    const convs = [
      makeConversation({ started_at: '2026-01-06T10:00:00Z', error_count: 2, recovery_count: 1 }),
      makeConversation({ id: 'conv-2', started_at: '2026-01-07T10:00:00Z', error_count: 1, recovery_count: 1 }),
      makeConversation({ id: 'conv-3', started_at: '2026-01-13T10:00:00Z', error_count: 3, recovery_count: 2 }),
    ]
    const result = computeWeeklyErrorRecovery(convs)
    expect(result).toHaveLength(2)
    expect(result[0].week).toBe('2026-W02')
    expect(result[0].error_count).toBe(3)
    expect(result[0].conversations_with_errors).toBe(2)
    expect(result[1].week).toBe('2026-W03')
    expect(result[1].error_count).toBe(3)
  })

  it('sorts by week ascending', () => {
    const convs = [
      makeConversation({ id: 'conv-2', started_at: '2026-02-01T10:00:00Z', error_count: 1 }),
      makeConversation({ started_at: '2026-01-06T10:00:00Z', error_count: 1 }),
    ]
    const result = computeWeeklyErrorRecovery(convs)
    expect(result[0].week).toBe('2026-W02')
  })

  it('skips conversations without started_at', () => {
    const convs = [
      makeConversation({ started_at: null, error_count: 1 }),
    ]
    const result = computeWeeklyErrorRecovery(convs)
    expect(result).toEqual([])
  })
})
