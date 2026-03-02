import * as vscode from 'vscode'
import { activate, deactivate } from '../../src/extension'

jest.mock('../../src/webviewProvider', () => {
  const MockProvider = jest.fn().mockImplementation(() => ({
    focus: jest.fn(),
    resolveWebviewView: jest.fn(),
  })) as any
  MockProvider.viewType = 'codefluent.dashboard'
  return { CodeFluentViewProvider: MockProvider }
})

describe('Extension activation', () => {
  let context: any
  let statusBarItem: any

  beforeEach(() => {
    jest.clearAllMocks()

    statusBarItem = {
      text: '',
      tooltip: '',
      command: '',
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
    }
    ;(vscode.window.createStatusBarItem as jest.Mock).mockReturnValue(statusBarItem)

    context = {
      subscriptions: [],
      extensionUri: vscode.Uri.file('/fake/extension'),
      globalStorageUri: vscode.Uri.file('/fake/storage'),
      secrets: {
        get: jest.fn(),
        store: jest.fn(),
      },
    }
  })

  it('creates a status bar item on the right side', () => {
    activate(context)

    expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(
      vscode.StatusBarAlignment.Right,
      100,
    )
  })

  it('configures status bar with pulse icon and default text', () => {
    activate(context)

    expect(statusBarItem.command).toBe('codefluent.openPanel')
    expect(statusBarItem.text).toBe('$(pulse) --')
    expect(statusBarItem.tooltip).toBe('CodeFluent: Fluency Score')
    expect(statusBarItem.show).toHaveBeenCalled()
  })

  it('registers the openPanel command', () => {
    activate(context)

    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'codefluent.openPanel',
      expect.any(Function),
    )
  })

  it('registers the webview view provider', () => {
    activate(context)

    expect(vscode.window.registerWebviewViewProvider).toHaveBeenCalledWith(
      'codefluent.dashboard',
      expect.any(Object),
      { webviewOptions: { retainContextWhenHidden: true } },
    )
  })

  it('pushes all disposables to context.subscriptions', () => {
    activate(context)

    // statusBar + webviewViewProvider + command = 3
    expect(context.subscriptions.length).toBe(3)
  })

  it('openPanel command calls provider.focus()', () => {
    activate(context)

    const registerCall = (vscode.commands.registerCommand as jest.Mock).mock.calls[0]
    const commandCallback = registerCall[1]
    const { CodeFluentViewProvider } = require('../../src/webviewProvider')
    const providerInstance = CodeFluentViewProvider.mock.results[0].value

    commandCallback()

    expect(providerInstance.focus).toHaveBeenCalled()
  })

  it('deactivate is a no-op function', () => {
    expect(deactivate).toBeDefined()
    expect(() => deactivate()).not.toThrow()
  })
})
