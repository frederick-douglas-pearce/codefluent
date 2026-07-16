import * as vscode from 'vscode'
import { activate, deactivate } from '../../src/extension'

jest.mock('../../src/webviewProvider', () => {
  const MockProvider = jest.fn().mockImplementation(() => ({
    focus: jest.fn(),
    resolveWebviewView: jest.fn(),
    detectOverridingKeySource: jest.fn().mockReturnValue(undefined),
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

  it('registers the setApiKey command', () => {
    activate(context)

    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'codefluent.setApiKey',
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

    // statusBar + webviewViewProvider + openPanel + setApiKey = 4
    expect(context.subscriptions.length).toBe(4)
  })

  it('openPanel command calls provider.focus()', () => {
    activate(context)

    const registerCall = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
      c => c[0] === 'codefluent.openPanel',
    )!
    const commandCallback = registerCall[1]
    const { CodeFluentViewProvider } = require('../../src/webviewProvider')
    const providerInstance = CodeFluentViewProvider.mock.results[0].value

    commandCallback()

    expect(providerInstance.focus).toHaveBeenCalled()
  })

  describe('setApiKey command', () => {
    const getSetApiKeyCallback = (): (() => Promise<void>) => {
      const call = (vscode.commands.registerCommand as jest.Mock).mock.calls.find(
        c => c[0] === 'codefluent.setApiKey',
      )!
      return call[1]
    }

    it('stores trimmed input in SecretStorage', async () => {
      ;(vscode.window.showInputBox as jest.Mock).mockResolvedValue('  sk-ant-abc123  ')
      activate(context)

      await getSetApiKeyCallback()()

      expect(context.secrets.store).toHaveBeenCalledWith(
        'codefluent.anthropicApiKey',
        'sk-ant-abc123',
      )
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'CodeFluent: API key saved to SecretStorage.',
      )
    })

    it('warns when an env var will override the stored key', async () => {
      ;(vscode.window.showInputBox as jest.Mock).mockResolvedValue('sk-ant-xyz')
      activate(context)
      const { CodeFluentViewProvider } = require('../../src/webviewProvider')
      const providerInstance = CodeFluentViewProvider.mock.results[0].value
      providerInstance.detectOverridingKeySource.mockReturnValue('env')

      await getSetApiKeyCallback()()

      expect(context.secrets.store).toHaveBeenCalled()
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('environment variable'),
      )
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalled()
    })

    it('warns when a workspace .env will override the stored key', async () => {
      ;(vscode.window.showInputBox as jest.Mock).mockResolvedValue('sk-ant-xyz')
      activate(context)
      const { CodeFluentViewProvider } = require('../../src/webviewProvider')
      const providerInstance = CodeFluentViewProvider.mock.results[0].value
      providerInstance.detectOverridingKeySource.mockReturnValue('dotenv')

      await getSetApiKeyCallback()()

      expect(context.secrets.store).toHaveBeenCalled()
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('workspace .env'),
      )
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalled()
    })

    it('does nothing when the user cancels the input box', async () => {
      ;(vscode.window.showInputBox as jest.Mock).mockResolvedValue(undefined)
      activate(context)

      await getSetApiKeyCallback()()

      expect(context.secrets.store).not.toHaveBeenCalled()
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalled()
    })

    it('does nothing when the user enters only whitespace', async () => {
      ;(vscode.window.showInputBox as jest.Mock).mockResolvedValue('   ')
      activate(context)

      await getSetApiKeyCallback()()

      expect(context.secrets.store).not.toHaveBeenCalled()
      expect(vscode.window.showInformationMessage).not.toHaveBeenCalled()
    })
  })

  it('deactivate is a no-op function', () => {
    expect(deactivate).toBeDefined()
    expect(() => deactivate()).not.toThrow()
  })
})
