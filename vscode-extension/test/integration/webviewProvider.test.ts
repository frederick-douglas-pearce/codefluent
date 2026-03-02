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
      return actual.readFileSync(...args)
    }),
  }
})

jest.mock('../../src/parser')
jest.mock('../../src/usage')
jest.mock('../../src/scoring')
jest.mock('../../src/quickwins')
jest.mock('@anthropic-ai/sdk')

import { getAllSessions } from '../../src/parser'
import { getUsageData } from '../../src/usage'
import { scoreSessions, computeAggregate } from '../../src/scoring'
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
          shellPath: '/bin/bash',
        }),
      )
      expect(mockTerminal.show).toHaveBeenCalled()
      expect(mockTerminal.sendText).toHaveBeenCalledWith(
        'claude "Add tests for the auth module"',
      )
    })

    it('escapes double quotes in prompts', async () => {
      const mockTerminal = { show: jest.fn(), sendText: jest.fn() }
      ;(vscode.window.createTerminal as jest.Mock).mockReturnValue(mockTerminal)

      await sendMessage({
        type: 'runInTerminal',
        prompt: 'Fix the "broken" thing',
      })

      expect(mockTerminal.sendText).toHaveBeenCalledWith(
        'claude "Fix the \\"broken\\" thing"',
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
  })

  describe('message handling: getUsage', () => {
    it('fetches usage data and posts response', async () => {
      const mockUsage = { daily: [{ date: '2026-01-01', totalCost: 1.5 }] }
      ;(getUsageData as jest.Mock).mockReturnValue(mockUsage)

      await sendMessage({ type: 'getUsage', requestId: 'req-1' })

      expect(getUsageData).toHaveBeenCalled()
      expect(webviewView.webview.postMessage).toHaveBeenCalledWith({
        type: 'getUsage',
        requestId: 'req-1',
        data: mockUsage,
      })
    })

    it('posts error when getUsage throws', async () => {
      ;(getUsageData as jest.Mock).mockImplementation(() => {
        throw new Error('ccusage not found')
      })

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
      const mockSessions = { sessions: [], metadata: { total_sessions: 0 } }
      ;(getAllSessions as jest.Mock).mockReturnValue(mockSessions)

      await sendMessage({ type: 'getSessions', requestId: 'req-3' })

      expect(getAllSessions).toHaveBeenCalledWith(50, undefined)
      expect(webviewView.webview.postMessage).toHaveBeenCalledWith({
        type: 'getSessions',
        requestId: 'req-3',
        data: mockSessions,
      })
    })

    it('passes custom limit and project from payload', async () => {
      const mockSessions = { sessions: [], metadata: { total_sessions: 0 } }
      ;(getAllSessions as jest.Mock).mockReturnValue(mockSessions)

      await sendMessage({
        type: 'getSessions',
        requestId: 'req-4',
        payload: { limit: 10, project: 'my-project' },
      })

      expect(getAllSessions).toHaveBeenCalledWith(10, 'my-project')
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
          aggregate: { average_score: 75, sessions_scored: 1 },
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

      expect(getQuickWins).toHaveBeenCalledWith(expect.any(Object), undefined)
      expect(webviewView.webview.postMessage).toHaveBeenCalledWith({
        type: 'getQuickwins',
        requestId: 'req-9',
        data: mockSuggestions,
      })
    })

    it('passes workspace path when available', async () => {
      ;(vscode.workspace as any).workspaceFolders = [
        { uri: vscode.Uri.file('/home/user/my-project') },
      ]
      ;(getQuickWins as jest.Mock).mockResolvedValue({ suggestions: [] })

      await sendMessage({ type: 'getQuickwins', requestId: 'req-10' })

      expect(getQuickWins).toHaveBeenCalledWith(
        expect.any(Object),
        '/home/user/my-project',
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
      ;(getUsageData as jest.Mock).mockReturnValue({})

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
})
