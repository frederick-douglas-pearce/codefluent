import {
  computeConversationVerification,
  computeVerificationMetrics,
  computeWeeklyVerification,
} from '../../src/verificationBehaviors'
import { TimestampedMessage } from '../../src/parser'
import { ParsedConversation } from '../../src/conversation'

function asst(overrides: Partial<TimestampedMessage> = {}): TimestampedMessage {
  return {
    type: 'assistant',
    timestamp: '2026-01-06T10:00:00Z',
    session_id: 'sess-1',
    file_position: 0,
    ...overrides,
  }
}

function withTools(tools: string[], commands?: string[]): TimestampedMessage {
  return asst({
    tool_names: tools,
    bash_commands: commands && commands.some(c => c) ? commands : undefined,
  })
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
    tool_use_count: 0,
    tools_used: [],
    commands_used: [],
    thinking_count: 0,
    used_plan_mode: false,
    model: null,
    claude_code_version: null,
    git_branch: null,
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
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cache_creation_tokens: 0,
    total_cache_read_tokens: 0,
    total_tokens: 0,
    tokens_per_prompt: 0,
    cache_hit_rate: 0,
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

describe('computeConversationVerification — review after edit', () => {
  it('returns zeros for empty messages', () => {
    const result = computeConversationVerification([])
    expect(result.edits_count).toBe(0)
    expect(result.review_before_accept_rate).toBe(0)
  })

  it('counts a single Edit followed by Read as reviewed', () => {
    const result = computeConversationVerification([
      withTools(['Edit', 'Read']),
    ])
    expect(result.edits_count).toBe(1)
    expect(result.reviewed_edits).toBe(1)
    expect(result.review_before_accept_rate).toBe(1)
  })

  it('counts a Write followed by Grep as reviewed', () => {
    const result = computeConversationVerification([
      withTools(['Write', 'Grep']),
    ])
    expect(result.reviewed_edits).toBe(1)
  })

  it('groups consecutive Edit/Write into a single cluster', () => {
    const result = computeConversationVerification([
      withTools(['Edit', 'Edit', 'Write', 'Read']),
    ])
    expect(result.edits_count).toBe(1)
    expect(result.reviewed_edits).toBe(1)
  })

  it('counts cluster as unreviewed when no Read/Grep follows', () => {
    const result = computeConversationVerification([
      withTools(['Edit', 'Edit', 'Bash'], ['', '', 'echo hi']),
    ])
    expect(result.edits_count).toBe(1)
    expect(result.reviewed_edits).toBe(0)
    expect(result.review_before_accept_rate).toBe(0)
  })

  it('separates non-adjacent edit clusters', () => {
    const result = computeConversationVerification([
      withTools(['Edit', 'Read', 'Edit', 'Read']),
    ])
    expect(result.edits_count).toBe(2)
    expect(result.reviewed_edits).toBe(2)
  })

  it('does not count a Read more than 10 tool positions after an edit', () => {
    const padding = Array(11).fill('Bash')
    const cmds = Array(11).fill('ls')
    const result = computeConversationVerification([
      withTools(['Edit', ...padding, 'Read'], ['', ...cmds, '']),
    ])
    expect(result.edits_count).toBe(1)
    expect(result.reviewed_edits).toBe(0)
  })

  it('finds Read within window across multiple messages', () => {
    const result = computeConversationVerification([
      withTools(['Edit']),
      withTools(['Bash'], ['ls']),
      withTools(['Read']),
    ])
    expect(result.edits_count).toBe(1)
    expect(result.reviewed_edits).toBe(1)
  })
})

describe('computeConversationVerification — test before commit', () => {
  it('counts a test command followed by git commit as tested', () => {
    const result = computeConversationVerification([
      withTools(['Bash', 'Bash'], ['npm test', 'git commit -m "x"']),
    ])
    expect(result.commits_count).toBe(1)
    expect(result.tested_commits).toBe(1)
    expect(result.test_before_commit_rate).toBe(1)
  })

  it('matches multiple test runners', () => {
    for (const cmd of ['pytest', 'jest src/', 'cargo test', 'go test ./...', 'rspec', 'vitest', 'tox', 'bun test']) {
      const result = computeConversationVerification([
        withTools(['Bash', 'Bash'], [cmd, 'git commit -m hi']),
      ])
      expect(result.tested_commits).toBe(1)
    }
  })

  it('matches `npm run test`', () => {
    const result = computeConversationVerification([
      withTools(['Bash', 'Bash'], ['npm run test', 'git commit -m hi']),
    ])
    expect(result.tested_commits).toBe(1)
  })

  it('marks a commit as untested when no test command precedes it', () => {
    const result = computeConversationVerification([
      withTools(['Bash', 'Bash'], ['echo hi', 'git commit -m hi']),
    ])
    expect(result.commits_count).toBe(1)
    expect(result.tested_commits).toBe(0)
  })

  it('does not look back further than 10 tool positions', () => {
    const padding = Array(11).fill('Bash')
    const cmds = ['npm test', ...Array(10).fill('echo'), 'git commit -m hi']
    const result = computeConversationVerification([
      withTools([...padding, 'Bash'], cmds),
    ])
    expect(result.commits_count).toBe(1)
    expect(result.tested_commits).toBe(0)
  })

  it('counts each commit independently', () => {
    const result = computeConversationVerification([
      withTools(['Bash', 'Bash', 'Bash', 'Bash'], ['npm test', 'git commit -m a', 'echo', 'git commit -m b']),
    ])
    expect(result.commits_count).toBe(2)
    expect(result.tested_commits).toBe(1)
    expect(result.test_before_commit_rate).toBe(0.5)
  })

  it('ignores Bash commands without commit pattern', () => {
    const result = computeConversationVerification([
      withTools(['Bash'], ['git status']),
    ])
    expect(result.commits_count).toBe(0)
  })

  it('only matches tests against Bash tool, not other tools', () => {
    const result = computeConversationVerification([
      withTools(['Read', 'Bash'], ['', 'git commit -m hi']),
    ])
    expect(result.tested_commits).toBe(0)
  })
})

describe('computeVerificationMetrics', () => {
  it('returns zeros for no conversations', () => {
    const result = computeVerificationMetrics([])
    expect(result.total_edit_clusters).toBe(0)
    expect(result.review_before_accept_rate).toBe(0)
    expect(result.insufficient_edits).toBe(true)
    expect(result.insufficient_commits).toBe(true)
  })

  it('aggregates rates across conversations', () => {
    const conversations = [
      makeConversation({ edits_count: 4, reviewed_edits: 3, commits_count: 2, tested_commits: 2 }),
      makeConversation({ id: 'c2', edits_count: 6, reviewed_edits: 3, commits_count: 4, tested_commits: 2 }),
    ]
    const result = computeVerificationMetrics(conversations)
    expect(result.total_edit_clusters).toBe(10)
    expect(result.total_reviewed_edits).toBe(6)
    expect(result.review_before_accept_rate).toBe(0.6)
    expect(result.total_commits).toBe(6)
    expect(result.test_before_commit_rate).toBeCloseTo(0.6667, 4)
  })

  it('flags insufficient signal when fewer than 5 conversations have edits', () => {
    const conversations = Array.from({ length: 4 }, (_, i) =>
      makeConversation({ id: `c${i}`, edits_count: 1, reviewed_edits: 1, commits_count: 1, tested_commits: 1 }),
    )
    const result = computeVerificationMetrics(conversations)
    expect(result.insufficient_edits).toBe(true)
    expect(result.insufficient_commits).toBe(true)
  })

  it('does not flag insufficient when threshold is met', () => {
    const conversations = Array.from({ length: 5 }, (_, i) =>
      makeConversation({ id: `c${i}`, edits_count: 1, reviewed_edits: 0, commits_count: 1, tested_commits: 0 }),
    )
    const result = computeVerificationMetrics(conversations)
    expect(result.insufficient_edits).toBe(false)
    expect(result.insufficient_commits).toBe(false)
  })

  it('reports insufficient flags independently', () => {
    const conversations = Array.from({ length: 5 }, (_, i) =>
      makeConversation({ id: `c${i}`, edits_count: 1, reviewed_edits: 1, commits_count: 0, tested_commits: 0 }),
    )
    const result = computeVerificationMetrics(conversations)
    expect(result.insufficient_edits).toBe(false)
    expect(result.insufficient_commits).toBe(true)
  })
})

describe('computeWeeklyVerification', () => {
  it('returns empty array for no conversations', () => {
    expect(computeWeeklyVerification([])).toEqual([])
  })

  it('groups conversations by ISO week', () => {
    const conversations = [
      makeConversation({ id: 'c1', started_at: '2026-01-05T10:00:00Z', edits_count: 2, reviewed_edits: 1 }),
      makeConversation({ id: 'c2', started_at: '2026-01-07T10:00:00Z', edits_count: 2, reviewed_edits: 2 }),
      makeConversation({ id: 'c3', started_at: '2026-01-12T10:00:00Z', edits_count: 1, reviewed_edits: 0 }),
    ]
    const weeks = computeWeeklyVerification(conversations)
    expect(weeks.length).toBe(2)
    expect(weeks[0].week).toBe('2026-W02')
    expect(weeks[0].review_before_accept_rate).toBe(0.75)
    expect(weeks[1].week).toBe('2026-W03')
  })

  it('skips conversations with missing started_at', () => {
    const conversations = [
      makeConversation({ id: 'c1', started_at: null }),
      makeConversation({ id: 'c2', started_at: '2026-01-12T10:00:00Z', edits_count: 1, reviewed_edits: 1 }),
    ]
    const weeks = computeWeeklyVerification(conversations)
    expect(weeks.length).toBe(1)
  })
})
