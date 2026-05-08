import { computeAgentMetrics, computePerConversationMetrics, computeWeeklyAgentMetrics } from '../../src/agentMetrics'
import { ParsedConversation } from '../../src/conversation'

function makeConversation(overrides: Partial<ParsedConversation> = {}): ParsedConversation {
  return {
    id: 'conv-1',
    content_hash: '-home-test-project:2026-01-06T10:00:00Z:2:hello world',
    project: 'test-project',
    project_path_encoded: '-home-test-project',
    session_ids: ['sess-1'],
    started_at: '2026-01-06T10:00:00Z', // Monday of 2026-W02
    ended_at: '2026-01-06T11:00:00Z',
    user_prompts: ['hello world', 'fix the bug'],
    prompt_timestamps: ['2026-01-06T10:00:00Z', '2026-01-06T10:30:00Z'],
    prompt_count: 2,
    user_message_count: 2,
    assistant_message_count: 3,
    tool_use_count: 5,
    tools_used: ['Read', 'Edit', 'Bash'],
    commands_used: [],
    thinking_count: 1,
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
    edits_count: 0,
    reviewed_edits: 0,
    commits_count: 0,
    tested_commits: 0,
    review_before_accept_rate: 0,
    test_before_commit_rate: 0,
    total_input_tokens: 1000,
    total_output_tokens: 500,
    total_cache_creation_tokens: 200,
    total_cache_read_tokens: 800,
    total_tokens: 2500,
    tokens_per_prompt: 1250,
    cache_hit_rate: 0.4,
    compact_count: 0,
    compact_trigger_manual: 0,
    compact_trigger_auto: 0,
    turn_count: 0,
    total_turn_duration_ms: 0,
    avg_turn_duration_ms: null,
    local_command_count: 0,
    ...overrides,
  }
}

describe('computeAgentMetrics', () => {
  it('returns all zeros for empty array', () => {
    const result = computeAgentMetrics([])
    expect(result).toEqual({
      tool_diversity_index: 0,
      plan_mode_adoption_rate: 0,
      avg_cache_hit_rate: 0,
      thinking_utilization_rate: 0,
      command_adoption_rate: 0,
      avg_prompt_length: 0,
      conversation_count: 0,
    })
  })

  it('computes correct metrics for single conversation', () => {
    const conv = makeConversation()
    const result = computeAgentMetrics([conv])

    // tool_diversity_index = 3 unique / 5 uses = 0.6
    expect(result.tool_diversity_index).toBe(0.6)
    // plan_mode_adoption_rate = 0 / 1 = 0
    expect(result.plan_mode_adoption_rate).toBe(0)
    // avg_cache_hit_rate = 0.4
    expect(result.avg_cache_hit_rate).toBe(0.4)
    // thinking_utilization_rate = 1 / 3 = 0.3333
    expect(result.thinking_utilization_rate).toBe(0.3333)
    // avg_prompt_length = (11 + 11) / 2 = 11
    expect(result.avg_prompt_length).toBe(11)
    expect(result.conversation_count).toBe(1)
  })

  it('computes correct aggregation for multiple conversations', () => {
    const conv1 = makeConversation({
      id: 'conv-1',
      tool_use_count: 4,
      tools_used: ['Read', 'Edit'],       // diversity = 2/4 = 0.5
      thinking_count: 2,
      assistant_message_count: 4,
      cache_hit_rate: 0.6,
      user_prompts: ['hello'],            // length 5
      used_plan_mode: true,
    })
    const conv2 = makeConversation({
      id: 'conv-2',
      tool_use_count: 6,
      tools_used: ['Read', 'Edit', 'Bash'], // diversity = 3/6 = 0.5
      thinking_count: 1,
      assistant_message_count: 6,
      cache_hit_rate: 0.8,
      user_prompts: ['world!!'],          // length 7
      used_plan_mode: false,
    })

    const result = computeAgentMetrics([conv1, conv2])

    // tool_diversity_index = mean(0.5, 0.5) = 0.5
    expect(result.tool_diversity_index).toBe(0.5)
    // plan_mode_adoption_rate = 1/2 = 0.5
    expect(result.plan_mode_adoption_rate).toBe(0.5)
    // avg_cache_hit_rate = mean(0.6, 0.8) = 0.7
    expect(result.avg_cache_hit_rate).toBe(0.7)
    // thinking_utilization_rate = (2+1) / (4+6) = 3/10 = 0.3
    expect(result.thinking_utilization_rate).toBe(0.3)
    // avg_prompt_length = (5+7) / 2 = 6
    expect(result.avg_prompt_length).toBe(6)
    expect(result.conversation_count).toBe(2)
  })

  it('handles tool_use_count=0 without division by zero', () => {
    const conv = makeConversation({
      tool_use_count: 0,
      tools_used: [],
    })
    const result = computeAgentMetrics([conv])
    expect(result.tool_diversity_index).toBe(0)
  })

  it('handles assistant_message_count=0 without division by zero', () => {
    const conv = makeConversation({
      assistant_message_count: 0,
      thinking_count: 0,
    })
    const result = computeAgentMetrics([conv])
    expect(result.thinking_utilization_rate).toBe(0)
  })

  it('handles no user prompts', () => {
    const conv = makeConversation({
      user_prompts: [],
    })
    const result = computeAgentMetrics([conv])
    expect(result.avg_prompt_length).toBe(0)
  })

  it('returns adoption rate 1.0 when all use plan mode', () => {
    const conv1 = makeConversation({ id: 'c1', used_plan_mode: true })
    const conv2 = makeConversation({ id: 'c2', used_plan_mode: true })
    const result = computeAgentMetrics([conv1, conv2])
    expect(result.plan_mode_adoption_rate).toBe(1)
  })

  it('returns correct fraction for mixed plan mode', () => {
    const convs = [
      makeConversation({ id: 'c1', used_plan_mode: true }),
      makeConversation({ id: 'c2', used_plan_mode: false }),
      makeConversation({ id: 'c3', used_plan_mode: true }),
    ]
    const result = computeAgentMetrics(convs)
    expect(result.plan_mode_adoption_rate).toBe(0.6667)
  })

  it('rounds rates to 4 decimal places', () => {
    const conv = makeConversation({
      tool_use_count: 3,
      tools_used: ['Read'],
      thinking_count: 1,
      assistant_message_count: 3,
      cache_hit_rate: 0.33333,
    })
    const result = computeAgentMetrics([conv])
    // tool_diversity = 1/3 = 0.3333
    expect(result.tool_diversity_index).toBe(0.3333)
    expect(result.thinking_utilization_rate).toBe(0.3333)
    expect(result.avg_cache_hit_rate).toBe(0.3333)
  })

  it('rounds avg_prompt_length to nearest integer', () => {
    const conv = makeConversation({
      user_prompts: ['hi', 'hey'],  // lengths 2, 3 -> avg 2.5 -> 3
    })
    const result = computeAgentMetrics([conv])
    expect(result.avg_prompt_length).toBe(3)
  })
})

describe('computePerConversationMetrics', () => {
  it('returns empty array for empty input', () => {
    expect(computePerConversationMetrics([])).toEqual([])
  })

  it('returns array same length as input', () => {
    const convs = [
      makeConversation({ id: 'c1' }),
      makeConversation({ id: 'c2' }),
    ]
    const result = computePerConversationMetrics(convs)
    expect(result).toHaveLength(2)
  })

  it('returns correct id and per-conv metrics', () => {
    const conv = makeConversation({
      id: 'conv-abc',
      tool_use_count: 10,
      tools_used: ['Read', 'Edit'],       // diversity = 2/10 = 0.2
      thinking_count: 2,
      assistant_message_count: 5,          // thinking rate = 2/5 = 0.4
      user_prompts: ['short', 'longer prompt'], // lengths 5, 13 -> avg 9
    })
    const result = computePerConversationMetrics([conv])
    expect(result[0].id).toBe('conv-abc')
    expect(result[0].tool_diversity_index).toBe(0.2)
    expect(result[0].thinking_utilization_rate).toBe(0.4)
    expect(result[0].avg_prompt_length).toBe(9)
  })

  it('handles edge case with zero tool uses', () => {
    const conv = makeConversation({
      tool_use_count: 0,
      tools_used: [],
    })
    const result = computePerConversationMetrics([conv])
    expect(result[0].tool_diversity_index).toBe(0)
  })

  it('handles edge case with zero assistant messages', () => {
    const conv = makeConversation({
      assistant_message_count: 0,
      thinking_count: 0,
    })
    const result = computePerConversationMetrics([conv])
    expect(result[0].thinking_utilization_rate).toBe(0)
  })
})

describe('computeWeeklyAgentMetrics', () => {
  it('returns empty array for empty input', () => {
    expect(computeWeeklyAgentMetrics([])).toEqual([])
  })

  it('groups conversations in the same week into single entry', () => {
    const conv1 = makeConversation({
      id: 'c1',
      started_at: '2026-01-06T10:00:00Z', // 2026-W02 Monday
      used_plan_mode: true,
      tool_use_count: 4,
      tools_used: ['Read', 'Edit'],
      thinking_count: 1,
      assistant_message_count: 2,
      cache_hit_rate: 0.5,
    })
    const conv2 = makeConversation({
      id: 'c2',
      started_at: '2026-01-07T14:00:00Z', // 2026-W02 Tuesday
      used_plan_mode: false,
      tool_use_count: 6,
      tools_used: ['Read', 'Edit', 'Bash'],
      thinking_count: 3,
      assistant_message_count: 4,
      cache_hit_rate: 0.7,
    })
    const result = computeWeeklyAgentMetrics([conv1, conv2])
    expect(result).toHaveLength(1)
    expect(result[0].week).toBe('2026-W02')
    expect(result[0].conversation_count).toBe(2)
    // tool_diversity: mean(2/4, 3/6) = mean(0.5, 0.5) = 0.5
    expect(result[0].tool_diversity_index).toBe(0.5)
    // plan: 1/2 = 0.5
    expect(result[0].plan_mode_adoption_rate).toBe(0.5)
    // cache: mean(0.5, 0.7) = 0.6
    expect(result[0].avg_cache_hit_rate).toBe(0.6)
    // thinking: (1+3) / (2+4) = 4/6 = 0.6667
    expect(result[0].thinking_utilization_rate).toBe(0.6667)
  })

  it('groups conversations in different weeks into multiple sorted entries', () => {
    const conv1 = makeConversation({
      id: 'c1',
      started_at: '2026-01-13T10:00:00Z', // 2026-W03
    })
    const conv2 = makeConversation({
      id: 'c2',
      started_at: '2026-01-06T10:00:00Z', // 2026-W02
    })
    const result = computeWeeklyAgentMetrics([conv1, conv2])
    expect(result).toHaveLength(2)
    // Sorted ascending
    expect(result[0].week).toBe('2026-W02')
    expect(result[1].week).toBe('2026-W03')
  })

  it('uses ISO week format YYYY-Www', () => {
    const conv = makeConversation({
      started_at: '2026-01-06T10:00:00Z', // 2026-W02
    })
    const result = computeWeeklyAgentMetrics([conv])
    expect(result[0].week).toMatch(/^\d{4}-W\d{2}$/)
  })

  it('skips conversations with null started_at', () => {
    const conv = makeConversation({ started_at: null })
    const result = computeWeeklyAgentMetrics([conv])
    expect(result).toHaveLength(0)
  })
})
