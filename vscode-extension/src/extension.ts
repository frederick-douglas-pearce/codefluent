import * as vscode from 'vscode'
import { CodeFluentPanel } from './webviewProvider'

export function activate(context: vscode.ExtensionContext) {
  const command = vscode.commands.registerCommand('codefluent.openPanel', () => {
    CodeFluentPanel.createOrShow(context)
  })
  context.subscriptions.push(command)
}

export function deactivate() {}
