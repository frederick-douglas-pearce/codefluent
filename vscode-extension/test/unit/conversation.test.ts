jest.mock('fs')
jest.mock('os')

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { parseSessionMessages, TimestampedMessage } from '../../src/parser'
import { buildConversations, getAllConversations, ParsedConversation, computeContentHash } from '../../src/conversation'

const mockFs = fs as jest.Mocked<typeof fs>
const mockOs = os as jest.Mocked<typeof os>

function jsonl(...objects: any[]): string {
  return objects.map(o => JSON.stringify(o)).join('\n')
}

function userMsg(content: any, extra: Record<string, any> = {}): any {
  return {
    type: 'user',
    sessionId: 'sess-1',
    message: { role: 'user', content },
    timestamp: '2026-03-01T10:00:00.000Z',
    ...extra,
  }
}

function assistantMsg(extra: Record<string, any> = {}): any {
  const { message: messageOverride, ...rest } = extra
  return {
    type: 'assistant',
    message: {
      role: 'assistant',
      model: 'claude-sonnet-4-20250514',
      content: [{ type: 'text', text: 'Response' }],
      ...messageOverride,
    },
    timestamp: '2026-03-01T10:00:05.000Z',
    ...rest,
  }
}

// ─── parseSessionMessages ───────────────────────────────────────────

describe('parseSessionMessages', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('returns null for unreadable file', () => {
    mockFs.readFileSync.mockImplementation(() => { throw new Error('ENOENT') })
    expect(parseSessionMessages('/fake/session.jsonl')).toBeNull()
  })

  it('returns null for empty file', () => {
    mockFs.readFileSync.mockReturnValue('')
    expect(parseSessionMessages('/fake/session.jsonl')).toBeNull()
  })

  it('returns null for sidechain sessions', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Prompt', { isSidechain: true }),
      assistantMsg(),
    ))
    expect(parseSessionMessages('/fake/project/session.jsonl')).toBeNull()
  })

  it('extracts user messages with content', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Hello Claude'),
      assistantMsg(),
    ))
    const result = parseSessionMessages('/fake/project/session.jsonl')
    expect(result).not.toBeNull()
    expect(result!.messages).toHaveLength(2)
    const userMsgs = result!.messages.filter(m => m.type === 'user')
    expect(userMsgs).toHaveLength(1)
    expect(userMsgs[0].content).toBe('Hello Claude')
  })

  it('extracts array format content', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg([{ type: 'text', text: 'Array content' }]),
      assistantMsg(),
    ))
    const result = parseSessionMessages('/fake/project/session.jsonl')
    const userMsgs = result!.messages.filter(m => m.type === 'user')
    expect(userMsgs[0].content).toBe('Array content')
  })

  it('filters interrupted messages by setting content to undefined', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Real prompt'),
      userMsg('[Request interrupted by user for tool use]', { timestamp: '2026-03-01T10:01:00.000Z' }),
      assistantMsg(),
    ))
    const result = parseSessionMessages('/fake/project/session.jsonl')
    const userMsgs = result!.messages.filter(m => m.type === 'user')
    expect(userMsgs).toHaveLength(2)
    expect(userMsgs[0].content).toBe('Real prompt')
    expect(userMsgs[1].content).toBeUndefined()
  })

  it('truncates user prompts at 2000 chars', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('A'.repeat(3000)),
      assistantMsg(),
    ))
    const result = parseSessionMessages('/fake/project/session.jsonl')
    const userMsgs = result!.messages.filter(m => m.type === 'user')
    expect(userMsgs[0].content).toHaveLength(2000)
  })

  it('preserves timestamps on messages', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Hello', { timestamp: '2026-03-01T10:00:00.000Z' }),
      assistantMsg({ timestamp: '2026-03-01T10:00:05.000Z' }),
    ))
    const result = parseSessionMessages('/fake/project/session.jsonl')
    expect(result!.messages[0].timestamp).toBe('2026-03-01T10:00:00.000Z')
    expect(result!.messages[1].timestamp).toBe('2026-03-01T10:00:05.000Z')
  })

  it('preserves file_position for stable sorting', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('First'),
      assistantMsg(),
      userMsg('Second', { timestamp: '2026-03-01T10:01:00.000Z' }),
    ))
    const result = parseSessionMessages('/fake/project/session.jsonl')
    expect(result!.messages[0].file_position).toBe(0)
    expect(result!.messages[1].file_position).toBe(1)
    expect(result!.messages[2].file_position).toBe(2)
  })

  it('extracts assistant token usage', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Hello'),
      assistantMsg({
        message: {
          usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 200, cache_read_input_tokens: 300 },
        },
      }),
    ))
    const result = parseSessionMessages('/fake/project/session.jsonl')
    const assistants = result!.messages.filter(m => m.type === 'assistant')
    expect(assistants[0].usage).toEqual({
      input_tokens: 100, output_tokens: 50,
      cache_creation_input_tokens: 200, cache_read_input_tokens: 300,
    })
  })

  it('extracts tool names from assistant content', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Build'),
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          model: 'claude-sonnet-4-20250514',
          content: [
            { type: 'tool_use', name: 'Write' },
            { type: 'tool_use', name: 'Bash' },
          ],
        },
        timestamp: '2026-03-01T10:00:05Z',
      },
    ))
    const result = parseSessionMessages('/fake/project/session.jsonl')
    const assistants = result!.messages.filter(m => m.type === 'assistant')
    expect(assistants[0].tool_names).toEqual(['Write', 'Bash'])
  })

  it('extracts top-level tool_use messages', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Do it'),
      { type: 'tool_use', name: 'Read', timestamp: '2026-03-01T10:00:01Z' },
      assistantMsg(),
    ))
    const result = parseSessionMessages('/fake/project/session.jsonl')
    const tools = result!.messages.filter(m => m.type === 'tool_use')
    expect(tools).toHaveLength(1)
    expect(tools[0].tool_names).toEqual(['Read'])
  })

  it('extracts tool name from nested content in tool_use message', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Do it'),
      {
        type: 'tool_use',
        message: { content: [{ type: 'tool_use', name: 'Grep' }] },
        timestamp: '2026-03-01T10:00:01Z',
      },
      assistantMsg(),
    ))
    const result = parseSessionMessages('/fake/project/session.jsonl')
    const tools = result!.messages.filter(m => m.type === 'tool_use')
    expect(tools[0].tool_names).toEqual(['Grep'])
  })

  it('counts thinking messages', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Think'),
      { type: 'thinking', content: 'pondering...', timestamp: '2026-03-01T10:00:01Z' },
      { type: 'thinking', content: 'more', timestamp: '2026-03-01T10:00:02Z' },
      assistantMsg(),
    ))
    const result = parseSessionMessages('/fake/project/session.jsonl')
    const thinking = result!.messages.filter(m => m.type === 'thinking')
    expect(thinking).toHaveLength(2)
  })

  it('detects plan mode', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Plan this', { planContent: 'My plan...' }),
      assistantMsg(),
    ))
    const result = parseSessionMessages('/fake/project/session.jsonl')
    const userMsgs = result!.messages.filter(m => m.type === 'user')
    expect(userMsgs[0].used_plan_mode).toBe(true)
  })

  it('sets session_id on all messages', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Hi', { sessionId: 'my-sess' }),
      assistantMsg(),
    ))
    const result = parseSessionMessages('/fake/project/session.jsonl')
    for (const msg of result!.messages) {
      expect(msg.session_id).toBe('my-sess')
    }
  })

  it('falls back to filename for session ID', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      { type: 'user', message: { role: 'user', content: 'Hi' }, timestamp: '2026-03-01T10:00:00Z' },
      assistantMsg(),
    ))
    const result = parseSessionMessages('/fake/project/abc-123.jsonl')
    expect(result!.session_id).toBe('abc-123')
  })

  it('sets project and project_path_encoded', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Hi', { cwd: '/home/user/my-project' }),
      assistantMsg(),
    ))
    const result = parseSessionMessages('/home/.claude/projects/-home-user-my-project/session.jsonl')
    expect(result!.project).toBe('my-project')
    expect(result!.project_path_encoded).toBe('-home-user-my-project')
  })

  it('handles UUID subdirectory for project_path_encoded', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Hi'),
      assistantMsg(),
    ))
    const result = parseSessionMessages(
      '/home/.claude/projects/-home-user-my-project/1a67a55f-b4ed-45f9-8347-bde22cd0609c/session.jsonl'
    )
    expect(result!.project_path_encoded).toBe('-home-user-my-project')
  })

  it('skips SKIP_TYPES messages', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Hello'),
      { type: 'file-history-snapshot', data: {} },
      { type: 'tool_result', content: 'result' },
      { type: 'progress', percent: 50 },
      { type: 'system', content: 'sys' },
      assistantMsg(),
    ))
    const result = parseSessionMessages('/fake/project/session.jsonl')
    // Only user + assistant should be in messages
    expect(result!.messages).toHaveLength(2)
  })

  it('skips malformed JSONL lines silently', () => {
    const raw = JSON.stringify(userMsg('Good line')) + '\n{bad json\n' + JSON.stringify(assistantMsg())
    mockFs.readFileSync.mockReturnValue(raw)
    const result = parseSessionMessages('/fake/project/session.jsonl')
    expect(result).not.toBeNull()
    expect(result!.messages).toHaveLength(2)
  })

  it('extracts model from assistant messages', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Hello'),
      assistantMsg(),
    ))
    const result = parseSessionMessages('/fake/project/session.jsonl')
    const assistants = result!.messages.filter(m => m.type === 'assistant')
    expect(assistants[0].model).toBe('claude-sonnet-4-20250514')
  })

  it('backfills version and git_branch on all messages', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Hello', { version: '2.1.44', gitBranch: 'feature/test' }),
      assistantMsg(),
    ))
    const result = parseSessionMessages('/fake/project/session.jsonl')
    for (const msg of result!.messages) {
      expect(msg.claude_code_version).toBe('2.1.44')
      expect(msg.git_branch).toBe('feature/test')
    }
  })

  it('handles messages without timestamps', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      { type: 'user', sessionId: 's1', message: { role: 'user', content: 'Hi' } },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Ok' }] } },
    ))
    const result = parseSessionMessages('/fake/project/session.jsonl')
    expect(result).not.toBeNull()
    expect(result!.messages[0].timestamp).toBeNull()
    expect(result!.messages[1].timestamp).toBeNull()
  })

  it('handles empty user content gracefully', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg(''),
      userMsg('Real prompt', { timestamp: '2026-03-01T10:01:00.000Z' }),
      assistantMsg(),
    ))
    const result = parseSessionMessages('/fake/project/session.jsonl')
    const userMsgs = result!.messages.filter(m => m.type === 'user')
    expect(userMsgs[0].content).toBeUndefined()
    expect(userMsgs[1].content).toBe('Real prompt')
  })

  it('handles assistant without usage', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Hello'),
      assistantMsg(),
    ))
    const result = parseSessionMessages('/fake/project/session.jsonl')
    const assistants = result!.messages.filter(m => m.type === 'assistant')
    expect(assistants[0].usage).toBeUndefined()
  })

  it('handles partial usage fields', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Hello'),
      assistantMsg({
        message: { usage: { input_tokens: 100, output_tokens: 50 } },
      }),
    ))
    const result = parseSessionMessages('/fake/project/session.jsonl')
    const assistants = result!.messages.filter(m => m.type === 'assistant')
    expect(assistants[0].usage).toEqual({
      input_tokens: 100, output_tokens: 50,
      cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
    })
  })
})

// ─── buildConversations ─────────────────────────────────────────────

describe('buildConversations', () => {
  function makeUserMessage(timestamp: string, content: string, sessionId = 'sess-1', pos = 0): TimestampedMessage {
    return {
      type: 'user', timestamp, session_id: sessionId, file_position: pos,
      content, used_plan_mode: false,
    }
  }

  function makeAssistantMessage(timestamp: string, usage?: TimestampedMessage['usage'], sessionId = 'sess-1', pos = 0): TimestampedMessage {
    return {
      type: 'assistant', timestamp, session_id: sessionId, file_position: pos,
      model: 'claude-sonnet-4-20250514',
      usage,
    }
  }

  function makeToolUse(timestamp: string, name: string, sessionId = 'sess-1', pos = 0): TimestampedMessage {
    return { type: 'tool_use', timestamp, session_id: sessionId, file_position: pos, tool_names: [name] }
  }

  function makeThinking(timestamp: string, sessionId = 'sess-1', pos = 0): TimestampedMessage {
    return { type: 'thinking', timestamp, session_id: sessionId, file_position: pos }
  }

  it('returns empty array for empty messages', () => {
    expect(buildConversations([], 'proj', 'encoded', 60)).toEqual([])
  })

  it('groups all messages into one conversation when no gap exceeds threshold', () => {
    const messages = [
      makeUserMessage('2026-03-01T10:00:00.000Z', 'Hello', 'sess-1', 0),
      makeAssistantMessage('2026-03-01T10:00:05.000Z', undefined, 'sess-1', 1),
      makeUserMessage('2026-03-01T10:10:00.000Z', 'Follow-up', 'sess-1', 2),
      makeAssistantMessage('2026-03-01T10:10:05.000Z', undefined, 'sess-1', 3),
    ]
    const result = buildConversations(messages, 'proj', '-home-user-proj', 60)
    expect(result).toHaveLength(1)
    expect(result[0].user_prompts).toEqual(['Hello', 'Follow-up'])
    expect(result[0].user_message_count).toBe(2)
    expect(result[0].assistant_message_count).toBe(2)
  })

  it('splits conversations at gap exceeding threshold', () => {
    const messages = [
      makeUserMessage('2026-03-01T10:00:00.000Z', 'First conv', 'sess-1', 0),
      makeAssistantMessage('2026-03-01T10:00:05.000Z', undefined, 'sess-1', 1),
      // 2-hour gap
      makeUserMessage('2026-03-01T12:00:00.000Z', 'Second conv', 'sess-1', 2),
      makeAssistantMessage('2026-03-01T12:00:05.000Z', undefined, 'sess-1', 3),
    ]
    const result = buildConversations(messages, 'proj', '-home-user-proj', 60)
    expect(result).toHaveLength(2)
    expect(result[0].user_prompts).toEqual(['First conv'])
    expect(result[1].user_prompts).toEqual(['Second conv'])
  })

  it('does not split at gap exactly equal to threshold', () => {
    const messages = [
      makeUserMessage('2026-03-01T10:00:00.000Z', 'First', 'sess-1', 0),
      // Exactly 60 minutes gap
      makeUserMessage('2026-03-01T11:00:00.000Z', 'Second', 'sess-1', 1),
    ]
    const result = buildConversations(messages, 'proj', '-home-user-proj', 60)
    expect(result).toHaveLength(1)
    expect(result[0].user_prompts).toEqual(['First', 'Second'])
  })

  it('splits at gap one millisecond over threshold', () => {
    const messages = [
      makeUserMessage('2026-03-01T10:00:00.000Z', 'First', 'sess-1', 0),
      // 60 minutes + 1 millisecond
      makeUserMessage('2026-03-01T11:00:00.001Z', 'Second', 'sess-1', 1),
    ]
    const result = buildConversations(messages, 'proj', '-home-user-proj', 60)
    expect(result).toHaveLength(2)
  })

  it('assigns deterministic conversation IDs', () => {
    const messages = [
      makeUserMessage('2026-03-01T10:00:00.000Z', 'First', 'sess-1', 0),
      makeUserMessage('2026-03-01T12:00:00.000Z', 'Second', 'sess-1', 1),
      makeUserMessage('2026-03-01T14:00:00.000Z', 'Third', 'sess-1', 2),
    ]
    const result = buildConversations(messages, 'proj', '-home-user-proj', 60)
    expect(result).toHaveLength(3)
    expect(result[0].id).toBe('-home-user-proj:conv:000')
    expect(result[1].id).toBe('-home-user-proj:conv:001')
    expect(result[2].id).toBe('-home-user-proj:conv:002')
  })

  it('same data produces same IDs (deterministic)', () => {
    const messages = [
      makeUserMessage('2026-03-01T10:00:00.000Z', 'First', 'sess-1', 0),
      makeUserMessage('2026-03-01T12:00:00.000Z', 'Second', 'sess-1', 1),
    ]
    const result1 = buildConversations(messages, 'proj', '-home-user-proj', 60)
    const result2 = buildConversations(messages, 'proj', '-home-user-proj', 60)
    expect(result1.map(c => c.id)).toEqual(result2.map(c => c.id))
  })

  it('accumulates tokens correctly across messages in a conversation', () => {
    const messages = [
      makeUserMessage('2026-03-01T10:00:00.000Z', 'Hello', 'sess-1', 0),
      makeAssistantMessage('2026-03-01T10:00:05.000Z', {
        input_tokens: 100, output_tokens: 50,
        cache_creation_input_tokens: 200, cache_read_input_tokens: 300,
      }, 'sess-1', 1),
      makeUserMessage('2026-03-01T10:10:00.000Z', 'Follow-up', 'sess-1', 2),
      makeAssistantMessage('2026-03-01T10:10:05.000Z', {
        input_tokens: 150, output_tokens: 75,
        cache_creation_input_tokens: 100, cache_read_input_tokens: 400,
      }, 'sess-1', 3),
    ]
    const result = buildConversations(messages, 'proj', 'enc', 60)
    expect(result[0].total_input_tokens).toBe(250)
    expect(result[0].total_output_tokens).toBe(125)
    expect(result[0].total_cache_creation_tokens).toBe(300)
    expect(result[0].total_cache_read_tokens).toBe(700)
    expect(result[0].total_tokens).toBe(1375)
  })

  it('token conservation: sum of conversation tokens = sum of all messages', () => {
    const usage1 = { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 200, cache_read_input_tokens: 300 }
    const usage2 = { input_tokens: 150, output_tokens: 75, cache_creation_input_tokens: 100, cache_read_input_tokens: 400 }
    const messages = [
      makeUserMessage('2026-03-01T10:00:00.000Z', 'Conv1', 'sess-1', 0),
      makeAssistantMessage('2026-03-01T10:00:05.000Z', usage1, 'sess-1', 1),
      makeUserMessage('2026-03-01T12:00:00.000Z', 'Conv2', 'sess-1', 2),
      makeAssistantMessage('2026-03-01T12:00:05.000Z', usage2, 'sess-1', 3),
    ]
    const result = buildConversations(messages, 'proj', 'enc', 60)
    const totalFromConvs = result.reduce((s, c) => s + c.total_tokens, 0)
    const totalFromMessages = (100 + 50 + 200 + 300) + (150 + 75 + 100 + 400)
    expect(totalFromConvs).toBe(totalFromMessages)
  })

  it('computes tokens_per_prompt correctly', () => {
    const messages = [
      makeUserMessage('2026-03-01T10:00:00.000Z', 'First', 'sess-1', 0),
      makeAssistantMessage('2026-03-01T10:00:05.000Z', {
        input_tokens: 100, output_tokens: 100,
        cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
      }, 'sess-1', 1),
      makeUserMessage('2026-03-01T10:10:00.000Z', 'Second', 'sess-1', 2),
      makeAssistantMessage('2026-03-01T10:10:05.000Z', {
        input_tokens: 100, output_tokens: 100,
        cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
      }, 'sess-1', 3),
    ]
    const result = buildConversations(messages, 'proj', 'enc', 60)
    expect(result[0].tokens_per_prompt).toBe(200) // 400 / 2
    expect(result[0].prompt_count).toBe(2) // both have content
  })

  it('distinguishes prompt_count from user_message_count', () => {
    // Simulate tool_result messages: type 'user' but no content
    const messages = [
      makeUserMessage('2026-03-01T10:00:00.000Z', 'Real prompt', 'sess-1', 0),
      makeAssistantMessage('2026-03-01T10:00:05.000Z', {
        input_tokens: 50, output_tokens: 50,
        cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
      }, 'sess-1', 1),
      // Tool result messages — type 'user' with no content
      { type: 'user', timestamp: '2026-03-01T10:00:10.000Z', session_id: 'sess-1', file_position: 2, used_plan_mode: false } as TimestampedMessage,
      { type: 'user', timestamp: '2026-03-01T10:00:15.000Z', session_id: 'sess-1', file_position: 3, used_plan_mode: false } as TimestampedMessage,
      { type: 'user', timestamp: '2026-03-01T10:00:20.000Z', session_id: 'sess-1', file_position: 4, used_plan_mode: false } as TimestampedMessage,
      makeAssistantMessage('2026-03-01T10:00:25.000Z', {
        input_tokens: 50, output_tokens: 50,
        cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
      }, 'sess-1', 5),
      makeUserMessage('2026-03-01T10:05:00.000Z', 'Another real prompt', 'sess-1', 6),
      makeAssistantMessage('2026-03-01T10:05:05.000Z', {
        input_tokens: 50, output_tokens: 50,
        cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
      }, 'sess-1', 7),
    ]
    const result = buildConversations(messages, 'proj', 'enc', 60)
    expect(result).toHaveLength(1)
    expect(result[0].user_message_count).toBe(5) // all type 'user' messages
    expect(result[0].prompt_count).toBe(2) // only messages with content
    expect(result[0].tokens_per_prompt).toBe(150) // 300 total / 2 prompts (not / 5)
  })

  it('computes cache_hit_rate correctly', () => {
    const messages = [
      makeUserMessage('2026-03-01T10:00:00.000Z', 'Hello', 'sess-1', 0),
      makeAssistantMessage('2026-03-01T10:00:05.000Z', {
        input_tokens: 100, output_tokens: 50,
        cache_creation_input_tokens: 200, cache_read_input_tokens: 300,
      }, 'sess-1', 1),
    ]
    const result = buildConversations(messages, 'proj', 'enc', 60)
    // 300 / (300 + 100 + 200) = 0.5
    expect(result[0].cache_hit_rate).toBe(0.5)
  })

  it('tracks session_ids from multiple sessions', () => {
    const messages = [
      makeUserMessage('2026-03-01T10:00:00.000Z', 'From sess 1', 'sess-1', 0),
      makeAssistantMessage('2026-03-01T10:00:05.000Z', undefined, 'sess-1', 1),
      makeUserMessage('2026-03-01T10:10:00.000Z', 'From sess 2', 'sess-2', 0),
      makeAssistantMessage('2026-03-01T10:10:05.000Z', undefined, 'sess-2', 1),
    ]
    const result = buildConversations(messages, 'proj', 'enc', 60)
    expect(result).toHaveLength(1)
    expect(result[0].session_ids).toEqual(['sess-1', 'sess-2'])
  })

  it('collects tools_used across tool_use and assistant messages', () => {
    const messages = [
      makeUserMessage('2026-03-01T10:00:00.000Z', 'Build', 'sess-1', 0),
      { ...makeAssistantMessage('2026-03-01T10:00:05.000Z', undefined, 'sess-1', 1), tool_names: ['Write', 'Bash'] },
      makeToolUse('2026-03-01T10:00:10.000Z', 'Read', 'sess-1', 2),
    ]
    const result = buildConversations(messages, 'proj', 'enc', 60)
    expect(result[0].tools_used).toEqual(['Bash', 'Read', 'Write'])
    expect(result[0].tool_use_count).toBe(3) // 2 from assistant + 1 top-level
  })

  it('counts thinking messages', () => {
    const messages = [
      makeUserMessage('2026-03-01T10:00:00.000Z', 'Think', 'sess-1', 0),
      makeThinking('2026-03-01T10:00:01.000Z', 'sess-1', 1),
      makeThinking('2026-03-01T10:00:02.000Z', 'sess-1', 2),
      makeAssistantMessage('2026-03-01T10:00:05.000Z', undefined, 'sess-1', 3),
    ]
    const result = buildConversations(messages, 'proj', 'enc', 60)
    expect(result[0].thinking_count).toBe(2)
  })

  it('detects plan mode usage', () => {
    const messages: TimestampedMessage[] = [
      { ...makeUserMessage('2026-03-01T10:00:00.000Z', 'Plan this', 'sess-1', 0), used_plan_mode: true },
      makeAssistantMessage('2026-03-01T10:00:05.000Z', undefined, 'sess-1', 1),
    ]
    const result = buildConversations(messages, 'proj', 'enc', 60)
    expect(result[0].used_plan_mode).toBe(true)
  })

  it('extracts model from first assistant message', () => {
    const messages = [
      makeUserMessage('2026-03-01T10:00:00.000Z', 'Hi', 'sess-1', 0),
      makeAssistantMessage('2026-03-01T10:00:05.000Z', undefined, 'sess-1', 1),
    ]
    const result = buildConversations(messages, 'proj', 'enc', 60)
    expect(result[0].model).toBe('claude-sonnet-4-20250514')
  })

  it('sets started_at and ended_at from timestamps', () => {
    const messages = [
      makeUserMessage('2026-03-01T10:00:00.000Z', 'First', 'sess-1', 0),
      makeAssistantMessage('2026-03-01T10:00:05.000Z', undefined, 'sess-1', 1),
      makeUserMessage('2026-03-01T10:30:00.000Z', 'Last', 'sess-1', 2),
      makeAssistantMessage('2026-03-01T10:30:05.000Z', undefined, 'sess-1', 3),
    ]
    const result = buildConversations(messages, 'proj', 'enc', 60)
    expect(result[0].started_at).toBe('2026-03-01T10:00:00.000Z')
    expect(result[0].ended_at).toBe('2026-03-01T10:30:05.000Z')
  })

  it('filters out conversations with no user prompts (only interrupted messages)', () => {
    const messages: TimestampedMessage[] = [
      // First conv: only interrupted message
      { type: 'user', timestamp: '2026-03-01T10:00:00.000Z', session_id: 'sess-1', file_position: 0, used_plan_mode: false },
      makeAssistantMessage('2026-03-01T10:00:05.000Z', undefined, 'sess-1', 1),
      // Second conv: real content
      makeUserMessage('2026-03-01T12:00:00.000Z', 'Real prompt', 'sess-1', 2),
      makeAssistantMessage('2026-03-01T12:00:05.000Z', undefined, 'sess-1', 3),
    ]
    const result = buildConversations(messages, 'proj', 'enc', 60)
    expect(result).toHaveLength(1)
    expect(result[0].user_prompts).toEqual(['Real prompt'])
  })

  it('handles single-message conversations', () => {
    const messages = [
      makeUserMessage('2026-03-01T10:00:00.000Z', 'Solo message', 'sess-1', 0),
    ]
    const result = buildConversations(messages, 'proj', 'enc', 60)
    expect(result).toHaveLength(1)
    expect(result[0].user_prompts).toEqual(['Solo message'])
    expect(result[0].user_message_count).toBe(1)
    expect(result[0].assistant_message_count).toBe(0)
  })

  it('handles messages from multiple sessions merged into one conversation', () => {
    // Two sessions with interleaved timestamps (same project, within gap)
    const messages = [
      makeUserMessage('2026-03-01T10:00:00.000Z', 'Sess1 msg1', 'sess-1', 0),
      makeAssistantMessage('2026-03-01T10:00:05.000Z', undefined, 'sess-1', 1),
      makeUserMessage('2026-03-01T10:05:00.000Z', 'Sess2 msg1', 'sess-2', 0),
      makeAssistantMessage('2026-03-01T10:05:05.000Z', undefined, 'sess-2', 1),
    ]
    const result = buildConversations(messages, 'proj', 'enc', 60)
    expect(result).toHaveLength(1)
    expect(result[0].session_ids).toEqual(['sess-1', 'sess-2'])
    expect(result[0].user_prompts).toEqual(['Sess1 msg1', 'Sess2 msg1'])
  })

  it('sorts messages by timestamp then file_position', () => {
    // Messages intentionally out of order
    const messages = [
      makeUserMessage('2026-03-01T10:10:00.000Z', 'Second', 'sess-1', 2),
      makeUserMessage('2026-03-01T10:00:00.000Z', 'First', 'sess-1', 0),
      makeAssistantMessage('2026-03-01T10:00:05.000Z', undefined, 'sess-1', 1),
    ]
    const result = buildConversations(messages, 'proj', 'enc', 60)
    expect(result).toHaveLength(1)
    expect(result[0].user_prompts).toEqual(['First', 'Second'])
  })

  it('uses file_position as tiebreaker for same timestamp', () => {
    const messages = [
      makeUserMessage('2026-03-01T10:00:00.000Z', 'User msg', 'sess-1', 0),
      makeAssistantMessage('2026-03-01T10:00:00.000Z', undefined, 'sess-1', 1),
    ]
    const result = buildConversations(messages, 'proj', 'enc', 60)
    expect(result).toHaveLength(1)
    expect(result[0].user_prompts).toEqual(['User msg'])
    expect(result[0].assistant_message_count).toBe(1)
  })

  it('assistant messages after last user message stay in same conversation', () => {
    const messages = [
      makeUserMessage('2026-03-01T10:00:00.000Z', 'Hello', 'sess-1', 0),
      makeAssistantMessage('2026-03-01T10:00:05.000Z', {
        input_tokens: 500, output_tokens: 200,
        cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
      }, 'sess-1', 1),
      // Gap
      makeUserMessage('2026-03-01T12:00:00.000Z', 'New conv', 'sess-1', 2),
      makeAssistantMessage('2026-03-01T12:00:05.000Z', {
        input_tokens: 300, output_tokens: 100,
        cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
      }, 'sess-1', 3),
    ]
    const result = buildConversations(messages, 'proj', 'enc', 60)
    expect(result).toHaveLength(2)
    expect(result[0].total_tokens).toBe(700) // 500+200
    expect(result[1].total_tokens).toBe(400) // 300+100
  })

  it('handles messages without timestamps (null timestamp)', () => {
    const messages: TimestampedMessage[] = [
      { type: 'user', timestamp: null, session_id: 'sess-1', file_position: 0, content: 'No timestamp', used_plan_mode: false },
      { type: 'assistant', timestamp: null, session_id: 'sess-1', file_position: 1, model: 'claude-sonnet-4-20250514' },
    ]
    const result = buildConversations(messages, 'proj', 'enc', 60)
    expect(result).toHaveLength(1)
    expect(result[0].started_at).toBeNull()
    expect(result[0].ended_at).toBeNull()
  })

  it('respects configurable gap threshold (15 minutes)', () => {
    const messages = [
      makeUserMessage('2026-03-01T10:00:00.000Z', 'First', 'sess-1', 0),
      makeUserMessage('2026-03-01T10:20:00.000Z', 'Second', 'sess-1', 1), // 20 min gap
    ]
    const result = buildConversations(messages, 'proj', 'enc', 15)
    expect(result).toHaveLength(2)
  })

  it('zero-pads conversation IDs to at least 3 digits', () => {
    const messages = [
      makeUserMessage('2026-03-01T10:00:00.000Z', 'Only one', 'sess-1', 0),
    ]
    const result = buildConversations(messages, 'proj', 'enc', 60)
    expect(result[0].id).toBe('enc:conv:000')
  })

  it('pads wider when many conversations exist', () => {
    // Create 1001 conversations via large gaps
    const messages: TimestampedMessage[] = []
    for (let i = 0; i <= 1000; i++) {
      const hour = Math.floor(i / 24)
      const day = Math.floor(hour / 24) + 1
      const h = hour % 24
      const ts = `2026-03-${String(day).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00.000Z`
      messages.push(makeUserMessage(ts, `Msg ${i}`, 'sess-1', i))
    }
    const result = buildConversations(messages, 'proj', 'enc', 0.001) // very short gap to split every message
    // With many conversations, IDs should be zero-padded to 4 digits
    expect(result.length).toBeGreaterThan(100)
    expect(result[0].id).toMatch(/enc:conv:\d{4}/)
  })

  it('extracts version and git_branch from messages', () => {
    const messages: TimestampedMessage[] = [
      { ...makeUserMessage('2026-03-01T10:00:00.000Z', 'Hi', 'sess-1', 0), claude_code_version: '2.1.44', git_branch: 'main' },
      makeAssistantMessage('2026-03-01T10:00:05.000Z', undefined, 'sess-1', 1),
    ]
    const result = buildConversations(messages, 'proj', 'enc', 60)
    expect(result[0].claude_code_version).toBe('2.1.44')
    expect(result[0].git_branch).toBe('main')
  })

  it('handles gap threshold of 0 (every message is a conversation)', () => {
    const messages = [
      makeUserMessage('2026-03-01T10:00:00.000Z', 'First', 'sess-1', 0),
      makeUserMessage('2026-03-01T10:00:01.000Z', 'Second', 'sess-1', 1),
    ]
    // gap=0 means any positive gap triggers split
    const result = buildConversations(messages, 'proj', 'enc', 0)
    expect(result).toHaveLength(2)
  })
})

// ─── getAllConversations ─────────────────────────────────────────────

describe('getAllConversations', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockOs.homedir.mockReturnValue('/home/testuser')
  })

  it('returns empty result when directory does not exist', () => {
    mockFs.existsSync.mockReturnValue(false)
    const result = getAllConversations()
    expect(result.conversations).toEqual([])
    expect(result.metadata.total_conversations).toBe(0)
    expect(result.metadata.total_projects).toBe(0)
    expect(result.metadata.total_prompts).toBe(0)
  })

  it('discovers and assembles conversations from session files', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockImplementation((dir: any) => {
      const d = String(dir)
      if (d.endsWith('projects')) return ['project-a'] as any
      if (d.endsWith('project-a')) return ['sess-1.jsonl'] as any
      return [] as any
    })
    mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any)
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Hello', { sessionId: 'sess-1', timestamp: '2026-03-01T10:00:00Z' }),
      assistantMsg({ timestamp: '2026-03-01T10:01:00Z' }),
    ))

    const result = getAllConversations()
    expect(result.conversations).toHaveLength(1)
    expect(result.conversations[0].user_prompts).toEqual(['Hello'])
    expect(result.metadata.total_conversations).toBe(1)
  })

  it('merges multiple session files in same project into conversations', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockImplementation((dir: any) => {
      const d = String(dir)
      if (d.endsWith('projects')) return ['proj'] as any
      if (d.endsWith('proj')) return ['sess-1.jsonl', 'sess-2.jsonl'] as any
      return [] as any
    })
    mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any)
    mockFs.readFileSync.mockImplementation((filepath: any) => {
      const f = String(filepath)
      if (f.includes('sess-1')) {
        return jsonl(
          userMsg('Morning', { sessionId: 'sess-1', timestamp: '2026-03-01T09:00:00Z' }),
          assistantMsg({ timestamp: '2026-03-01T09:01:00Z' }),
        )
      }
      // Same day, within gap — should be same conversation
      return jsonl(
        userMsg('Afternoon', { sessionId: 'sess-2', timestamp: '2026-03-01T09:30:00Z' }),
        assistantMsg({ timestamp: '2026-03-01T09:31:00Z' }),
      )
    })

    const result = getAllConversations(undefined, undefined, undefined, undefined, 60)
    expect(result.conversations).toHaveLength(1)
    expect(result.conversations[0].user_prompts).toEqual(['Morning', 'Afternoon'])
    expect(result.conversations[0].session_ids).toEqual(['sess-1', 'sess-2'])
  })

  it('splits conversations across large time gaps', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockImplementation((dir: any) => {
      const d = String(dir)
      if (d.endsWith('projects')) return ['proj'] as any
      if (d.endsWith('proj')) return ['sess-1.jsonl'] as any
      return [] as any
    })
    mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any)
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Morning', { sessionId: 'sess-1', timestamp: '2026-03-01T09:00:00Z' }),
      assistantMsg({ timestamp: '2026-03-01T09:01:00Z' }),
      userMsg('Evening', { sessionId: 'sess-1', timestamp: '2026-03-01T20:00:00Z' }),
      assistantMsg({ timestamp: '2026-03-01T20:01:00Z' }),
    ))

    const result = getAllConversations(undefined, undefined, undefined, undefined, 60)
    expect(result.conversations).toHaveLength(2)
  })

  it('applies project filter', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockImplementation((dir: any) => {
      const d = String(dir)
      if (d.endsWith('projects')) return ['proj-a', 'proj-b'] as any
      if (d.endsWith('proj-a')) return ['s1.jsonl'] as any
      if (d.endsWith('proj-b')) return ['s2.jsonl'] as any
      return [] as any
    })
    mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any)
    mockFs.readFileSync.mockImplementation((filepath: any) => {
      const f = String(filepath)
      if (f.includes('s1')) {
        return jsonl(userMsg('Hi', { sessionId: 's1', cwd: '/home/user/alpha' }), assistantMsg())
      }
      return jsonl(userMsg('Hi', { sessionId: 's2', cwd: '/home/user/beta' }), assistantMsg())
    })

    const result = getAllConversations(undefined, 'alpha')
    expect(result.conversations).toHaveLength(1)
    expect(result.conversations[0].project).toBe('alpha')
  })

  it('applies limit', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockImplementation((dir: any) => {
      const d = String(dir)
      if (d.endsWith('projects')) return ['proj'] as any
      return ['s1.jsonl'] as any
    })
    mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any)
    // Three conversations in one file (large gaps)
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('First', { sessionId: 's1', timestamp: '2026-03-01T08:00:00Z' }),
      assistantMsg({ timestamp: '2026-03-01T08:01:00Z' }),
      userMsg('Second', { sessionId: 's1', timestamp: '2026-03-01T12:00:00Z' }),
      assistantMsg({ timestamp: '2026-03-01T12:01:00Z' }),
      userMsg('Third', { sessionId: 's1', timestamp: '2026-03-01T20:00:00Z' }),
      assistantMsg({ timestamp: '2026-03-01T20:01:00Z' }),
    ))

    const result = getAllConversations(2, undefined, undefined, undefined, 60)
    expect(result.conversations).toHaveLength(2)
  })

  it('sorts conversations by started_at descending', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockImplementation((dir: any) => {
      const d = String(dir)
      if (d.endsWith('projects')) return ['proj'] as any
      return ['s1.jsonl'] as any
    })
    mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any)
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Old', { sessionId: 's1', timestamp: '2026-01-01T10:00:00Z' }),
      assistantMsg({ timestamp: '2026-01-01T10:01:00Z' }),
      userMsg('New', { sessionId: 's1', timestamp: '2026-03-01T10:00:00Z' }),
      assistantMsg({ timestamp: '2026-03-01T10:01:00Z' }),
    ))

    const result = getAllConversations(undefined, undefined, undefined, undefined, 60)
    expect(result.conversations[0].user_prompts).toEqual(['New'])
    expect(result.conversations[1].user_prompts).toEqual(['Old'])
  })

  it('uses custom sessionDataPath', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockImplementation((dir: any) => {
      const d = String(dir)
      if (d === '/custom/path') return ['proj'] as any
      if (d.endsWith('proj')) return ['s1.jsonl'] as any
      return [] as any
    })
    mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any)
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Hi', { sessionId: 's1' }),
      assistantMsg(),
    ))

    const result = getAllConversations(undefined, undefined, '/custom/path')
    expect(result.conversations).toHaveLength(1)
    expect(mockFs.existsSync).toHaveBeenCalledWith('/custom/path')
  })

  it('skips sidechain sessions', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockImplementation((dir: any) => {
      const d = String(dir)
      if (d.endsWith('projects')) return ['proj'] as any
      if (d.endsWith('proj')) return ['agent.jsonl'] as any
      return [] as any
    })
    mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any)
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Subagent prompt', { isSidechain: true }),
      assistantMsg(),
    ))

    const result = getAllConversations()
    expect(result.conversations).toHaveLength(0)
  })

  it('handles empty data gracefully', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockImplementation((dir: any) => {
      const d = String(dir)
      if (d.endsWith('projects')) return ['proj'] as any
      return [] as any
    })
    mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any)

    const result = getAllConversations()
    expect(result.conversations).toEqual([])
  })

  it('metadata counts are correct', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockImplementation((dir: any) => {
      const d = String(dir)
      if (d.endsWith('projects')) return ['proj-a', 'proj-b'] as any
      if (d.endsWith('proj-a')) return ['s1.jsonl'] as any
      if (d.endsWith('proj-b')) return ['s2.jsonl'] as any
      return [] as any
    })
    mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any)
    mockFs.readFileSync.mockImplementation((filepath: any) => {
      const f = String(filepath)
      if (f.includes('s1')) {
        return jsonl(
          userMsg('P1', { sessionId: 's1', cwd: '/a', timestamp: '2026-03-01T10:00:00Z' }),
          userMsg('P2', { timestamp: '2026-03-01T10:05:00Z' }),
          assistantMsg(),
        )
      }
      return jsonl(
        userMsg('P3', { sessionId: 's2', cwd: '/b', timestamp: '2026-03-02T10:00:00Z' }),
        assistantMsg(),
      )
    })

    const result = getAllConversations()
    expect(result.metadata.total_conversations).toBe(2)
    expect(result.metadata.total_projects).toBe(2)
    expect(result.metadata.total_prompts).toBe(3)
    expect(result.metadata.extracted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('discovers sessions in UUID subdirectories', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockImplementation((dir: any) => {
      const d = String(dir)
      if (d.endsWith('projects')) return ['proj'] as any
      if (d.endsWith('proj')) return ['abc-uuid-dir'] as any
      if (d.endsWith('abc-uuid-dir')) return ['session.jsonl'] as any
      return [] as any
    })
    mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any)
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Nested session', { sessionId: 'nested-1' }),
      assistantMsg(),
    ))

    const result = getAllConversations()
    expect(result.conversations).toHaveLength(1)
  })
})

// ─── computeContentHash ────────────────────────────────────────────

describe('computeContentHash', () => {
  it('produces a stable hash from conversation properties', () => {
    const hash = computeContentHash(
      '-home-test-project',
      ['2026-03-01T10:00:00.000Z'],
      '2026-03-01T10:00:00.000Z',
      ['Hello world'],
      1,
    )
    expect(hash).toBe('-home-test-project:2026-03-01T10:00:00.000Z:1:Hello world')
  })

  it('uses first prompt timestamp over started_at', () => {
    const hash = computeContentHash(
      '-home-proj',
      ['2026-03-01T10:05:00.000Z', '2026-03-01T10:10:00.000Z'],
      '2026-03-01T10:00:00.000Z',
      ['First prompt', 'Second prompt'],
      2,
    )
    expect(hash).toContain('2026-03-01T10:05:00.000Z')
    expect(hash).not.toContain('2026-03-01T10:00:00.000Z')
  })

  it('falls back to started_at when no prompt timestamps', () => {
    const hash = computeContentHash('-home-proj', [], '2026-03-01T10:00:00.000Z', ['Prompt'], 1)
    expect(hash).toContain('2026-03-01T10:00:00.000Z')
  })

  it('uses "unknown" when no timestamps available', () => {
    const hash = computeContentHash('-home-proj', [], null, ['Prompt'], 1)
    expect(hash).toContain(':unknown:')
  })

  it('truncates first prompt to 50 chars', () => {
    const longPrompt = 'A'.repeat(100)
    const hash = computeContentHash('-proj', ['ts'], null, [longPrompt], 1)
    expect(hash).toBe(`-proj:ts:1:${'A'.repeat(50)}`)
  })

  it('handles empty user_prompts', () => {
    const hash = computeContentHash('-proj', ['ts'], null, [], 0)
    expect(hash).toBe('-proj:ts:0:')
  })
})

// ─── content_hash in buildConversations ─────────────────────────────

describe('buildConversations content_hash', () => {
  function makeTimestampedMsg(type: string, timestamp: string, content?: string, extra: Record<string, any> = {}): any {
    return {
      type,
      timestamp,
      session_id: 'sess-1',
      file_position: 0,
      content: type === 'user' ? (content || 'Prompt') : undefined,
      ...extra,
    }
  }

  it('sets content_hash on each conversation', () => {
    const messages = [
      makeTimestampedMsg('user', '2026-03-01T10:00:00.000Z', 'Hello'),
      makeTimestampedMsg('assistant', '2026-03-01T10:00:05.000Z'),
    ]
    const convs = buildConversations(messages, 'proj', '-home-proj', 60)
    expect(convs).toHaveLength(1)
    expect(convs[0].content_hash).toBe('-home-proj:2026-03-01T10:00:00.000Z:1:Hello')
  })

  it('content_hash is stable regardless of index position', () => {
    // Two conversations from same project
    const messages = [
      makeTimestampedMsg('user', '2026-03-01T10:00:00.000Z', 'First conv'),
      makeTimestampedMsg('assistant', '2026-03-01T10:00:05.000Z'),
      // 2 hour gap -> new conversation
      makeTimestampedMsg('user', '2026-03-01T12:00:00.000Z', 'Second conv'),
      makeTimestampedMsg('assistant', '2026-03-01T12:00:05.000Z'),
    ]
    const convs = buildConversations(messages, 'proj', '-home-proj', 60)
    expect(convs).toHaveLength(2)
    const hash0 = convs[0].content_hash
    const hash1 = convs[1].content_hash

    // Now prepend a new conversation (simulating new data shifting indices)
    const newMessages = [
      makeTimestampedMsg('user', '2026-03-01T08:00:00.000Z', 'New early conv'),
      makeTimestampedMsg('assistant', '2026-03-01T08:00:05.000Z'),
      ...messages,
    ]
    const newConvs = buildConversations(newMessages, 'proj', '-home-proj', 60)
    expect(newConvs).toHaveLength(3)

    // IDs shifted (old conv:000 is now conv:001), but content_hashes remain the same
    expect(newConvs[1].id).not.toBe(convs[0].id) // same content, different index-based ID
    expect(newConvs[1].content_hash).toBe(hash0) // old conv 0 is now at index 1
    expect(newConvs[2].content_hash).toBe(hash1) // old conv 1 is now at index 2
  })
})

describe('/clear as conversation boundary', () => {
  function makeMsg(type: string, ts: string, overrides: Partial<TimestampedMessage> = {}): TimestampedMessage {
    return {
      type,
      timestamp: ts,
      session_id: 'sess-1',
      file_position: 0,
      ...overrides,
    }
  }

  it('splits conversation at /clear command', () => {
    const messages: TimestampedMessage[] = [
      makeMsg('user', '2026-01-01T10:00:00Z', { content: 'first prompt', file_position: 0 }),
      makeMsg('user', '2026-01-01T10:05:00Z', { content: 'second prompt', file_position: 1 }),
      makeMsg('user', '2026-01-01T10:06:00Z', { is_clear_command: true, file_position: 2 }),
      makeMsg('user', '2026-01-01T10:07:00Z', { content: 'third prompt', file_position: 3 }),
    ]
    const convs = buildConversations(messages, 'test', '-test', 60)
    expect(convs).toHaveLength(2)
    expect(convs[0].user_prompts).toEqual(['first prompt', 'second prompt'])
    expect(convs[1].user_prompts).toEqual(['third prompt'])
  })

  it('does not create empty conversation when /clear is at the start', () => {
    const messages: TimestampedMessage[] = [
      makeMsg('user', '2026-01-01T10:00:00Z', { is_clear_command: true, file_position: 0 }),
      makeMsg('user', '2026-01-01T10:01:00Z', { content: 'first prompt', file_position: 1 }),
    ]
    const convs = buildConversations(messages, 'test', '-test', 60)
    expect(convs).toHaveLength(1)
    expect(convs[0].user_prompts).toEqual(['first prompt'])
  })

  it('does not create empty conversation when /clear is at the end', () => {
    const messages: TimestampedMessage[] = [
      makeMsg('user', '2026-01-01T10:00:00Z', { content: 'first prompt', file_position: 0 }),
      makeMsg('user', '2026-01-01T10:05:00Z', { is_clear_command: true, file_position: 1 }),
    ]
    const convs = buildConversations(messages, 'test', '-test', 60)
    expect(convs).toHaveLength(1)
    expect(convs[0].user_prompts).toEqual(['first prompt'])
  })

  it('splits even without inactivity gap', () => {
    const messages: TimestampedMessage[] = [
      makeMsg('user', '2026-01-01T10:00:00Z', { content: 'prompt 1', file_position: 0 }),
      makeMsg('user', '2026-01-01T10:00:30Z', { is_clear_command: true, file_position: 1 }),
      makeMsg('user', '2026-01-01T10:01:00Z', { content: 'prompt 2', file_position: 2 }),
    ]
    // 60-minute gap, but /clear splits at 30 seconds
    const convs = buildConversations(messages, 'test', '-test', 60)
    expect(convs).toHaveLength(2)
  })

  it('does NOT split on /compact', () => {
    const messages: TimestampedMessage[] = [
      makeMsg('user', '2026-01-01T10:00:00Z', { content: 'prompt 1', file_position: 0 }),
      makeMsg('user', '2026-01-01T10:05:00Z', { content: 'compact text', file_position: 1 }),
      makeMsg('user', '2026-01-01T10:10:00Z', { content: 'prompt 2', file_position: 2 }),
    ]
    const convs = buildConversations(messages, 'test', '-test', 60)
    expect(convs).toHaveLength(1)
    expect(convs[0].user_prompts).toHaveLength(3)
  })

  it('handles multiple consecutive /clear commands', () => {
    const messages: TimestampedMessage[] = [
      makeMsg('user', '2026-01-01T10:00:00Z', { content: 'prompt 1', file_position: 0 }),
      makeMsg('user', '2026-01-01T10:05:00Z', { is_clear_command: true, file_position: 1 }),
      makeMsg('user', '2026-01-01T10:06:00Z', { is_clear_command: true, file_position: 2 }),
      makeMsg('user', '2026-01-01T10:07:00Z', { content: 'prompt 2', file_position: 3 }),
    ]
    const convs = buildConversations(messages, 'test', '-test', 60)
    expect(convs).toHaveLength(2)
    expect(convs[0].user_prompts).toEqual(['prompt 1'])
    expect(convs[1].user_prompts).toEqual(['prompt 2'])
  })

  it('does not count /clear in user_message_count', () => {
    const messages: TimestampedMessage[] = [
      makeMsg('user', '2026-01-01T10:00:00Z', { content: 'prompt 1', file_position: 0 }),
      makeMsg('user', '2026-01-01T10:05:00Z', { is_clear_command: true, file_position: 1 }),
      makeMsg('user', '2026-01-01T10:10:00Z', { content: 'prompt 2', file_position: 2 }),
    ]
    const convs = buildConversations(messages, 'test', '-test', 60)
    expect(convs[0].user_message_count).toBe(1)
    expect(convs[1].user_message_count).toBe(1)
  })

  it('does not include /clear in user_prompts', () => {
    const messages: TimestampedMessage[] = [
      makeMsg('user', '2026-01-01T10:00:00Z', { content: 'prompt 1', file_position: 0 }),
      makeMsg('user', '2026-01-01T10:05:00Z', { is_clear_command: true, content: undefined, file_position: 1 }),
      makeMsg('user', '2026-01-01T10:10:00Z', { content: 'prompt 2', file_position: 2 }),
    ]
    const convs = buildConversations(messages, 'test', '-test', 60)
    const allPrompts = convs.flatMap(c => c.user_prompts)
    expect(allPrompts).toEqual(['prompt 1', 'prompt 2'])
  })
})
