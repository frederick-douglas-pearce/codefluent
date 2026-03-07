import * as vscode from 'vscode'
import { CodeFluentViewProvider } from '../../src/webviewProvider'

jest.mock('fs', () => {
  const actual = jest.requireActual('fs')
  return {
    ...actual,
    readFileSync: jest.fn((...args: any[]) => {
      const filepath = args[0] as string
      if (filepath.endsWith('index.html')) {
        return '<html>{{styleUri}}{{scriptUri}}{{chartUri}}{{nonce}}{{cspSource}}</html>'
      }
      if (filepath.endsWith('benchmarks.json')) {
        return JSON.stringify({ benchmarks: { expert: { min_score: 85 } } })
      }
      if (filepath.endsWith('CLAUDE.md') && filepath.includes('my-project')) {
        return '# My Project\nAlways use TypeScript.'
      }
      return actual.readFileSync(...args)
    }),
  }
})

jest.mock('../../src/parser')
jest.mock('../../src/usage')
jest.mock('../../src/scoring', () => {
  const actual = jest.requireActual('../../src/scoring')
  return {
    ...actual,
    scoreSessions: jest.fn(),
    computeAggregate: jest.fn(),
    scoreClaudeMd: jest.fn(),
    computeScoreHistory: jest.fn().mockReturnValue([]),
    optimizePrompt: jest.fn(),
    scoreSinglePrompt: jest.fn(),
  }
})
jest.mock('../../src/quickwins')
jest.mock('@anthropic-ai/sdk')

import { getDefaultShell, getShellArgs, getClaudeCommand, escapePromptForShell } from '../../src/platform'

import { getAllSessions } from '../../src/parser'
import { getUsageData } from '../../src/usage'
import { scoreSessions, computeAggregate, scoreClaudeMd, computeScoreHistory, CONFIG_SCORING_PROMPT_VERSION, optimizePrompt, scoreSinglePrompt } from '../../src/scoring'
import { getQuickWins } from '../../src/quickwins'

function makeContext(overrides: Partial<Record<string, any>> = {}): any {
  return {
    extensionUri: vscode.Uri.file('/fake/extension'),
    globalStorageUri: vscode.Uri.file('/tmp/codefluent-test-storage'),
    secrets: {
      get: jest.fn().mockResolvedValue(undefined),
      store: jest.fn().mockResolvedValue(undefined),
    },
    subscriptions: [],
    ...overrides,
  }
}

function makeWebviewView(): any {
  const messageHandlers: Function[] = []
  const disposeHandlers: Function[] = []
  return {
    webview: {
      options: {},
      html: '',
      cspSource: 'https://test.csp',
      onDidReceiveMessage: jest.fn((handler: Function) => {
        messageHandlers.push(handler)
        return { dispose: jest.fn() }
      }),
      postMessage: jest.fn().mockResolvedValue(true),
      asWebviewUri: jest.fn((uri: vscode.Uri) => uri),
    },
    onDidDispose: jest.fn((handler: Function) => {
      disposeHandlers.push(handler)
      return { dispose: jest.fn() }
    }),
    show: jest.fn(),
    _messageHandlers: messageHandlers,
    _disposeHandlers: disposeHandlers,
  }
}

function makeStatusBar(): any {
  return {
    text: '',
    tooltip: '',
    command: '',
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn(),
  }
}

describe('CodeFluentViewProvider', () => {
  let provider: CodeFluentViewProvider
  let context: any
  let webviewView: any
  let statusBar: any

  beforeEach(() => {
    jest.clearAllMocks()
    // Clean up data cache files from previous runs
    const actualFs = jest.requireActual('fs') as typeof import('fs')
    try { actualFs.unlinkSync('/tmp/codefluent-test-storage/usage_cache.json') } catch {}
    try { actualFs.unlinkSync('/tmp/codefluent-test-storage/sessions_cache.json') } catch {}
    context = makeContext()
    statusBar = makeStatusBar()
    provider = new CodeFluentViewProvider(context, statusBar)
    webviewView = makeWebviewView()
  })

  async function sendMessage(msg: Record<string, any>): Promise<void> {
    provider.resolveWebviewView(webviewView, {} as any, {} as any)
    const handler = webviewView._messageHandlers[0]
    await handler(msg)
  }

  describe('resolveWebviewView', () => {
    it('sets webview options with scripts enabled', () => {
      provider.resolveWebviewView(webviewView, {} as any, {} as any)

      expect(webviewView.webview.options).toEqual({
        enableScripts: true,
        localResourceRoots: [expect.any(vscode.Uri)],
      })
    })

    it('sets HTML content on the webview', () => {
      provider.resolveWebviewView(webviewView, {} as any, {} as any)

      expect(webviewView.webview.html).toBeTruthy()
      expect(webviewView.webview.html).not.toContain('{{nonce}}')
      expect(webviewView.webview.html).toContain('https://test.csp')
    })

    it('registers a message handler', () => {
      provider.resolveWebviewView(webviewView, {} as any, {} as any)

      expect(webviewView.webview.onDidReceiveMessage).toHaveBeenCalledWith(
        expect.any(Function),
      )
    })

    it('registers a dispose handler', () => {
      provider.resolveWebviewView(webviewView, {} as any, {} as any)

      expect(webviewView.onDidDispose).toHaveBeenCalledWith(expect.any(Function))
    })
  })

  describe('focus', () => {
    it('calls show on the view when resolved', () => {
      provider.resolveWebviewView(webviewView, {} as any, {} as any)
      provider.focus()

      expect(webviewView.show).toHaveBeenCalledWith(true)
    })

    it('does nothing when view is not resolved', () => {
      // No resolveWebviewView called
      expect(() => provider.focus()).not.toThrow()
    })
  })

  describe('message handling: copyToClipboard', () => {
    it('copies text to clipboard', async () => {
      await sendMessage({ type: 'copyToClipboard', text: 'hello world' })

      expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('hello world')
    })

    it('does not post response for clipboard messages', async () => {
      await sendMessage({ type: 'copyToClipboard', text: 'test' })

      expect(webviewView.webview.postMessage).not.toHaveBeenCalled()
    })
  })

  describe('message handling: runInTerminal', () => {
    it('creates a terminal and sends the claude command', async () => {
      const mockTerminal = { show: jest.fn(), sendText: jest.fn() }
      ;(vscode.window.createTerminal as jest.Mock).mockReturnValue(mockTerminal)

      await sendMessage({
        type: 'runInTerminal',
        prompt: 'Add tests for the auth module',
        repo: 'my-repo',
      })

      expect(vscode.window.createTerminal).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Claude Code: my-repo',
          shellPath: getDefaultShell(),
          shellArgs: getShellArgs(),
        }),
      )
      expect(mockTerminal.show).toHaveBeenCalled()
      expect(mockTerminal.sendText).toHaveBeenCalledWith(
        getClaudeCommand(escapePromptForShell('Add tests for the auth module')),
      )
    })

    it('escapes single quotes in prompts', async () => {
      const mockTerminal = { show: jest.fn(), sendText: jest.fn() }
      ;(vscode.window.createTerminal as jest.Mock).mockReturnValue(mockTerminal)

      await sendMessage({
        type: 'runInTerminal',
        prompt: "it's a test",
      })

      expect(mockTerminal.sendText).toHaveBeenCalledWith(
        getClaudeCommand(escapePromptForShell("it's a test")),
      )
    })

    it('uses default name when repo is not provided', async () => {
      const mockTerminal = { show: jest.fn(), sendText: jest.fn() }
      ;(vscode.window.createTerminal as jest.Mock).mockReturnValue(mockTerminal)

      await sendMessage({ type: 'runInTerminal', prompt: 'do something' })

      expect(vscode.window.createTerminal).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Claude Code: Quick Win' }),
      )
    })

    it('neutralizes backtick injection', async () => {
      const mockTerminal = { show: jest.fn(), sendText: jest.fn() }
      ;(vscode.window.createTerminal as jest.Mock).mockReturnValue(mockTerminal)

      await sendMessage({
        type: 'runInTerminal',
        prompt: 'test`whoami`end',
      })

      // Single-quoted strings don't interpret backticks
      expect(mockTerminal.sendText).toHaveBeenCalledWith(
        getClaudeCommand(escapePromptForShell('test`whoami`end')),
      )
    })

    it('neutralizes $() injection', async () => {
      const mockTerminal = { show: jest.fn(), sendText: jest.fn() }
      ;(vscode.window.createTerminal as jest.Mock).mockReturnValue(mockTerminal)

      await sendMessage({
        type: 'runInTerminal',
        prompt: 'test$(id)end',
      })

      // Single-quoted strings don't interpret $()
      expect(mockTerminal.sendText).toHaveBeenCalledWith(
        getClaudeCommand(escapePromptForShell('test$(id)end')),
      )
    })

    it('handles combined injection attempts with single quotes', async () => {
      const mockTerminal = { show: jest.fn(), sendText: jest.fn() }
      ;(vscode.window.createTerminal as jest.Mock).mockReturnValue(mockTerminal)

      await sendMessage({
        type: 'runInTerminal',
        prompt: "test'; rm -rf /",
      })

      expect(mockTerminal.sendText).toHaveBeenCalledWith(
        getClaudeCommand(escapePromptForShell("test'; rm -rf /")),
      )
    })

    it('passes double quotes through without special handling', async () => {
      const mockTerminal = { show: jest.fn(), sendText: jest.fn() }
      ;(vscode.window.createTerminal as jest.Mock).mockReturnValue(mockTerminal)

      await sendMessage({
        type: 'runInTerminal',
        prompt: 'Fix the "broken" thing',
      })

      // Double quotes are safe inside single quotes
      expect(mockTerminal.sendText).toHaveBeenCalledWith(
        getClaudeCommand(escapePromptForShell('Fix the "broken" thing')),
      )
    })
  })

  describe('message handling: getUsage', () => {
    it('fetches usage data and posts response', async () => {
      const mockUsage = { daily: [{ date: '2026-01-01', totalCost: 1.5 }] }
      ;(getUsageData as jest.Mock).mockResolvedValue(mockUsage)

      await sendMessage({ type: 'getUsage', requestId: 'req-1' })

      expect(getUsageData).toHaveBeenCalled()
      expect(webviewView.webview.postMessage).toHaveBeenCalledWith({
        type: 'getUsage',
        requestId: 'req-1',
        data: mockUsage,
      })
    })

    it('posts error when getUsage throws', async () => {
      ;(getUsageData as jest.Mock).mockRejectedValue(new Error('ccusage not found'))

      await sendMessage({ type: 'getUsage', requestId: 'req-2' })

      expect(webviewView.webview.postMessage).toHaveBeenCalledWith({
        type: 'getUsage',
        requestId: 'req-2',
        error: 'ccusage not found',
      })
    })
  })

  describe('message handling: getSessions', () => {
    it('fetches sessions with default limit', async () => {
      const mockSessions = {
        sessions: [{ id: 's1', project: 'proj', user_prompts: ['hi'] }],
        metadata: { total_sessions: 1, total_projects: 1, total_prompts: 1, extracted_at: '' },
      }
      ;(getAllSessions as jest.Mock).mockReturnValue(mockSessions)

      await sendMessage({ type: 'getSessions', requestId: 'req-3' })

      expect(getAllSessions).toHaveBeenCalledWith(undefined, undefined, undefined, 200)
      expect(webviewView.webview.postMessage).toHaveBeenCalledWith({
        type: 'getSessions',
        requestId: 'req-3',
        data: expect.objectContaining({
          sessions: expect.any(Array),
          metadata: expect.objectContaining({ total_sessions: 1 }),
        }),
      })
    })

    it('filters by project from payload', async () => {
      const mockSessions = {
        sessions: [
          { id: 's1', project: 'my-project', user_prompts: ['hi'] },
          { id: 's2', project: 'other-project', user_prompts: ['bye'] },
        ],
        metadata: { total_sessions: 2, total_projects: 2, total_prompts: 2, extracted_at: '' },
      }
      ;(getAllSessions as jest.Mock).mockReturnValue(mockSessions)

      await sendMessage({
        type: 'getSessions',
        requestId: 'req-4',
        payload: { limit: 10, project: 'my-project' },
      })

      // getAllSessions is called without args (full result cached)
      expect(getAllSessions).toHaveBeenCalledWith(undefined, undefined, undefined, 200)
      // But the response is filtered
      expect(webviewView.webview.postMessage).toHaveBeenCalledWith({
        type: 'getSessions',
        requestId: 'req-4',
        data: expect.objectContaining({
          sessions: [expect.objectContaining({ id: 's1', project: 'my-project' })],
          metadata: expect.objectContaining({ total_sessions: 1 }),
        }),
      })
    })

    it('auto-scopes to workspace project when no explicit project filter', async () => {
      ;(vscode.workspace as any).workspaceFolders = [
        { uri: vscode.Uri.file('/home/user/my-project') },
      ]
      const mockSessions = {
        sessions: [
          { id: 's1', project: 'my-project', user_prompts: ['hi'] },
          { id: 's2', project: 'other-project', user_prompts: ['bye'] },
        ],
        metadata: { total_sessions: 2, total_projects: 2, total_prompts: 2, extracted_at: '' },
      }
      ;(getAllSessions as jest.Mock).mockReturnValue(mockSessions)

      await sendMessage({ type: 'getSessions', requestId: 'req-scope-1' })

      expect(webviewView.webview.postMessage).toHaveBeenCalledWith({
        type: 'getSessions',
        requestId: 'req-scope-1',
        data: expect.objectContaining({
          sessions: [expect.objectContaining({ id: 's1', project: 'my-project' })],
          metadata: expect.objectContaining({ total_sessions: 1 }),
        }),
      })

      ;(vscode.workspace as any).workspaceFolders = undefined
    })

    it('returns all projects when no workspace is open', async () => {
      ;(vscode.workspace as any).workspaceFolders = undefined
      const mockSessions = {
        sessions: [
          { id: 's1', project: 'proj-a', user_prompts: ['hi'] },
          { id: 's2', project: 'proj-b', user_prompts: ['bye'] },
        ],
        metadata: { total_sessions: 2, total_projects: 2, total_prompts: 2, extracted_at: '' },
      }
      ;(getAllSessions as jest.Mock).mockReturnValue(mockSessions)

      await sendMessage({ type: 'getSessions', requestId: 'req-scope-2' })

      expect(webviewView.webview.postMessage).toHaveBeenCalledWith({
        type: 'getSessions',
        requestId: 'req-scope-2',
        data: expect.objectContaining({
          sessions: expect.arrayContaining([
            expect.objectContaining({ id: 's1' }),
            expect.objectContaining({ id: 's2' }),
          ]),
          metadata: expect.objectContaining({ total_sessions: 2 }),
        }),
      })
    })
  })

  describe('message handling: runScoring', () => {
    const fakeSession = {
      id: 'sess-1',
      user_prompts: ['Hello Claude'],
      used_plan_mode: false,
      thinking_count: 0,
      tools_used: [],
    }

    beforeEach(() => {
      // Provide API key via env
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key'
    })

    afterEach(() => {
      delete process.env.ANTHROPIC_API_KEY
    })

    it('scores sessions and returns results with aggregate', async () => {
      const scoreResult = {
        'sess-1': {
          session_id: 'sess-1',
          overall_score: 75,
          fluency_behaviors: { clarifying_goals: true },
          coding_pattern: 'hybrid_code_explanation',
        },
      }
      ;(getAllSessions as jest.Mock).mockReturnValue({ sessions: [fakeSession] })
      ;(scoreSessions as jest.Mock).mockResolvedValue(scoreResult)
      ;(computeAggregate as jest.Mock).mockReturnValue({
        average_score: 75,
        sessions_scored: 1,
      })

      await sendMessage({
        type: 'runScoring',
        requestId: 'req-5',
        payload: { session_ids: ['sess-1'] },
      })

      expect(scoreSessions).toHaveBeenCalledWith(
        ['sess-1'],
        { 'sess-1': fakeSession },
        expect.any(Object),
        expect.any(Object),
        false,
      )
      expect(webviewView.webview.postMessage).toHaveBeenCalledWith({
        type: 'runScoring',
        requestId: 'req-5',
        data: {
          scores: scoreResult,
          aggregate: { average_score: 75, sessions_scored: 1, sessions_requested: 1, sessions_skipped: 0, score_history: [] },
        },
      })
    })

    it('updates status bar with aggregate score', async () => {
      ;(getAllSessions as jest.Mock).mockReturnValue({ sessions: [fakeSession] })
      ;(scoreSessions as jest.Mock).mockResolvedValue({
        'sess-1': {
          session_id: 'sess-1',
          overall_score: 82,
          fluency_behaviors: { clarifying_goals: true },
        },
      })
      ;(computeAggregate as jest.Mock).mockReturnValue({
        average_score: 82,
        sessions_scored: 1,
      })

      await sendMessage({
        type: 'runScoring',
        requestId: 'req-6',
        payload: { session_ids: ['sess-1'] },
      })

      expect(statusBar.text).toBe('$(pulse) 82')
      expect(statusBar.tooltip).toBe('CodeFluent: Fluency Score 82/100')
    })

    it('throws error when API key is not available', async () => {
      delete process.env.ANTHROPIC_API_KEY

      await sendMessage({
        type: 'runScoring',
        requestId: 'req-7',
        payload: { session_ids: ['sess-1'] },
      })

      expect(webviewView.webview.postMessage).toHaveBeenCalledWith({
        type: 'runScoring',
        requestId: 'req-7',
        error: 'Anthropic API key is required for scoring',
      })
    })

    it('passes force_rescore flag through', async () => {
      ;(getAllSessions as jest.Mock).mockReturnValue({ sessions: [fakeSession] })
      ;(scoreSessions as jest.Mock).mockResolvedValue({})
      ;(computeAggregate as jest.Mock).mockReturnValue({})

      await sendMessage({
        type: 'runScoring',
        requestId: 'req-8',
        payload: { session_ids: ['sess-1'], force_rescore: true },
      })

      expect(scoreSessions).toHaveBeenCalledWith(
        ['sess-1'],
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        true,
      )
    })
  })

  describe('message handling: getQuickwins', () => {
    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key'
    })

    afterEach(() => {
      delete process.env.ANTHROPIC_API_KEY
    })

    it('fetches quick wins and returns suggestions', async () => {
      const mockSuggestions = {
        suggestions: [
          { repo: 'my-app', task: 'Add tests', prompt: 'Write unit tests', estimated_minutes: 15, category: 'testing' },
        ],
      }
      ;(getQuickWins as jest.Mock).mockResolvedValue(mockSuggestions)

      await sendMessage({ type: 'getQuickwins', requestId: 'req-9' })

      expect(getQuickWins).toHaveBeenCalledWith(expect.any(Object), undefined, undefined)
      expect(webviewView.webview.postMessage).toHaveBeenCalledWith({
        type: 'getQuickwins',
        requestId: 'req-9',
        data: mockSuggestions,
      })
    })

    it('passes workspace path when available', async () => {
      ;(vscode.workspace as any).workspaceFolders = [
        { uri: vscode.Uri.file('/home/user/other-workspace') },
      ]
      ;(getQuickWins as jest.Mock).mockResolvedValue({ suggestions: [] })

      await sendMessage({ type: 'getQuickwins', requestId: 'req-10' })

      expect(getQuickWins).toHaveBeenCalledWith(
        expect.any(Object),
        '/home/user/other-workspace',
        undefined, // no CLAUDE.md found at this path
      )

      ;(vscode.workspace as any).workspaceFolders = undefined
    })

    it('throws error when API key is not available', async () => {
      delete process.env.ANTHROPIC_API_KEY

      await sendMessage({ type: 'getQuickwins', requestId: 'req-11' })

      expect(webviewView.webview.postMessage).toHaveBeenCalledWith({
        type: 'getQuickwins',
        requestId: 'req-11',
        error: 'Anthropic API key is required for quick wins',
      })
    })
  })

  describe('message handling: getCachedScores', () => {
    it('returns cached scores and aggregate', async () => {
      // ScoreCache.read returns empty by default (no file)
      ;(computeAggregate as jest.Mock).mockReturnValue({})

      await sendMessage({ type: 'getCachedScores', requestId: 'req-12' })

      expect(webviewView.webview.postMessage).toHaveBeenCalledWith({
        type: 'getCachedScores',
        requestId: 'req-12',
        data: { scores: expect.any(Object), aggregate: expect.any(Object) },
      })
    })

    it('updates status bar from cached aggregate', async () => {
      // Make the mocked readFileSync return cached scores for the cache file
      const fsMock = require('fs')
      const origImpl = fsMock.readFileSync.getMockImplementation()
      fsMock.readFileSync.mockImplementation((...args: any[]) => {
        if (String(args[0]).endsWith('scores.json')) {
          return JSON.stringify({
            'sess-1': {
              session_id: 'sess-1',
              overall_score: 90,
              fluency_behaviors: { clarifying_goals: true },
            },
          })
        }
        return origImpl(...args)
      })

      ;(computeAggregate as jest.Mock).mockReturnValue({
        average_score: 90,
        sessions_scored: 1,
      })

      await sendMessage({ type: 'getCachedScores', requestId: 'req-13' })

      expect(statusBar.text).toBe('$(pulse) 90')

      // Restore original mock
      fsMock.readFileSync.mockImplementation(origImpl)
    })
  })

  describe('message handling: unknown type', () => {
    it('ignores unknown message types without requestId', async () => {
      await sendMessage({ type: 'unknownType' })

      expect(webviewView.webview.postMessage).not.toHaveBeenCalled()
    })

    it('does not post response for unknown types with requestId', async () => {
      await sendMessage({ type: 'unknownType', requestId: 'req-14' })

      // The switch falls through to default which returns early
      expect(webviewView.webview.postMessage).not.toHaveBeenCalled()
    })
  })

  describe('message handling: messages without requestId', () => {
    it('ignores non-clipboard/terminal messages without requestId', async () => {
      ;(getUsageData as jest.Mock).mockResolvedValue({})

      await sendMessage({ type: 'getUsage' })

      expect(getUsageData).not.toHaveBeenCalled()
      expect(webviewView.webview.postMessage).not.toHaveBeenCalled()
    })
  })

  describe('API key resolution', () => {
    it('uses env variable first', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-from-env'
      ;(getAllSessions as jest.Mock).mockReturnValue({ sessions: [] })
      ;(scoreSessions as jest.Mock).mockResolvedValue({})
      ;(computeAggregate as jest.Mock).mockReturnValue({})

      await sendMessage({
        type: 'runScoring',
        requestId: 'req-15',
        payload: { session_ids: [] },
      })

      // Should not check secrets since env was available
      expect(context.secrets.get).not.toHaveBeenCalled()

      delete process.env.ANTHROPIC_API_KEY
    })

    it('falls back to secrets storage when env is not set', async () => {
      delete process.env.ANTHROPIC_API_KEY
      context.secrets.get.mockResolvedValue('sk-from-secrets')
      ;(getAllSessions as jest.Mock).mockReturnValue({ sessions: [] })
      ;(scoreSessions as jest.Mock).mockResolvedValue({})
      ;(computeAggregate as jest.Mock).mockReturnValue({})

      await sendMessage({
        type: 'runScoring',
        requestId: 'req-16',
        payload: { session_ids: [] },
      })

      expect(context.secrets.get).toHaveBeenCalledWith('codefluent.anthropicApiKey')
      expect(webviewView.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'runScoring', requestId: 'req-16' }),
      )
    })

    it('prompts user and stores key when no other source available', async () => {
      delete process.env.ANTHROPIC_API_KEY
      context.secrets.get.mockResolvedValue(undefined)
      ;(vscode.window.showInputBox as jest.Mock).mockResolvedValue('sk-user-input')
      ;(getAllSessions as jest.Mock).mockReturnValue({ sessions: [] })
      ;(scoreSessions as jest.Mock).mockResolvedValue({})
      ;(computeAggregate as jest.Mock).mockReturnValue({})

      await sendMessage({
        type: 'runScoring',
        requestId: 'req-17',
        payload: { session_ids: [] },
      })

      expect(vscode.window.showInputBox).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Enter your Anthropic API key for AI fluency scoring',
          password: true,
        }),
      )
      expect(context.secrets.store).toHaveBeenCalledWith(
        'codefluent.anthropicApiKey',
        'sk-user-input',
      )
    })
  })

  describe('view lifecycle', () => {
    it('clears view reference on dispose', () => {
      provider.resolveWebviewView(webviewView, {} as any, {} as any)

      // Trigger dispose
      webviewView._disposeHandlers[0]()

      // focus should no-op after dispose
      expect(() => provider.focus()).not.toThrow()
    })
  })

  describe('message handling: getBenchmarks', () => {
    it('returns benchmark data from shared/benchmarks.json', async () => {
      await sendMessage({ type: 'getBenchmarks', requestId: 'req-bench-1' })

      expect(webviewView.webview.postMessage).toHaveBeenCalledWith({
        type: 'getBenchmarks',
        requestId: 'req-bench-1',
        data: { expert: { min_score: 85 } },
      })
    })

    it('returns error when benchmarks file is unreadable', async () => {
      const fsMock = require('fs')
      const origImpl = fsMock.readFileSync.getMockImplementation()
      fsMock.readFileSync.mockImplementation((...args: any[]) => {
        if (String(args[0]).endsWith('benchmarks.json')) {
          throw new Error('ENOENT: no such file')
        }
        return origImpl(...args)
      })

      await sendMessage({ type: 'getBenchmarks', requestId: 'req-bench-2' })

      expect(webviewView.webview.postMessage).toHaveBeenCalledWith({
        type: 'getBenchmarks',
        requestId: 'req-bench-2',
        error: expect.stringContaining('ENOENT'),
      })

      fsMock.readFileSync.mockImplementation(origImpl)
    })
  })

  describe('message handling: getQuickwins CLAUDE.md passthrough', () => {
    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key'
    })

    afterEach(() => {
      delete process.env.ANTHROPIC_API_KEY
    })

    it('passes CLAUDE.md content to getQuickWins when file exists at workspace root', async () => {
      ;(vscode.workspace as any).workspaceFolders = [
        { uri: vscode.Uri.file('/home/user/my-project') },
      ]
      ;(getQuickWins as jest.Mock).mockResolvedValue({ suggestions: [] })

      await sendMessage({ type: 'getQuickwins', requestId: 'req-claude-1' })

      expect(getQuickWins).toHaveBeenCalledWith(
        expect.any(Object),
        '/home/user/my-project',
        '# My Project\nAlways use TypeScript.',
      )

      ;(vscode.workspace as any).workspaceFolders = undefined
    })

    it('passes undefined when CLAUDE.md read fails', async () => {
      ;(vscode.workspace as any).workspaceFolders = [
        { uri: vscode.Uri.file('/home/user/no-claude-md') },
      ]

      const fsMock = require('fs')
      const origImpl = fsMock.readFileSync.getMockImplementation()
      fsMock.readFileSync.mockImplementation((...args: any[]) => {
        if (String(args[0]).endsWith('CLAUDE.md') && String(args[0]).includes('no-claude-md')) {
          throw new Error('ENOENT')
        }
        return origImpl(...args)
      })

      ;(getQuickWins as jest.Mock).mockResolvedValue({ suggestions: [] })

      await sendMessage({ type: 'getQuickwins', requestId: 'req-claude-2' })

      expect(getQuickWins).toHaveBeenCalledWith(
        expect.any(Object),
        '/home/user/no-claude-md',
        undefined,
      )

      fsMock.readFileSync.mockImplementation(origImpl)
      ;(vscode.workspace as any).workspaceFolders = undefined
    })
  })

  describe('data caching', () => {
    it('second getUsage call returns cached data without re-fetching', async () => {
      const mockUsage = { daily: [{ date: '2026-01-01', totalCost: 1.5 }] }
      ;(getUsageData as jest.Mock).mockResolvedValue(mockUsage)

      await sendMessage({ type: 'getUsage', requestId: 'req-cache-1' })
      expect(getUsageData).toHaveBeenCalledTimes(1)

      ;(getUsageData as jest.Mock).mockClear()
      await sendMessage({ type: 'getUsage', requestId: 'req-cache-2' })
      expect(getUsageData).not.toHaveBeenCalled()

      expect(webviewView.webview.postMessage).toHaveBeenCalledWith({
        type: 'getUsage',
        requestId: 'req-cache-2',
        data: mockUsage,
      })
    })

    it('second getSessions call returns cached data without re-parsing', async () => {
      const mockSessions = {
        sessions: [{ id: 's1', project: 'proj', user_prompts: ['hi'] }],
        metadata: { total_sessions: 1, total_projects: 1, total_prompts: 1, extracted_at: '' },
      }
      ;(getAllSessions as jest.Mock).mockReturnValue(mockSessions)

      await sendMessage({ type: 'getSessions', requestId: 'req-cache-3' })
      expect(getAllSessions).toHaveBeenCalledTimes(1)

      ;(getAllSessions as jest.Mock).mockClear()
      await sendMessage({ type: 'getSessions', requestId: 'req-cache-4' })
      expect(getAllSessions).not.toHaveBeenCalled()
    })

    it('refreshData message invalidates cache and triggers background refresh', async () => {
      const mockUsage = { daily: [{ date: '2026-01-01', totalCost: 1.5 }] }
      ;(getUsageData as jest.Mock).mockResolvedValue(mockUsage)
      const mockSessions = {
        sessions: [],
        metadata: { total_sessions: 0, total_projects: 0, total_prompts: 0, extracted_at: '' },
      }
      ;(getAllSessions as jest.Mock).mockReturnValue(mockSessions)

      // Prime the cache
      await sendMessage({ type: 'getUsage', requestId: 'req-cache-5' })
      ;(getUsageData as jest.Mock).mockClear()
      ;(getAllSessions as jest.Mock).mockClear()

      // Send refreshData (fire-and-forget, no requestId)
      await sendMessage({ type: 'refreshData' })

      // Allow setImmediate callbacks and their inner async operations to run
      await new Promise(resolve => setImmediate(resolve))
      await new Promise(resolve => setImmediate(resolve))

      // Background refresh should have called getUsageData and getAllSessions
      expect(getUsageData).toHaveBeenCalledTimes(1)
      expect(getAllSessions).toHaveBeenCalledTimes(1)
    })

    it('runScoring uses session cache instead of re-parsing', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key'
      const mockSessions = {
        sessions: [{ id: 's1', user_prompts: ['hi'], used_plan_mode: false, thinking_count: 0, tools_used: [] }],
        metadata: { total_sessions: 1, total_projects: 1, total_prompts: 1, extracted_at: '' },
      }
      ;(getAllSessions as jest.Mock).mockReturnValue(mockSessions)
      ;(scoreSessions as jest.Mock).mockResolvedValue({})
      ;(computeAggregate as jest.Mock).mockReturnValue({})

      // Prime session cache
      await sendMessage({ type: 'getSessions', requestId: 'req-cache-6' })
      ;(getAllSessions as jest.Mock).mockClear()

      // Now run scoring — should use cached sessions
      await sendMessage({
        type: 'runScoring',
        requestId: 'req-cache-7',
        payload: { session_ids: ['s1'] },
      })

      // getAllSessions should NOT have been called again
      expect(getAllSessions).not.toHaveBeenCalled()

      delete process.env.ANTHROPIC_API_KEY
    })
  })

  describe('setStatusBar', () => {
    it('allows changing the status bar after construction', async () => {
      const newStatusBar = makeStatusBar()
      provider.setStatusBar(newStatusBar)

      process.env.ANTHROPIC_API_KEY = 'sk-test'
      ;(getAllSessions as jest.Mock).mockReturnValue({
        sessions: [{
          id: 's1',
          user_prompts: ['hi'],
          used_plan_mode: false,
          thinking_count: 0,
          tools_used: [],
        }],
      })
      ;(scoreSessions as jest.Mock).mockResolvedValue({
        s1: { session_id: 's1', overall_score: 65, fluency_behaviors: { clarifying_goals: true } },
      })
      ;(computeAggregate as jest.Mock).mockReturnValue({ average_score: 65, sessions_scored: 1 })

      await sendMessage({
        type: 'runScoring',
        requestId: 'req-18',
        payload: { session_ids: ['s1'] },
      })

      expect(newStatusBar.text).toBe('$(pulse) 65')
      // Old status bar should not be updated
      expect(statusBar.text).toBe('')

      delete process.env.ANTHROPIC_API_KEY
    })
  })

  describe('config cache prompt versioning', () => {
    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key'
      ;(vscode.workspace as any).workspaceFolders = [
        { uri: vscode.Uri.file('/home/user/my-project') },
      ]
    })

    afterEach(() => {
      delete process.env.ANTHROPIC_API_KEY
      ;(vscode.workspace as any).workspaceFolders = undefined
    })

    it('config cache hit requires matching prompt_version', async () => {
      // Set up config cache with matching version
      const fsMock = require('fs')
      const origImpl = fsMock.readFileSync.getMockImplementation()
      fsMock.readFileSync.mockImplementation((...args: any[]) => {
        if (String(args[0]).endsWith('config_scores.json')) {
          return JSON.stringify({
            '/home/user/my-project': {
              hash: '# My Project\nAlways use TypeScript.' .slice(0, 100) + ':' + '# My Project\nAlways use TypeScript.'.length,
              prompt_version: CONFIG_SCORING_PROMPT_VERSION,
              fluency_behaviors: { clarifying_goals: true },
              one_line_summary: 'Good config.',
            },
          })
        }
        return origImpl(...args)
      })

      ;(getAllSessions as jest.Mock).mockReturnValue({ sessions: [{ id: 's1', user_prompts: ['hi'] }] })
      ;(scoreSessions as jest.Mock).mockResolvedValue({})
      ;(computeAggregate as jest.Mock).mockReturnValue({})

      await sendMessage({
        type: 'runScoring',
        requestId: 'req-cv-1',
        payload: { session_ids: ['s1'] },
      })

      // scoreClaudeMd should NOT be called — config cache hit
      expect(scoreClaudeMd).not.toHaveBeenCalled()

      fsMock.readFileSync.mockImplementation(origImpl)
    })

    it('mismatched prompt_version triggers config re-scoring', async () => {
      const fsMock = require('fs')
      const origImpl = fsMock.readFileSync.getMockImplementation()
      fsMock.readFileSync.mockImplementation((...args: any[]) => {
        if (String(args[0]).endsWith('config_scores.json')) {
          return JSON.stringify({
            '/home/user/my-project': {
              hash: '# My Project\nAlways use TypeScript.'.slice(0, 100) + ':' + '# My Project\nAlways use TypeScript.'.length,
              prompt_version: 'config-v0.9',
              fluency_behaviors: { clarifying_goals: true },
              one_line_summary: 'Old config.',
            },
          })
        }
        return origImpl(...args)
      })

      ;(scoreClaudeMd as jest.Mock).mockResolvedValue({
        fluency_behaviors: { clarifying_goals: true, specifying_format: true },
        one_line_summary: 'Updated config.',
      })
      ;(getAllSessions as jest.Mock).mockReturnValue({ sessions: [{ id: 's1', user_prompts: ['hi'] }] })
      ;(scoreSessions as jest.Mock).mockResolvedValue({})
      ;(computeAggregate as jest.Mock).mockReturnValue({})

      await sendMessage({
        type: 'runScoring',
        requestId: 'req-cv-2',
        payload: { session_ids: ['s1'] },
      })

      // scoreClaudeMd SHOULD be called — version mismatch
      expect(scoreClaudeMd).toHaveBeenCalled()

      fsMock.readFileSync.mockImplementation(origImpl)
    })

    it('missing prompt_version triggers config re-scoring', async () => {
      const fsMock = require('fs')
      const origImpl = fsMock.readFileSync.getMockImplementation()
      fsMock.readFileSync.mockImplementation((...args: any[]) => {
        if (String(args[0]).endsWith('config_scores.json')) {
          return JSON.stringify({
            '/home/user/my-project': {
              hash: '# My Project\nAlways use TypeScript.'.slice(0, 100) + ':' + '# My Project\nAlways use TypeScript.'.length,
              fluency_behaviors: { clarifying_goals: true },
              one_line_summary: 'No version.',
            },
          })
        }
        return origImpl(...args)
      })

      ;(scoreClaudeMd as jest.Mock).mockResolvedValue({
        fluency_behaviors: { clarifying_goals: true },
        one_line_summary: 'Re-scored.',
      })
      ;(getAllSessions as jest.Mock).mockReturnValue({ sessions: [{ id: 's1', user_prompts: ['hi'] }] })
      ;(scoreSessions as jest.Mock).mockResolvedValue({})
      ;(computeAggregate as jest.Mock).mockReturnValue({})

      await sendMessage({
        type: 'runScoring',
        requestId: 'req-cv-3',
        payload: { session_ids: ['s1'] },
      })

      expect(scoreClaudeMd).toHaveBeenCalled()

      fsMock.readFileSync.mockImplementation(origImpl)
    })
  })

  describe('optimizePrompt message', () => {
    afterEach(() => {
      // Clean up any cache files written during tests
      try {
        const fs = require('fs')
        fs.unlinkSync('/tmp/codefluent-test-storage/optimizer_cache.json')
      } catch {}
      try {
        const fs = require('fs')
        fs.unlinkSync('/tmp/codefluent-test-storage/config_scores.json')
      } catch {}
    })

    it('returns optimized result with two API calls', async () => {
      const ctx = makeContext({
        secrets: { get: jest.fn().mockResolvedValue('sk-test-key'), store: jest.fn() },
      })
      const provider = new CodeFluentViewProvider(ctx)
      const view = makeWebviewView()
      provider.resolveWebviewView(view, {} as any, {} as any)
      const sendMessage = view._messageHandlers[0]

      ;(optimizePrompt as jest.Mock).mockResolvedValue({
        input_behaviors: { clarifying_goals: true },
        input_score: 9,
        optimized_prompt: 'Better prompt',
        behaviors_added: ['checking_facts'],
        explanation: 'Added checking.',
        one_line_summary: 'Basic prompt.',
      })
      ;(scoreSinglePrompt as jest.Mock).mockResolvedValue({
        fluency_behaviors: { clarifying_goals: true, checking_facts: true },
        overall_score: 18,
        one_line_summary: 'Good prompt.',
      })

      await sendMessage({
        type: 'optimizePrompt',
        requestId: 'req-opt-1',
        payload: { prompt: 'Fix the bug in auth' },
      })

      const response = view.webview.postMessage.mock.calls.find(
        (c: any) => c[0].requestId === 'req-opt-1'
      )
      expect(response).toBeTruthy()
      // Effective scores are computed from behavior counts: 1/11=9, 2/11=18
      expect(response[0].data.input_score).toBe(9)
      expect(response[0].data.output_score).toBe(18)
      expect(response[0].data.optimized_prompt).toBe('Better prompt')
    })

    it('returns already_good when input_score >= 90', async () => {
      const ctx = makeContext({
        secrets: { get: jest.fn().mockResolvedValue('sk-test-key'), store: jest.fn() },
      })
      const provider = new CodeFluentViewProvider(ctx)
      const view = makeWebviewView()
      provider.resolveWebviewView(view, {} as any, {} as any)
      const sendMessage = view._messageHandlers[0]

      // 10/11 behaviors = round(10/11*100) = 91, which triggers already_good
      ;(optimizePrompt as jest.Mock).mockResolvedValue({
        input_behaviors: {
          iteration_and_refinement: true, clarifying_goals: true,
          specifying_format: true, providing_examples: true,
          setting_interaction_terms: true, checking_facts: true,
          questioning_reasoning: true, identifying_missing_context: true,
          adjusting_approach: true, building_on_responses: true,
          providing_feedback: false,
        },
        input_score: 91,
        optimized_prompt: undefined,
        behaviors_added: [],
        one_line_summary: 'Great prompt.',
      })

      await sendMessage({
        type: 'optimizePrompt',
        requestId: 'req-opt-2',
        payload: { prompt: 'A very comprehensive prompt' },
      })

      const response = view.webview.postMessage.mock.calls.find(
        (c: any) => c[0].requestId === 'req-opt-2'
      )
      expect(response).toBeTruthy()
      expect(response[0].data.already_good).toBe(true)
      expect(response[0].data.input_score).toBe(91)
      expect(scoreSinglePrompt).not.toHaveBeenCalled()
    })

    it('returns error for empty prompt', async () => {
      const ctx = makeContext({
        secrets: { get: jest.fn().mockResolvedValue('sk-test-key'), store: jest.fn() },
      })
      const provider = new CodeFluentViewProvider(ctx)
      const view = makeWebviewView()
      provider.resolveWebviewView(view, {} as any, {} as any)
      const sendMessage = view._messageHandlers[0]

      await sendMessage({
        type: 'optimizePrompt',
        requestId: 'req-opt-3',
        payload: { prompt: '' },
      })

      const response = view.webview.postMessage.mock.calls.find(
        (c: any) => c[0].requestId === 'req-opt-3'
      )
      expect(response).toBeTruthy()
      expect(response[0].error).toContain('required')
    })

    it('returns error for oversized prompt', async () => {
      const ctx = makeContext({
        secrets: { get: jest.fn().mockResolvedValue('sk-test-key'), store: jest.fn() },
      })
      const provider = new CodeFluentViewProvider(ctx)
      const view = makeWebviewView()
      provider.resolveWebviewView(view, {} as any, {} as any)
      const sendMessage = view._messageHandlers[0]

      await sendMessage({
        type: 'optimizePrompt',
        requestId: 'req-opt-4',
        payload: { prompt: 'a'.repeat(10001) },
      })

      const response = view.webview.postMessage.mock.calls.find(
        (c: any) => c[0].requestId === 'req-opt-4'
      )
      expect(response).toBeTruthy()
      expect(response[0].error).toContain('10,000')
    })

    it('requires API key', async () => {
      const ctx = makeContext()
      ;(vscode.window.showInputBox as jest.Mock).mockResolvedValue(undefined)
      const provider = new CodeFluentViewProvider(ctx)
      const view = makeWebviewView()
      provider.resolveWebviewView(view, {} as any, {} as any)
      const sendMessage = view._messageHandlers[0]

      await sendMessage({
        type: 'optimizePrompt',
        requestId: 'req-opt-5',
        payload: { prompt: 'Fix the bug' },
      })

      const response = view.webview.postMessage.mock.calls.find(
        (c: any) => c[0].requestId === 'req-opt-5'
      )
      expect(response).toBeTruthy()
      expect(response![0].error).toContain('API key')
    })

    it('scores CLAUDE.md on demand when workspace has one', async () => {
      ;(vscode.workspace as any).workspaceFolders = [
        { uri: vscode.Uri.file('/home/user/my-project') },
      ]

      const configBehaviors = { setting_interaction_terms: true, checking_facts: true }
      ;(scoreClaudeMd as jest.Mock).mockResolvedValue({
        fluency_behaviors: configBehaviors,
        one_line_summary: 'Good config.',
      })

      const ctx = makeContext({
        secrets: { get: jest.fn().mockResolvedValue('sk-test-key'), store: jest.fn() },
      })
      const provider = new CodeFluentViewProvider(ctx)
      const view = makeWebviewView()
      provider.resolveWebviewView(view, {} as any, {} as any)
      const sendMessage = view._messageHandlers[0]

      ;(optimizePrompt as jest.Mock).mockResolvedValue({
        input_behaviors: { clarifying_goals: true },
        input_score: 9,
        optimized_prompt: 'Better prompt',
        behaviors_added: ['questioning_reasoning'],
        explanation: 'Added questioning.',
        one_line_summary: 'Basic prompt.',
      })
      ;(scoreSinglePrompt as jest.Mock).mockResolvedValue({
        fluency_behaviors: { clarifying_goals: true, questioning_reasoning: true },
        overall_score: 18,
        one_line_summary: 'Good prompt.',
      })

      await sendMessage({
        type: 'optimizePrompt',
        requestId: 'req-opt-config',
        payload: { prompt: 'Fix the bug in auth' },
      })

      // scoreClaudeMd should have been called to score the config
      expect(scoreClaudeMd).toHaveBeenCalled()

      // optimizePrompt should receive config behaviors
      expect(optimizePrompt).toHaveBeenCalledWith(
        'Fix the bug in auth',
        expect.anything(),
        configBehaviors,
      )

      const response = view.webview.postMessage.mock.calls.find(
        (c: any) => c[0].requestId === 'req-opt-config'
      )
      expect(response).toBeTruthy()
      // Input: clarifying_goals (prompt) + setting_interaction_terms + checking_facts (config) = 3/11 = 27
      expect(response[0].data.input_score).toBe(27)
      // Output: clarifying_goals + questioning_reasoning (prompt) + config behaviors = 4/11 = 36
      expect(response[0].data.output_score).toBe(36)

      ;(vscode.workspace as any).workspaceFolders = undefined
    })

    it('passes undefined config when no workspace is open', async () => {
      ;(vscode.workspace as any).workspaceFolders = undefined

      const ctx = makeContext({
        secrets: { get: jest.fn().mockResolvedValue('sk-test-key'), store: jest.fn() },
      })
      const provider = new CodeFluentViewProvider(ctx)
      const view = makeWebviewView()
      provider.resolveWebviewView(view, {} as any, {} as any)
      const sendMessage = view._messageHandlers[0]

      ;(optimizePrompt as jest.Mock).mockResolvedValue({
        input_behaviors: { clarifying_goals: true },
        input_score: 9,
        optimized_prompt: 'Better prompt',
        behaviors_added: [],
        one_line_summary: 'Basic.',
      })
      ;(scoreSinglePrompt as jest.Mock).mockResolvedValue({
        fluency_behaviors: { clarifying_goals: true },
        overall_score: 9,
        one_line_summary: 'OK.',
      })

      await sendMessage({
        type: 'optimizePrompt',
        requestId: 'req-opt-no-ws',
        payload: { prompt: 'Test prompt' },
      })

      // Without workspace, no config behaviors
      expect(optimizePrompt).toHaveBeenCalledWith(
        'Test prompt',
        expect.anything(),
        undefined,
      )
    })

    it('merges config behaviors into effective scores', async () => {
      ;(vscode.workspace as any).workspaceFolders = undefined

      const ctx = makeContext({
        secrets: { get: jest.fn().mockResolvedValue('sk-test-key'), store: jest.fn() },
      })
      const provider = new CodeFluentViewProvider(ctx)
      const view = makeWebviewView()
      provider.resolveWebviewView(view, {} as any, {} as any)
      const sendMessage = view._messageHandlers[0]

      // Prompt has 1 behavior, API scores it at 9 (1/11)
      ;(optimizePrompt as jest.Mock).mockResolvedValue({
        input_behaviors: { clarifying_goals: true },
        input_score: 9,
        optimized_prompt: 'Better prompt',
        behaviors_added: ['checking_facts'],
        explanation: 'Added checking.',
        one_line_summary: 'Basic prompt.',
      })
      // Optimized prompt has 2 behaviors
      ;(scoreSinglePrompt as jest.Mock).mockResolvedValue({
        fluency_behaviors: { clarifying_goals: true, checking_facts: true },
        overall_score: 18,
        one_line_summary: 'Good prompt.',
      })

      await sendMessage({
        type: 'optimizePrompt',
        requestId: 'req-opt-merge',
        payload: { prompt: 'Fix the bug' },
      })

      const response = view.webview.postMessage.mock.calls.find(
        (c: any) => c[0].requestId === 'req-opt-merge'
      )
      expect(response).toBeTruthy()
      // Without config, scores come straight from API (recomputed from behavior counts)
      expect(response[0].data.input_score).toBe(9)
      expect(response[0].data.input_behaviors.clarifying_goals).toBe(true)
    })
  })
})
