import { computeWeeklyTokenAggregation, computeSessionEfficiency, joinSessionsWithScores, buildSessionAnalytics } from '../../src/analytics'
import { ParsedSession } from '../../src/parser'
import { ScoreResult, SCORING_PROMPT_VERSION } from '../../src/scoring'

function makeSession(overrides: Partial<ParsedSession> = {}): ParsedSession {
  return {
    id: 'sess-1',
    project: 'test-project',
    project_path_encoded: '-home-test-project',
    started_at: '2026-01-06T10:00:00Z', // Monday of 2026-W02
    ended_at: '2026-01-06T11:00:00Z',
    user_prompts: ['hello', 'world'],
    user_message_count: 2,
    assistant_message_count: 2,
    tool_use_count: 3,
    tools_used: ['Read', 'Edit'],
    thinking_count: 0,
    used_plan_mode: false,
    model: 'claude-sonnet-4-20250514',
    claude_code_version: '2.1.44',
    git_branch: 'main',
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

function makeScoreResult(overrides: Partial<ScoreResult> = {}): ScoreResult {
  return {
    session_id: 'sess-1',
    fluency_behaviors: {
      iteration_and_refinement: true,
      clarifying_goals: true,
      specifying_format: false,
      providing_examples: false,
      setting_interaction_terms: false,
      checking_facts: false,
      questioning_reasoning: false,
      identifying_missing_context: false,
      adjusting_approach: false,
      building_on_responses: false,
      providing_feedback: false,
    },
    overall_score: 65,
    coding_pattern: 'hybrid_code_explanation',
    coding_pattern_quality: 'high',
    one_line_summary: 'Solid session.',
    prompt_version: SCORING_PROMPT_VERSION,
    ...overrides,
  }
}

// --- computeWeeklyTokenAggregation ---

describe('computeWeeklyTokenAggregation', () => {
  it('returns empty array for empty sessions', () => {
    expect(computeWeeklyTokenAggregation([])).toEqual([])
  })

  it('groups a single session into one week', () => {
    const sessions = [makeSession()]
    const result = computeWeeklyTokenAggregation(sessions)

    expect(result).toHaveLength(1)
    expect(result[0].week).toBe('2026-W02')
    expect(result[0].total_tokens).toBe(2500)
    expect(result[0].avg_tokens_per_session).toBe(2500)
    expect(result[0].avg_cache_hit_rate).toBe(0.4)
    expect(result[0].session_count).toBe(1)
  })

  it('groups multiple sessions in the same week', () => {
    const sessions = [
      makeSession({ id: 's1', started_at: '2026-01-06T10:00:00Z', total_tokens: 2000, cache_hit_rate: 0.3 }),
      makeSession({ id: 's2', started_at: '2026-01-08T10:00:00Z', total_tokens: 4000, cache_hit_rate: 0.5 }),
    ]
    const result = computeWeeklyTokenAggregation(sessions)

    expect(result).toHaveLength(1)
    expect(result[0].total_tokens).toBe(6000)
    expect(result[0].avg_tokens_per_session).toBe(3000)
    expect(result[0].avg_cache_hit_rate).toBe(0.4)
    expect(result[0].session_count).toBe(2)
  })

  it('separates sessions in different weeks', () => {
    const sessions = [
      makeSession({ id: 's1', started_at: '2026-01-06T10:00:00Z', total_tokens: 1000 }),
      makeSession({ id: 's2', started_at: '2026-01-13T10:00:00Z', total_tokens: 3000 }),
    ]
    const result = computeWeeklyTokenAggregation(sessions)

    expect(result).toHaveLength(2)
    expect(result[0].week).toBe('2026-W02')
    expect(result[0].total_tokens).toBe(1000)
    expect(result[1].week).toBe('2026-W03')
    expect(result[1].total_tokens).toBe(3000)
  })

  it('sorts weeks chronologically', () => {
    const sessions = [
      makeSession({ id: 's2', started_at: '2026-01-13T10:00:00Z' }),
      makeSession({ id: 's1', started_at: '2026-01-06T10:00:00Z' }),
    ]
    const result = computeWeeklyTokenAggregation(sessions)

    expect(result[0].week).toBe('2026-W02')
    expect(result[1].week).toBe('2026-W03')
  })

  it('skips sessions with null started_at', () => {
    const sessions = [
      makeSession({ id: 's1', started_at: null }),
      makeSession({ id: 's2', started_at: '2026-01-06T10:00:00Z' }),
    ]
    const result = computeWeeklyTokenAggregation(sessions)

    expect(result).toHaveLength(1)
    expect(result[0].session_count).toBe(1)
  })

  it('skips sessions with invalid dates', () => {
    const sessions = [
      makeSession({ id: 's1', started_at: 'not-a-date' }),
      makeSession({ id: 's2', started_at: '2026-01-06T10:00:00Z' }),
    ]
    const result = computeWeeklyTokenAggregation(sessions)

    expect(result).toHaveLength(1)
  })

  it('handles sessions spanning multiple weeks correctly', () => {
    const sessions = [
      makeSession({ id: 's1', started_at: '2026-01-06T10:00:00Z', total_tokens: 100 }),
      makeSession({ id: 's2', started_at: '2026-01-07T10:00:00Z', total_tokens: 200 }),
      makeSession({ id: 's3', started_at: '2026-01-13T10:00:00Z', total_tokens: 300 }),
      makeSession({ id: 's4', started_at: '2026-01-20T10:00:00Z', total_tokens: 400 }),
    ]
    const result = computeWeeklyTokenAggregation(sessions)

    expect(result).toHaveLength(3)
    expect(result[0]).toEqual(expect.objectContaining({ week: '2026-W02', total_tokens: 300, session_count: 2 }))
    expect(result[1]).toEqual(expect.objectContaining({ week: '2026-W03', total_tokens: 300, session_count: 1 }))
    expect(result[2]).toEqual(expect.objectContaining({ week: '2026-W04', total_tokens: 400, session_count: 1 }))
  })
})

// --- computeSessionEfficiency ---

describe('computeSessionEfficiency', () => {
  it('returns zeros for empty sessions', () => {
    const result = computeSessionEfficiency([])

    expect(result).toEqual({
      avg_tokens_per_prompt: 0,
      avg_cache_hit_rate: 0,
      total_tokens: 0,
      total_sessions: 0,
      most_efficient_session: null,
    })
  })

  it('computes metrics for a single session', () => {
    const sessions = [makeSession({ tokens_per_prompt: 1250, cache_hit_rate: 0.4, total_tokens: 2500 })]
    const result = computeSessionEfficiency(sessions)

    expect(result.avg_tokens_per_prompt).toBe(1250)
    expect(result.avg_cache_hit_rate).toBe(0.4)
    expect(result.total_tokens).toBe(2500)
    expect(result.total_sessions).toBe(1)
    expect(result.most_efficient_session).toEqual({ id: 'sess-1', tokens_per_prompt: 1250 })
  })

  it('averages across multiple sessions', () => {
    const sessions = [
      makeSession({ id: 's1', tokens_per_prompt: 1000, cache_hit_rate: 0.3, total_tokens: 2000 }),
      makeSession({ id: 's2', tokens_per_prompt: 2000, cache_hit_rate: 0.5, total_tokens: 4000 }),
    ]
    const result = computeSessionEfficiency(sessions)

    expect(result.avg_tokens_per_prompt).toBe(1500)
    expect(result.avg_cache_hit_rate).toBe(0.4)
    expect(result.total_tokens).toBe(6000)
    expect(result.total_sessions).toBe(2)
  })

  it('finds the most efficient session (lowest tokens_per_prompt)', () => {
    const sessions = [
      makeSession({ id: 's1', tokens_per_prompt: 2000, total_tokens: 4000, user_message_count: 2 }),
      makeSession({ id: 's2', tokens_per_prompt: 500, total_tokens: 1000, user_message_count: 2 }),
      makeSession({ id: 's3', tokens_per_prompt: 1500, total_tokens: 3000, user_message_count: 2 }),
    ]
    const result = computeSessionEfficiency(sessions)

    expect(result.most_efficient_session).toEqual({ id: 's2', tokens_per_prompt: 500 })
  })

  it('excludes sessions with zero prompts from most efficient', () => {
    const sessions = [
      makeSession({ id: 's1', tokens_per_prompt: 0, total_tokens: 0, user_message_count: 0 }),
      makeSession({ id: 's2', tokens_per_prompt: 1000, total_tokens: 2000, user_message_count: 2 }),
    ]
    const result = computeSessionEfficiency(sessions)

    expect(result.most_efficient_session).toEqual({ id: 's2', tokens_per_prompt: 1000 })
  })

  it('excludes sessions with zero tokens from most efficient', () => {
    const sessions = [
      makeSession({ id: 's1', tokens_per_prompt: 0, total_tokens: 0, user_message_count: 2 }),
      makeSession({ id: 's2', tokens_per_prompt: 1000, total_tokens: 2000, user_message_count: 2 }),
    ]
    const result = computeSessionEfficiency(sessions)

    expect(result.most_efficient_session).toEqual({ id: 's2', tokens_per_prompt: 1000 })
  })

  it('returns null most_efficient when no sessions have tokens', () => {
    const sessions = [
      makeSession({ id: 's1', tokens_per_prompt: 0, total_tokens: 0, user_message_count: 0 }),
    ]
    const result = computeSessionEfficiency(sessions)

    expect(result.most_efficient_session).toBeNull()
  })

  it('rounds tokens_per_prompt in most_efficient_session', () => {
    const sessions = [
      makeSession({ id: 's1', tokens_per_prompt: 1333.3333, total_tokens: 4000, user_message_count: 3 }),
    ]
    const result = computeSessionEfficiency(sessions)

    expect(result.most_efficient_session?.tokens_per_prompt).toBe(1333)
  })
})

// --- joinSessionsWithScores ---

describe('joinSessionsWithScores', () => {
  it('returns sessions with null scores when no scores exist', () => {
    const sessions = [makeSession({ id: 's1' }), makeSession({ id: 's2' })]
    const result = joinSessionsWithScores(sessions, [])

    expect(result).toHaveLength(2)
    expect(result[0].overall_score).toBeNull()
    expect(result[1].overall_score).toBeNull()
  })

  it('enriches sessions with matching scores', () => {
    const sessions = [makeSession({ id: 's1' }), makeSession({ id: 's2' })]
    const scores = [
      makeScoreResult({ session_id: 's1', overall_score: 80 }),
      makeScoreResult({ session_id: 's2', overall_score: 60 }),
    ]
    const result = joinSessionsWithScores(sessions, scores)

    expect(result[0].overall_score).toBe(80)
    expect(result[1].overall_score).toBe(60)
  })

  it('returns null for sessions without matching scores', () => {
    const sessions = [makeSession({ id: 's1' }), makeSession({ id: 's2' })]
    const scores = [makeScoreResult({ session_id: 's1', overall_score: 75 })]
    const result = joinSessionsWithScores(sessions, scores)

    expect(result[0].overall_score).toBe(75)
    expect(result[1].overall_score).toBeNull()
  })

  it('handles empty sessions list', () => {
    const result = joinSessionsWithScores([], [makeScoreResult()])

    expect(result).toEqual([])
  })

  it('handles scores with errors (no overall_score)', () => {
    const sessions = [makeSession({ id: 's1' })]
    const scores: ScoreResult[] = [{ session_id: 's1', error: 'API error' }]
    const result = joinSessionsWithScores(sessions, scores)

    expect(result[0].overall_score).toBeNull()
  })

  it('preserves all session fields in enriched output', () => {
    const session = makeSession({ id: 's1', project: 'my-proj', total_tokens: 5000 })
    const scores = [makeScoreResult({ session_id: 's1', overall_score: 90 })]
    const result = joinSessionsWithScores([session], scores)

    expect(result[0].id).toBe('s1')
    expect(result[0].project).toBe('my-proj')
    expect(result[0].total_tokens).toBe(5000)
    expect(result[0].overall_score).toBe(90)
  })
})

// --- buildSessionAnalytics ---

describe('buildSessionAnalytics', () => {
  it('returns empty structure for empty inputs', () => {
    const result = buildSessionAnalytics([], [])

    expect(result.sessions).toEqual([])
    expect(result.aggregates).toEqual({
      avg_tokens_per_session: 0,
      avg_tokens_per_prompt: 0,
      avg_cache_hit_rate: 0,
      total_sessions: 0,
    })
    expect(result.weekly).toEqual([])
  })

  it('combines sessions, scores, and weekly data', () => {
    const sessions = [
      makeSession({ id: 's1', started_at: '2026-01-06T10:00:00Z', total_tokens: 2000, tokens_per_prompt: 1000, cache_hit_rate: 0.4 }),
      makeSession({ id: 's2', started_at: '2026-01-07T10:00:00Z', total_tokens: 4000, tokens_per_prompt: 2000, cache_hit_rate: 0.6 }),
    ]
    const scores = [makeScoreResult({ session_id: 's1', overall_score: 70 })]
    const result = buildSessionAnalytics(sessions, scores)

    expect(result.sessions).toHaveLength(2)
    expect(result.sessions[0].overall_score).toBe(70)
    expect(result.sessions[1].overall_score).toBeNull()

    expect(result.aggregates.total_sessions).toBe(2)
    expect(result.aggregates.avg_tokens_per_session).toBe(3000)
    expect(result.aggregates.avg_tokens_per_prompt).toBe(1500)
    expect(result.aggregates.avg_cache_hit_rate).toBe(0.5)

    expect(result.weekly).toHaveLength(1)
    expect(result.weekly[0].week).toBe('2026-W02')
    expect(result.weekly[0].total_tokens).toBe(6000)
  })

  it('response shape matches webapp endpoint format', () => {
    const sessions = [makeSession()]
    const result = buildSessionAnalytics(sessions, [])

    // Verify the exact keys exist
    expect(result).toHaveProperty('sessions')
    expect(result).toHaveProperty('aggregates')
    expect(result).toHaveProperty('weekly')
    expect(result.aggregates).toHaveProperty('avg_tokens_per_session')
    expect(result.aggregates).toHaveProperty('avg_tokens_per_prompt')
    expect(result.aggregates).toHaveProperty('avg_cache_hit_rate')
    expect(result.aggregates).toHaveProperty('total_sessions')

    // Verify weekly item shape
    expect(result.weekly[0]).toHaveProperty('week')
    expect(result.weekly[0]).toHaveProperty('total_tokens')
    expect(result.weekly[0]).toHaveProperty('avg_tokens_per_session')
    expect(result.weekly[0]).toHaveProperty('avg_cache_hit_rate')
    expect(result.weekly[0]).toHaveProperty('session_count')
  })
})
