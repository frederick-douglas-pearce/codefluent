jest.mock('fs')
jest.mock('os')

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { extractUserText, parseSessionFile, getAllSessions } from '../../src/parser'

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
  return {
    type: 'assistant',
    message: {
      role: 'assistant',
      model: 'claude-sonnet-4-20250514',
      content: [{ type: 'text', text: 'Response' }],
    },
    timestamp: '2026-03-01T10:00:05.000Z',
    ...extra,
  }
}

describe('extractUserText', () => {
  it('returns trimmed string content', () => {
    expect(extractUserText('  hello world  ')).toBe('hello world')
  })

  it('returns empty string for empty string input', () => {
    expect(extractUserText('')).toBe('')
  })

  it('extracts text blocks from array content', () => {
    const content = [
      { type: 'text', text: 'First part' },
      { type: 'text', text: 'Second part' },
    ]
    expect(extractUserText(content)).toBe('First part Second part')
  })

  it('skips non-text blocks in array content', () => {
    const content = [
      { type: 'text', text: 'Hello' },
      { type: 'image', source: { data: 'abc' } },
      { type: 'text', text: 'World' },
    ]
    expect(extractUserText(content)).toBe('Hello World')
  })

  it('handles empty array', () => {
    expect(extractUserText([])).toBe('')
  })

  it('returns empty string for null', () => {
    expect(extractUserText(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(extractUserText(undefined)).toBe('')
  })

  it('returns empty string for number', () => {
    expect(extractUserText(42)).toBe('')
  })

  it('handles blocks with missing text property', () => {
    const content = [{ type: 'text' }]
    expect(extractUserText(content)).toBe('')
  })

  it('handles blocks with missing type property', () => {
    const content = [{ text: 'orphan' }]
    expect(extractUserText(content)).toBe('')
  })

  it('skips whitespace-only text blocks', () => {
    const content = [
      { type: 'text', text: '   ' },
      { type: 'text', text: 'real content' },
    ]
    expect(extractUserText(content)).toBe('real content')
  })
})

describe('parseSessionFile', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns null for unreadable file', () => {
    mockFs.readFileSync.mockImplementation(() => { throw new Error('ENOENT') })
    expect(parseSessionFile('/fake/session.jsonl')).toBeNull()
  })

  it('returns null for empty file', () => {
    mockFs.readFileSync.mockReturnValue('')
    expect(parseSessionFile('/fake/session.jsonl')).toBeNull()
  })

  it('returns null for file with no user prompts', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(assistantMsg()))
    expect(parseSessionFile('/fake/session.jsonl')).toBeNull()
  })

  it('extracts string format content', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Hello Claude'),
      assistantMsg(),
    ))
    const result = parseSessionFile('/fake/project/session.jsonl')
    expect(result).not.toBeNull()
    expect(result!.user_prompts).toEqual(['Hello Claude'])
  })

  it('extracts array format content', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg([{ type: 'text', text: 'Array content' }]),
      assistantMsg(),
    ))
    const result = parseSessionFile('/fake/project/session.jsonl')
    expect(result!.user_prompts).toEqual(['Array content'])
  })

  it('uses sessionId from field when available', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Hi', { sessionId: 'custom-id' }),
      assistantMsg(),
    ))
    const result = parseSessionFile('/fake/project/session.jsonl')
    expect(result!.id).toBe('custom-id')
  })

  it('falls back to filename for session ID', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      { type: 'user', message: { role: 'user', content: 'Hi' }, timestamp: '2026-03-01T10:00:00Z' },
      assistantMsg(),
    ))
    const result = parseSessionFile('/fake/project/abc-123.jsonl')
    expect(result!.id).toBe('abc-123')
  })

  it('derives project name from cwd', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Hi', { cwd: '/home/user/my-project' }),
      assistantMsg(),
    ))
    const result = parseSessionFile('/fake/encoded-path/session.jsonl')
    expect(result!.project).toBe('my-project')
  })

  it('falls back to directory name for project', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      { type: 'user', message: { role: 'user', content: 'Hi' }, timestamp: '2026-03-01T10:00:00Z' },
      assistantMsg(),
    ))
    const result = parseSessionFile('/fake/fallback-project/session.jsonl')
    expect(result!.project).toBe('fallback-project')
  })

  it('truncates user prompts at 2000 chars', () => {
    const longPrompt = 'A'.repeat(3000)
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg(longPrompt),
      assistantMsg(),
    ))
    const result = parseSessionFile('/fake/project/session.jsonl')
    expect(result!.user_prompts[0]).toHaveLength(2000)
  })

  it('filters out "[Request interrupted by user for tool use]"', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Real prompt'),
      userMsg('[Request interrupted by user for tool use]'),
      assistantMsg(),
    ))
    const result = parseSessionFile('/fake/project/session.jsonl')
    expect(result!.user_prompts).toEqual(['Real prompt'])
  })

  it('skips malformed JSONL lines silently', () => {
    const raw = JSON.stringify(userMsg('Good line')) + '\n{bad json\n' + JSON.stringify(assistantMsg())
    mockFs.readFileSync.mockReturnValue(raw)
    const result = parseSessionFile('/fake/project/session.jsonl')
    expect(result).not.toBeNull()
    expect(result!.user_prompts).toEqual(['Good line'])
  })

  it('filters SKIP_TYPES messages', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Hello'),
      { type: 'file-history-snapshot', data: {} },
      { type: 'tool_result', content: 'result' },
      { type: 'progress', percent: 50 },
      { type: 'hook_progress', data: {} },
      { type: 'bash_progress', data: {} },
      { type: 'system', content: 'sys' },
      { type: 'create', file: 'test.ts' },
      assistantMsg(),
    ))
    const result = parseSessionFile('/fake/project/session.jsonl')
    expect(result!.user_message_count).toBe(1)
    expect(result!.assistant_message_count).toBe(1)
  })

  it('counts user and assistant messages', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('First'),
      assistantMsg(),
      userMsg('Second'),
      assistantMsg(),
      userMsg('Third'),
      assistantMsg(),
    ))
    const result = parseSessionFile('/fake/project/session.jsonl')
    expect(result!.user_message_count).toBe(3)
    expect(result!.assistant_message_count).toBe(3)
  })

  it('counts top-level tool_use messages', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Do something'),
      { type: 'tool_use', name: 'Read', timestamp: '2026-03-01T10:00:01Z' },
      assistantMsg(),
    ))
    const result = parseSessionFile('/fake/project/session.jsonl')
    expect(result!.tool_use_count).toBe(1)
    expect(result!.tools_used).toContain('Read')
  })

  it('counts nested tool_use in assistant content blocks', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Build it'),
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          model: 'claude-sonnet-4-20250514',
          content: [
            { type: 'tool_use', name: 'Write' },
            { type: 'tool_use', name: 'Bash' },
            { type: 'text', text: 'Done' },
          ],
        },
        timestamp: '2026-03-01T10:00:05Z',
      },
    ))
    const result = parseSessionFile('/fake/project/session.jsonl')
    expect(result!.tool_use_count).toBe(2)
    expect(result!.tools_used).toEqual(expect.arrayContaining(['Bash', 'Write']))
  })

  it('extracts tool name from nested content in tool_use message', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Do it'),
      {
        type: 'tool_use',
        message: {
          content: [{ type: 'tool_use', name: 'Grep' }],
        },
        timestamp: '2026-03-01T10:00:01Z',
      },
      assistantMsg(),
    ))
    const result = parseSessionFile('/fake/project/session.jsonl')
    expect(result!.tools_used).toContain('Grep')
  })

  it('counts thinking messages', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Think hard'),
      { type: 'thinking', content: 'pondering...', timestamp: '2026-03-01T10:00:01Z' },
      { type: 'thinking', content: 'more thought', timestamp: '2026-03-01T10:00:02Z' },
      assistantMsg(),
    ))
    const result = parseSessionFile('/fake/project/session.jsonl')
    expect(result!.thinking_count).toBe(2)
  })

  it('detects plan mode from planContent field', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Plan this', { planContent: 'My implementation plan...' }),
      assistantMsg(),
    ))
    const result = parseSessionFile('/fake/project/session.jsonl')
    expect(result!.used_plan_mode).toBe(true)
  })

  it('defaults used_plan_mode to false', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('No plan'),
      assistantMsg(),
    ))
    const result = parseSessionFile('/fake/project/session.jsonl')
    expect(result!.used_plan_mode).toBe(false)
  })

  it('extracts model from assistant message', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Hello'),
      assistantMsg(),
    ))
    const result = parseSessionFile('/fake/project/session.jsonl')
    expect(result!.model).toBe('claude-sonnet-4-20250514')
  })

  it('extracts version and git branch', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Hello', { version: '2.1.44', gitBranch: 'feature/test' }),
      assistantMsg(),
    ))
    const result = parseSessionFile('/fake/project/session.jsonl')
    expect(result!.claude_code_version).toBe('2.1.44')
    expect(result!.git_branch).toBe('feature/test')
  })

  it('sorts timestamps to determine started_at and ended_at', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('First', { timestamp: '2026-03-01T12:00:00Z' }),
      assistantMsg({ timestamp: '2026-03-01T10:00:00Z' }),
      userMsg('Second', { timestamp: '2026-03-01T14:00:00Z' }),
    ))
    const result = parseSessionFile('/fake/project/session.jsonl')
    expect(result!.started_at).toBe('2026-03-01T10:00:00Z')
    expect(result!.ended_at).toBe('2026-03-01T14:00:00Z')
  })

  it('returns null timestamps when no timestamps present', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      { type: 'user', sessionId: 's1', message: { role: 'user', content: 'Hi' } },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Bye' }] } },
    ))
    const result = parseSessionFile('/fake/project/session.jsonl')
    expect(result!.started_at).toBeNull()
    expect(result!.ended_at).toBeNull()
  })

  it('sorts tools_used alphabetically', () => {
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
            { type: 'tool_use', name: 'Read' },
          ],
        },
        timestamp: '2026-03-01T10:00:05Z',
      },
    ))
    const result = parseSessionFile('/fake/project/session.jsonl')
    expect(result!.tools_used).toEqual(['Bash', 'Read', 'Write'])
  })

  it('sets project_path_encoded from directory name', () => {
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Hi'),
      assistantMsg(),
    ))
    const result = parseSessionFile('/home/.claude/projects/-home-user-my-project/session.jsonl')
    expect(result!.project_path_encoded).toBe('-home-user-my-project')
  })
})

describe('getAllSessions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockOs.homedir.mockReturnValue('/home/testuser')
  })

  it('returns empty result when ~/.claude/projects/ does not exist', () => {
    mockFs.existsSync.mockReturnValue(false)
    const result = getAllSessions()
    expect(result.sessions).toEqual([])
    expect(result.metadata.total_sessions).toBe(0)
    expect(result.metadata.total_projects).toBe(0)
    expect(result.metadata.total_prompts).toBe(0)
    expect(result.metadata.extracted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('discovers sessions across project directories', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockImplementation((dir: any) => {
      const d = String(dir)
      if (d.endsWith('projects')) return ['project-a', 'project-b'] as any
      if (d.endsWith('project-a')) return ['sess-1.jsonl'] as any
      if (d.endsWith('project-b')) return ['sess-2.jsonl'] as any
      return [] as any
    })
    mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any)
    mockFs.readFileSync.mockImplementation((filepath: any) => {
      const f = String(filepath)
      if (f.includes('sess-1')) {
        return jsonl(
          userMsg('Hello', { sessionId: 'sess-1', timestamp: '2026-03-01T10:00:00Z' }),
          assistantMsg({ timestamp: '2026-03-01T10:01:00Z' }),
        )
      }
      if (f.includes('sess-2')) {
        return jsonl(
          userMsg('World', { sessionId: 'sess-2', timestamp: '2026-03-02T10:00:00Z' }),
          assistantMsg({ timestamp: '2026-03-02T10:01:00Z' }),
        )
      }
      return ''
    })

    const result = getAllSessions()
    expect(result.sessions).toHaveLength(2)
    expect(result.metadata.total_sessions).toBe(2)
    expect(result.metadata.total_projects).toBe(2)
  })

  it('skips non-directory entries', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockImplementation((dir: any) => {
      const d = String(dir)
      if (d.endsWith('projects')) return ['project-a', 'a-file.txt'] as any
      if (d.endsWith('project-a')) return ['sess-1.jsonl'] as any
      return [] as any
    })
    mockFs.statSync.mockImplementation((p: any) => {
      const s = String(p)
      return { isDirectory: () => !s.endsWith('.txt') } as any
    })
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('Hi', { sessionId: 's1' }),
      assistantMsg(),
    ))

    const result = getAllSessions()
    expect(result.sessions).toHaveLength(1)
  })

  it('sorts sessions by started_at descending', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockImplementation((dir: any) => {
      const d = String(dir)
      if (d.endsWith('projects')) return ['proj'] as any
      return ['old.jsonl', 'new.jsonl'] as any
    })
    mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any)
    mockFs.readFileSync.mockImplementation((filepath: any) => {
      const f = String(filepath)
      if (f.includes('old')) {
        return jsonl(
          userMsg('Old', { sessionId: 'old', timestamp: '2026-01-01T00:00:00Z' }),
          assistantMsg({ timestamp: '2026-01-01T00:01:00Z' }),
        )
      }
      return jsonl(
        userMsg('New', { sessionId: 'new', timestamp: '2026-03-01T00:00:00Z' }),
        assistantMsg({ timestamp: '2026-03-01T00:01:00Z' }),
      )
    })

    const result = getAllSessions()
    expect(result.sessions[0].id).toBe('new')
    expect(result.sessions[1].id).toBe('old')
  })

  it('applies project filter', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockImplementation((dir: any) => {
      const d = String(dir)
      if (d.endsWith('projects')) return ['proj'] as any
      return ['s1.jsonl', 's2.jsonl'] as any
    })
    mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any)
    mockFs.readFileSync.mockImplementation((filepath: any) => {
      const f = String(filepath)
      if (f.includes('s1')) {
        return jsonl(
          userMsg('Hi', { sessionId: 's1', cwd: '/home/user/alpha' }),
          assistantMsg(),
        )
      }
      return jsonl(
        userMsg('Hi', { sessionId: 's2', cwd: '/home/user/beta' }),
        assistantMsg(),
      )
    })

    const result = getAllSessions(undefined, 'alpha')
    expect(result.sessions).toHaveLength(1)
    expect(result.sessions[0].project).toBe('alpha')
  })

  it('applies limit', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockImplementation((dir: any) => {
      const d = String(dir)
      if (d.endsWith('projects')) return ['proj'] as any
      return ['s1.jsonl', 's2.jsonl', 's3.jsonl'] as any
    })
    mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any)
    mockFs.readFileSync.mockImplementation((filepath: any) => {
      const f = String(filepath)
      const id = path.basename(f, '.jsonl')
      return jsonl(
        userMsg('Hi', { sessionId: id }),
        assistantMsg(),
      )
    })

    const result = getAllSessions(2)
    expect(result.sessions).toHaveLength(2)
  })

  it('applies both project filter and limit', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockImplementation((dir: any) => {
      const d = String(dir)
      if (d.endsWith('projects')) return ['proj'] as any
      return ['s1.jsonl', 's2.jsonl', 's3.jsonl'] as any
    })
    mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any)
    mockFs.readFileSync.mockImplementation((filepath: any) => {
      const f = String(filepath)
      const id = path.basename(f, '.jsonl')
      return jsonl(
        userMsg('Hi', { sessionId: id, cwd: '/home/user/myproj' }),
        assistantMsg(),
      )
    })

    const result = getAllSessions(2, 'myproj')
    expect(result.sessions).toHaveLength(2)
    expect(result.metadata.total_sessions).toBe(2)
  })

  it('computes metadata counts correctly', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockImplementation((dir: any) => {
      const d = String(dir)
      if (d.endsWith('projects')) return ['proj'] as any
      return ['s1.jsonl'] as any
    })
    mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any)
    mockFs.readFileSync.mockReturnValue(jsonl(
      userMsg('First', { sessionId: 's1' }),
      userMsg('Second'),
      userMsg('Third'),
      assistantMsg(),
    ))

    const result = getAllSessions()
    expect(result.metadata.total_prompts).toBe(3)
    expect(result.metadata.total_sessions).toBe(1)
    expect(result.metadata.total_projects).toBe(1)
  })

  it('produces ISO timestamp for extracted_at', () => {
    mockFs.existsSync.mockReturnValue(false)
    const result = getAllSessions()
    expect(result.metadata.extracted_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('handles null started_at in sort without crashing', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockImplementation((dir: any) => {
      const d = String(dir)
      if (d.endsWith('projects')) return ['proj'] as any
      return ['s1.jsonl', 's2.jsonl'] as any
    })
    mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any)
    mockFs.readFileSync.mockImplementation((filepath: any) => {
      const f = String(filepath)
      if (f.includes('s1')) {
        // No timestamps → started_at will be null
        return jsonl(
          { type: 'user', sessionId: 's1', message: { role: 'user', content: 'Hi' } },
          { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Ok' }] } },
        )
      }
      return jsonl(
        userMsg('Hi', { sessionId: 's2' }),
        assistantMsg(),
      )
    })

    expect(() => getAllSessions()).not.toThrow()
    const result = getAllSessions()
    expect(result.sessions).toHaveLength(2)
  })
})
