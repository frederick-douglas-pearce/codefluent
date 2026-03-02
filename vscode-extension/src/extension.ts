import * as vscode from 'vscode'
import { CodeFluentViewProvider } from './webviewProvider'

export function activate(context: vscode.ExtensionContext) {
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

  const command = vscode.commands.registerCommand('codefluent.openPanel', () => {
    provider.focus()
  })
  context.subscriptions.push(command)
}

export function deactivate() {}
