import Anthropic from '@anthropic-ai/sdk'
import { ParsedSession } from './parser'

export interface ScoreResult {
  fluency_behaviors?: Record<string, boolean>
  coding_pattern?: string
  coding_pattern_quality?: string
  overall_score?: number
  one_line_summary?: string
  session_id: string
  error?: string
}

export interface AggregateResult {
  sessions_scored: number
  average_score: number
  behavior_prevalence: Record<string, number>
  pattern_distribution: Record<string, number>
}

const SCORING_PROMPT = `You are an AI Fluency Analyst. Analyze this Claude Code session's user prompts and score against Anthropic's 4D AI Fluency Framework and their 6 coding interaction patterns.

## AI Fluency Behavioral Indicators (score each true/false)

1. **iteration_and_refinement** — Builds on Claude's responses, refining rather than accepting first answer
2. **clarifying_goals** — Clearly states what they're trying to accomplish
3. **specifying_format** — Specifies how they want output formatted
4. **providing_examples** — Provides examples of desired output
5. **setting_interaction_terms** — Tells Claude how to interact ("push back if wrong", "explain reasoning")
6. **checking_facts** — Verifies or questions factual claims
7. **questioning_reasoning** — Asks Claude to explain its rationale
8. **identifying_missing_context** — Identifies gaps in Claude's knowledge or assumptions
9. **adjusting_approach** — Changes strategy based on responses
10. **building_on_responses** — Uses Claude's output as foundation for further work
11. **providing_feedback** — Gives feedback on response quality

## Coding Interaction Patterns (classify into ONE)

**High-quality (65%+):**
- **conceptual_inquiry** — Asks conceptual questions, codes manually
- **generation_then_comprehension** — Generates code, then asks follow-ups to understand
- **hybrid_code_explanation** — Requests code + explanations simultaneously

**Low-quality (<40%):**
- **ai_delegation** — Entirely delegates with minimal engagement
- **progressive_ai_reliance** — Starts engaged, gradually offloads
- **iterative_ai_debugging** — Uses AI to debug without understanding

## Additional Signals
- **used_plan_mode**: {used_plan_mode} (positive signal if true)
- **thinking_count**: {thinking_count} (extended thinking usage)
- **tool_diversity**: {tools_used}

## User Prompts From This Session

{prompts}

## Respond with ONLY a JSON object:

{
  "fluency_behaviors": {
    "iteration_and_refinement": true/false,
    "clarifying_goals": true/false,
    "specifying_format": true/false,
    "providing_examples": true/false,
    "setting_interaction_terms": true/false,
    "checking_facts": true/false,
    "questioning_reasoning": true/false,
    "identifying_missing_context": true/false,
    "adjusting_approach": true/false,
    "building_on_responses": true/false,
    "providing_feedback": true/false
  },
  "coding_pattern": "one_of_the_six_patterns",
  "coding_pattern_quality": "high" or "low",
  "overall_score": 0-100,
  "one_line_summary": "Brief assessment."
}`

const BEHAVIORS = [
  'iteration_and_refinement', 'clarifying_goals', 'specifying_format',
  'providing_examples', 'setting_interaction_terms', 'checking_facts',
  'questioning_reasoning', 'identifying_missing_context',
  'adjusting_approach', 'building_on_responses', 'providing_feedback',
]

export async function scoreSessions(
  sessionIds: string[],
  allSessions: Record<string, ParsedSession>,
  cached: Record<string, any>,
  client: Anthropic,
  forceRescore = false,
): Promise<Record<string, ScoreResult>> {
  const results: Record<string, ScoreResult> = {}

  for (const sid of sessionIds) {
    if (cached[sid] && !forceRescore) {
      results[sid] = cached[sid]
      continue
    }

    const session = allSessions[sid]
    if (!session || !session.user_prompts.length) continue

    const promptsText = session.user_prompts.slice(0, 20)
      .map((p, i) => `Prompt ${i + 1}: ${p}`)
      .join('\n\n---\n\n')

    const prompt = SCORING_PROMPT
      .replace('{used_plan_mode}', String(session.used_plan_mode))
      .replace('{thinking_count}', String(session.thinking_count))
      .replace('{tools_used}', session.tools_used.join(', '))
      .replace('{prompts}', promptsText)

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      })
      let text = (response.content[0] as any).text.trim()
      if (text.startsWith('```')) {
        text = text.split('\n').slice(1).join('\n').replace(/```\s*$/, '').trim()
      }
      const score = JSON.parse(text)
      score.session_id = sid
      results[sid] = score
      cached[sid] = score
    } catch (e: any) {
      results[sid] = { error: e.message || String(e), session_id: sid }
    }
  }

  return results
}

export function computeAggregate(scoredSessions: any[]): AggregateResult {
  const n = scoredSessions.length
  const prevalence: Record<string, number> = {}

  for (const b of BEHAVIORS) {
    const count = scoredSessions.filter(s => s.fluency_behaviors?.[b]).length
    prevalence[b] = n ? Math.round((count / n) * 100) / 100 : 0
  }

  const patterns: Record<string, number> = {}
  for (const s of scoredSessions) {
    const p = s.coding_pattern || 'unknown'
    patterns[p] = (patterns[p] || 0) + 1
  }

  const avgScore = n
    ? Math.round(scoredSessions.reduce((sum, s) => sum + (s.overall_score || 0), 0) / n)
    : 0

  return {
    sessions_scored: n,
    average_score: avgScore,
    behavior_prevalence: prevalence,
    pattern_distribution: patterns,
  }
}
