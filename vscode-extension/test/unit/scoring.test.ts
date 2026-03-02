import { scoreSessions, computeAggregate, ScoreResult } from '../../src/scoring'
import { ParsedSession } from '../../src/parser'

// --- Helpers ---

function makeSession(overrides: Partial<ParsedSession> = {}): ParsedSession {
  return {
    id: 'sess-1',
    project: 'test-project',
    project_path_encoded: '-home-test-project',
    started_at: '2026-01-01T00:00:00Z',
    ended_at: '2026-01-01T01:00:00Z',
    user_prompts: ['Implement a login page', 'Add validation to the form'],
    user_message_count: 2,
    assistant_message_count: 2,
    tool_use_count: 3,
    tools_used: ['Read', 'Edit', 'Bash'],
    thinking_count: 1,
    used_plan_mode: false,
    model: 'claude-sonnet-4-20250514',
    claude_code_version: '2.1.44',
    git_branch: 'main',
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
      adjusting_approach: true,
      building_on_responses: true,
      providing_feedback: false,
    },
    coding_pattern: 'hybrid_code_explanation',
    coding_pattern_quality: 'high',
    overall_score: 72,
    one_line_summary: 'Good iterative engagement with clear goals.',
    ...overrides,
  }
}

function makeApiResponse(scoreJson: object) {
  return {
    content: [{ type: 'text', text: JSON.stringify(scoreJson) }],
  }
}

function makeMockClient(response: any) {
  return {
    messages: {
      create: jest.fn().mockResolvedValue(response),
    },
  } as any
}

// --- scoreSessions ---

describe('scoreSessions', () => {
  it('calls the Anthropic API and returns parsed score', async () => {
    const scoreJson = {
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
        building_on_responses: true,
        providing_feedback: false,
      },
      coding_pattern: 'conceptual_inquiry',
      coding_pattern_quality: 'high',
      overall_score: 65,
      one_line_summary: 'Thoughtful conceptual engagement.',
    }

    const client = makeMockClient(makeApiResponse(scoreJson))
    const sessions = { 'sess-1': makeSession() }

    const results = await scoreSessions(['sess-1'], sessions, {}, client)

    expect(client.messages.create).toHaveBeenCalledTimes(1)
    expect(results['sess-1']).toMatchObject({
      ...scoreJson,
      session_id: 'sess-1',
    })
  })

  it('uses correct model and max_tokens', async () => {
    const client = makeMockClient(makeApiResponse({ overall_score: 50 }))
    const sessions = { 'sess-1': makeSession() }

    await scoreSessions(['sess-1'], sessions, {}, client)

    const callArgs = client.messages.create.mock.calls[0][0]
    expect(callArgs.model).toBe('claude-sonnet-4-20250514')
    expect(callArgs.max_tokens).toBe(1024)
  })

  it('includes session metadata in the prompt', async () => {
    const client = makeMockClient(makeApiResponse({ overall_score: 50 }))
    const sessions = {
      'sess-1': makeSession({
        used_plan_mode: true,
        thinking_count: 5,
        tools_used: ['Read', 'Bash', 'Grep'],
        user_prompts: ['Fix the bug in auth module'],
      }),
    }

    await scoreSessions(['sess-1'], sessions, {}, client)

    const prompt = client.messages.create.mock.calls[0][0].messages[0].content
    expect(prompt).toContain('true')  // used_plan_mode
    expect(prompt).toContain('5')     // thinking_count
    expect(prompt).toContain('Read, Bash, Grep')
    expect(prompt).toContain('Fix the bug in auth module')
  })

  it('limits prompts to 20 per session', async () => {
    const prompts = Array.from({ length: 30 }, (_, i) => `Prompt number ${i + 1}`)
    const client = makeMockClient(makeApiResponse({ overall_score: 50 }))
    const sessions = { 'sess-1': makeSession({ user_prompts: prompts }) }

    await scoreSessions(['sess-1'], sessions, {}, client)

    const sentPrompt = client.messages.create.mock.calls[0][0].messages[0].content
    expect(sentPrompt).toContain('Prompt 20:')
    expect(sentPrompt).not.toContain('Prompt 21:')
  })

  // --- Caching ---

  it('returns cached result without calling API', async () => {
    const cachedScore = makeScoreResult()
    const client = makeMockClient(makeApiResponse({ overall_score: 99 }))
    const sessions = { 'sess-1': makeSession() }

    const results = await scoreSessions(
      ['sess-1'], sessions, { 'sess-1': cachedScore }, client
    )

    expect(client.messages.create).not.toHaveBeenCalled()
    expect(results['sess-1']).toEqual(cachedScore)
  })

  it('bypasses cache when forceRescore is true', async () => {
    const cachedScore = makeScoreResult({ overall_score: 40 })
    const newScore = { overall_score: 85, coding_pattern: 'hybrid_code_explanation' }
    const client = makeMockClient(makeApiResponse(newScore))
    const sessions = { 'sess-1': makeSession() }

    const results = await scoreSessions(
      ['sess-1'], sessions, { 'sess-1': cachedScore }, client, true
    )

    expect(client.messages.create).toHaveBeenCalledTimes(1)
    expect(results['sess-1'].overall_score).toBe(85)
  })

  it('populates the cache object with new scores', async () => {
    const client = makeMockClient(makeApiResponse({ overall_score: 70 }))
    const sessions = { 'sess-1': makeSession() }
    const cached: Record<string, any> = {}

    await scoreSessions(['sess-1'], sessions, cached, client)

    expect(cached['sess-1']).toBeDefined()
    expect(cached['sess-1'].session_id).toBe('sess-1')
    expect(cached['sess-1'].overall_score).toBe(70)
  })

  it('mixes cached and fresh results for multiple sessions', async () => {
    const cachedScore = makeScoreResult({ session_id: 'sess-1', overall_score: 60 })
    const freshScore = { overall_score: 80, coding_pattern: 'ai_delegation' }
    const client = makeMockClient(makeApiResponse(freshScore))
    const sessions = {
      'sess-1': makeSession({ id: 'sess-1' }),
      'sess-2': makeSession({ id: 'sess-2' }),
    }

    const results = await scoreSessions(
      ['sess-1', 'sess-2'], sessions, { 'sess-1': cachedScore }, client
    )

    expect(client.messages.create).toHaveBeenCalledTimes(1) // only sess-2
    expect(results['sess-1'].overall_score).toBe(60)
    expect(results['sess-2'].overall_score).toBe(80)
  })

  // --- Skipping invalid sessions ---

  it('skips sessions not present in allSessions', async () => {
    const client = makeMockClient(makeApiResponse({ overall_score: 50 }))

    const results = await scoreSessions(['missing-id'], {}, {}, client)

    expect(client.messages.create).not.toHaveBeenCalled()
    expect(results['missing-id']).toBeUndefined()
  })

  it('skips sessions with no user prompts', async () => {
    const client = makeMockClient(makeApiResponse({ overall_score: 50 }))
    const sessions = { 'sess-1': makeSession({ user_prompts: [] }) }

    const results = await scoreSessions(['sess-1'], sessions, {}, client)

    expect(client.messages.create).not.toHaveBeenCalled()
    expect(results['sess-1']).toBeUndefined()
  })

  // --- Error handling ---

  it('returns error result when API call throws', async () => {
    const client = {
      messages: {
        create: jest.fn().mockRejectedValue(new Error('API rate limit exceeded')),
      },
    } as any
    const sessions = { 'sess-1': makeSession() }

    const results = await scoreSessions(['sess-1'], sessions, {}, client)

    expect(results['sess-1'].error).toBe('API rate limit exceeded')
    expect(results['sess-1'].session_id).toBe('sess-1')
    expect(results['sess-1'].overall_score).toBeUndefined()
  })

  it('returns error result when API returns non-Error throwable', async () => {
    const client = {
      messages: {
        create: jest.fn().mockRejectedValue('string error'),
      },
    } as any
    const sessions = { 'sess-1': makeSession() }

    const results = await scoreSessions(['sess-1'], sessions, {}, client)

    expect(results['sess-1'].error).toBe('string error')
  })

  it('returns error when response JSON is malformed', async () => {
    const client = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'This is not valid JSON at all' }],
        }),
      },
    } as any
    const sessions = { 'sess-1': makeSession() }

    const results = await scoreSessions(['sess-1'], sessions, {}, client)

    expect(results['sess-1'].error).toBeDefined()
    expect(results['sess-1'].session_id).toBe('sess-1')
  })

  it('handles response wrapped in markdown code fences', async () => {
    const scoreJson = { overall_score: 77, coding_pattern: 'conceptual_inquiry' }
    const client = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: '```json\n' + JSON.stringify(scoreJson) + '\n```' }],
        }),
      },
    } as any
    const sessions = { 'sess-1': makeSession() }

    const results = await scoreSessions(['sess-1'], sessions, {}, client)

    expect(results['sess-1'].overall_score).toBe(77)
    expect(results['sess-1'].coding_pattern).toBe('conceptual_inquiry')
  })

  it('continues scoring remaining sessions after one fails', async () => {
    let callCount = 0
    const client = {
      messages: {
        create: jest.fn().mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            return Promise.reject(new Error('Timeout'))
          }
          return Promise.resolve(makeApiResponse({ overall_score: 88 }))
        }),
      },
    } as any
    const sessions = {
      'sess-1': makeSession({ id: 'sess-1' }),
      'sess-2': makeSession({ id: 'sess-2' }),
    }

    const results = await scoreSessions(['sess-1', 'sess-2'], sessions, {}, client)

    expect(results['sess-1'].error).toBe('Timeout')
    expect(results['sess-2'].overall_score).toBe(88)
  })

  it('does not cache error results', async () => {
    const client = {
      messages: {
        create: jest.fn().mockRejectedValue(new Error('fail')),
      },
    } as any
    const sessions = { 'sess-1': makeSession() }
    const cached: Record<string, any> = {}

    await scoreSessions(['sess-1'], sessions, cached, client)

    // Error results are still put in cached — testing actual behavior
    // The current implementation does NOT cache errors (no cached[sid] = ... in catch)
    expect(cached['sess-1']).toBeUndefined()
  })
})

// --- computeAggregate ---

describe('computeAggregate', () => {
  it('computes correct aggregate for a single session', () => {
    const session = makeScoreResult()
    const result = computeAggregate([session])

    expect(result.sessions_scored).toBe(1)
    expect(result.average_score).toBe(72)
    expect(result.pattern_distribution).toEqual({ hybrid_code_explanation: 1 })

    // 4 true behaviors out of 11 → each true = 1.0, each false = 0.0
    expect(result.behavior_prevalence['iteration_and_refinement']).toBe(1)
    expect(result.behavior_prevalence['specifying_format']).toBe(0)
  })

  it('computes correct average across multiple sessions', () => {
    const sessions = [
      makeScoreResult({ overall_score: 60, session_id: 'a' }),
      makeScoreResult({ overall_score: 80, session_id: 'b' }),
      makeScoreResult({ overall_score: 70, session_id: 'c' }),
    ]
    const result = computeAggregate(sessions)

    expect(result.sessions_scored).toBe(3)
    expect(result.average_score).toBe(70)
  })

  it('rounds average score to nearest integer', () => {
    const sessions = [
      makeScoreResult({ overall_score: 33, session_id: 'a' }),
      makeScoreResult({ overall_score: 33, session_id: 'b' }),
      makeScoreResult({ overall_score: 34, session_id: 'c' }),
    ]
    const result = computeAggregate(sessions)

    // (33+33+34)/3 = 33.33... → rounds to 33
    expect(result.average_score).toBe(33)
  })

  it('calculates behavior prevalence as proportions', () => {
    const sessions = [
      makeScoreResult({
        session_id: 'a',
        fluency_behaviors: {
          iteration_and_refinement: true,
          clarifying_goals: true,
          specifying_format: true,
          providing_examples: false,
          setting_interaction_terms: false,
          checking_facts: false,
          questioning_reasoning: false,
          identifying_missing_context: false,
          adjusting_approach: false,
          building_on_responses: false,
          providing_feedback: false,
        },
      }),
      makeScoreResult({
        session_id: 'b',
        fluency_behaviors: {
          iteration_and_refinement: true,
          clarifying_goals: false,
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
      }),
    ]
    const result = computeAggregate(sessions)

    expect(result.behavior_prevalence['iteration_and_refinement']).toBe(1)   // 2/2
    expect(result.behavior_prevalence['clarifying_goals']).toBe(0.5)         // 1/2
    expect(result.behavior_prevalence['specifying_format']).toBe(0.5)        // 1/2
    expect(result.behavior_prevalence['providing_examples']).toBe(0)         // 0/2
  })

  it('counts pattern distribution correctly', () => {
    const sessions = [
      makeScoreResult({ session_id: 'a', coding_pattern: 'conceptual_inquiry' }),
      makeScoreResult({ session_id: 'b', coding_pattern: 'ai_delegation' }),
      makeScoreResult({ session_id: 'c', coding_pattern: 'conceptual_inquiry' }),
      makeScoreResult({ session_id: 'd', coding_pattern: 'hybrid_code_explanation' }),
    ]
    const result = computeAggregate(sessions)

    expect(result.pattern_distribution).toEqual({
      conceptual_inquiry: 2,
      ai_delegation: 1,
      hybrid_code_explanation: 1,
    })
  })

  it('handles empty sessions array', () => {
    const result = computeAggregate([])

    expect(result.sessions_scored).toBe(0)
    expect(result.average_score).toBe(0)
    expect(result.pattern_distribution).toEqual({})
    // All behaviors should be 0
    expect(Object.values(result.behavior_prevalence).every(v => v === 0)).toBe(true)
  })

  it('treats missing fluency_behaviors as all false', () => {
    const session = { session_id: 'a', overall_score: 50 } as any
    const result = computeAggregate([session])

    expect(result.sessions_scored).toBe(1)
    expect(result.average_score).toBe(50)
    expect(Object.values(result.behavior_prevalence).every(v => v === 0)).toBe(true)
  })

  it('uses "unknown" for missing coding_pattern', () => {
    const session = { session_id: 'a', overall_score: 50 } as any
    const result = computeAggregate([session])

    expect(result.pattern_distribution).toEqual({ unknown: 1 })
  })

  it('treats missing overall_score as 0', () => {
    const session = { session_id: 'a' } as any
    const result = computeAggregate([session])

    expect(result.average_score).toBe(0)
  })
})
