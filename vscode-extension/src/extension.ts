import * as vscode from 'vscode'
import { CodeFluentViewProvider } from './webviewProvider'

export function activate(context: vscode.ExtensionContext): void {
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
  statusBar.command = 'codefluent.openPanel'
  statusBar.text = '$(pulse) --'
  statusBar.tooltip = 'CodeFluent: Fluency Score'
  statusBar.show()
  context.subscriptions.push(statusBar)

  const provider = new CodeFluentViewProvider(context, statusBar)

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(CodeFluentViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('codefluent.openPanel', () => {
      provider.focus()
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('codefluent.setApiKey', async () => {
      const input = await vscode.window.showInputBox({
        prompt: 'Enter your Anthropic API key (stored in VS Code SecretStorage)',
        password: true,
        placeHolder: 'sk-ant-...',
        ignoreFocusOut: true,
      })
      if (!input) return
      const trimmed = input.trim()
      if (!trimmed) return
      await context.secrets.store('codefluent.anthropicApiKey', trimmed)

      const overridingSource = provider.detectOverridingKeySource()
      if (overridingSource === 'env') {
        vscode.window.showWarningMessage(
          'CodeFluent: Key saved, but an ANTHROPIC_API_KEY environment variable is set and takes precedence. ' +
          'The stored key will not be used until that variable is unset (fully quit and relaunch VS Code after unsetting).',
        )
      } else if (overridingSource === 'dotenv') {
        vscode.window.showWarningMessage(
          'CodeFluent: Key saved, but a workspace .env file with ANTHROPIC_API_KEY takes precedence. ' +
          'The stored key will not be used until that entry is removed from your workspace .env.',
        )
      } else {
        vscode.window.showInformationMessage('CodeFluent: API key saved to SecretStorage.')
      }
    })
  )
}

export function deactivate(): void {}
