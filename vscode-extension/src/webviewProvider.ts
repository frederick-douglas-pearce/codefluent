import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { getAllSessions } from './parser'
import { getUsageData } from './usage'
import { scoreSessions, computeAggregate } from './scoring'
import { getQuickWins } from './quickwins'
import { ScoreCache } from './cache'

export class CodeFluentPanel {
  public static currentPanel: CodeFluentPanel | undefined
  private static readonly viewType = 'codefluent'

  private readonly panel: vscode.WebviewPanel
  private readonly context: vscode.ExtensionContext
  private readonly cache: ScoreCache
  private disposed = false

  public static createOrShow(context: vscode.ExtensionContext) {
    if (CodeFluentPanel.currentPanel) {
      CodeFluentPanel.currentPanel.panel.reveal(vscode.ViewColumn.One)
      return
    }

    const panel = vscode.window.createWebviewPanel(
      CodeFluentPanel.viewType,
      'CodeFluent',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
        retainContextWhenHidden: true,
      }
    )

    CodeFluentPanel.currentPanel = new CodeFluentPanel(panel, context)
  }

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this.panel = panel
    this.context = context
    this.cache = new ScoreCache(context.globalStorageUri)

    this.panel.webview.html = this.getHtmlContent()

    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
    )

    this.panel.onDidDispose(() => {
      this.disposed = true
      CodeFluentPanel.currentPanel = undefined
    })
  }

  private async getApiKey(): Promise<string | undefined> {
    // 1. Environment variable
    const envKey = process.env.ANTHROPIC_API_KEY
    if (envKey) return envKey

    // 2. VS Code SecretStorage
    const storedKey = await this.context.secrets.get('codefluent.anthropicApiKey')
    if (storedKey) return storedKey

    // 3. Prompt user
    const inputKey = await vscode.window.showInputBox({
      prompt: 'Enter your Anthropic API key for AI fluency scoring',
      password: true,
      placeHolder: 'sk-ant-...',
    })
    if (inputKey) {
      await this.context.secrets.store('codefluent.anthropicApiKey', inputKey)
      return inputKey
    }

    return undefined
  }

  private async handleMessage(msg: { type: string; requestId: string; payload?: any }) {
    const { type, requestId, payload } = msg

    try {
      let data: any

      switch (type) {
        case 'getUsage':
          data = await this.handleGetUsage()
          break
        case 'getSessions':
          data = await this.handleGetSessions(payload)
          break
        case 'runScoring':
          data = await this.handleRunScoring(payload)
          break
        case 'getQuickwins':
          data = await this.handleGetQuickwins()
          break
        case 'getCachedScores':
          data = await this.handleGetCachedScores()
          break
        default:
          return
      }

      this.panel.webview.postMessage({ type, requestId, data })
    } catch (err: any) {
      this.panel.webview.postMessage({ type, requestId, error: err.message || 'Request failed' })
    }
  }

  private async handleGetUsage() {
    return getUsageData()
  }

  private async handleGetSessions(payload?: { limit?: number; project?: string }) {
    const limit = payload?.limit ?? 50
    const project = payload?.project
    return getAllSessions(limit, project)
  }

  private async handleRunScoring(payload?: { session_ids?: string[]; force_rescore?: boolean }) {
    const sessionIds = payload?.session_ids || []
    const force = payload?.force_rescore || false

    const apiKey = await this.getApiKey()
    if (!apiKey) {
      throw new Error('Anthropic API key is required for scoring')
    }

    const client = new Anthropic({ apiKey })
    const cached = this.cache.read()
    const { sessions } = getAllSessions()
    const allSessions = Object.fromEntries(sessions.map(s => [s.id, s]))

    const results = await scoreSessions(sessionIds, allSessions, cached, client, force)

    this.cache.write(cached)

    const scored = Object.values(results).filter((r: any) => r.fluency_behaviors)
    const aggregate = scored.length ? computeAggregate(scored) : {}

    return { scores: results, aggregate }
  }

  private async handleGetQuickwins() {
    const apiKey = await this.getApiKey()
    if (!apiKey) {
      throw new Error('Anthropic API key is required for quick wins')
    }

    const client = new Anthropic({ apiKey })
    return getQuickWins(client)
  }

  private async handleGetCachedScores() {
    const cached = this.cache.read()
    const scored = Object.values(cached).filter((r: any) => r.fluency_behaviors)
    const aggregate = scored.length ? computeAggregate(scored) : {}
    return { scores: cached, aggregate }
  }

  private getHtmlContent(): string {
    const webview = this.panel.webview
    const mediaUri = vscode.Uri.joinPath(this.context.extensionUri, 'media')

    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'style.css'))
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'app.js'))
    const chartUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'libs', 'chart.min.js'))

    const nonce = getNonce()

    const htmlPath = path.join(this.context.extensionUri.fsPath, 'media', 'index.html')
    let html = fs.readFileSync(htmlPath, 'utf8')

    html = html.replace(/{{styleUri}}/g, styleUri.toString())
    html = html.replace(/{{scriptUri}}/g, scriptUri.toString())
    html = html.replace(/{{chartUri}}/g, chartUri.toString())
    html = html.replace(/{{nonce}}/g, nonce)
    html = html.replace(/{{cspSource}}/g, webview.cspSource)

    return html
  }
}

function getNonce(): string {
  let text = ''
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return text
}
