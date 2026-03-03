import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { getAllSessions } from './parser'
import { getUsageData } from './usage'
import { scoreSessions, computeAggregate, scoreClaudeMd } from './scoring'
import { getQuickWins } from './quickwins'
import { ScoreCache } from './cache'
import { getDefaultShell, getShellArgs, escapePromptForShell, getClaudeCommand } from './platform'

export class CodeFluentViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'codefluent.dashboard'

  private view?: vscode.WebviewView
  private readonly cache: ScoreCache
  private statusBar?: vscode.StatusBarItem

  constructor(
    private readonly context: vscode.ExtensionContext,
    statusBar?: vscode.StatusBarItem,
  ) {
    this.cache = new ScoreCache(context.globalStorageUri)
    this.statusBar = statusBar
  }

  public setStatusBar(statusBar: vscode.StatusBarItem) {
    this.statusBar = statusBar
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this.view = webviewView

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
    }

    webviewView.webview.html = this.getHtmlContent()

    webviewView.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
    )

    webviewView.onDidDispose(() => {
      this.view = undefined
    })
  }

  public focus() {
    if (this.view) {
      this.view.show(true)
    }
  }

  private readDotEnv(): string | undefined {
    const dirs: string[] = []

    // Check workspace folders first
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (workspaceFolders) {
      for (const folder of workspaceFolders) {
        dirs.push(folder.uri.fsPath)
      }
    }

    // Fallback: parent of extension dir (for dev/F5 launch)
    dirs.push(path.resolve(this.context.extensionUri.fsPath, '..'))

    for (const dir of dirs) {
      const envPath = path.join(dir, '.env')
      try {
        const content = fs.readFileSync(envPath, 'utf8')
        for (const line of content.split('\n')) {
          const match = line.match(/^\s*ANTHROPIC_API_KEY\s*=\s*(.+)\s*$/)
          if (match) return match[1].trim()
        }
      } catch {
        // .env not found in this dir
      }
    }
    return undefined
  }

  private async getApiKey(): Promise<string | undefined> {
    const envKey = process.env.ANTHROPIC_API_KEY
    if (envKey) return envKey

    const dotenvKey = this.readDotEnv()
    if (dotenvKey) return dotenvKey

    const storedKey = await this.context.secrets.get('codefluent.anthropicApiKey')
    if (storedKey) return storedKey

    const inputKey = await vscode.window.showInputBox({
      prompt: 'Enter your Anthropic API key for AI fluency scoring',
      password: true,
      placeHolder: 'sk-ant-...',
      ignoreFocusOut: true,
    })
    if (inputKey) {
      await this.context.secrets.store('codefluent.anthropicApiKey', inputKey)
      return inputKey
    }

    return undefined
  }

  private async handleMessage(msg: { type: string; requestId?: string; payload?: any; text?: string; prompt?: string; repo?: string }) {
    const { type, requestId, payload } = msg

    if (type === 'copyToClipboard' && msg.text) {
      await vscode.env.clipboard.writeText(msg.text)
      return
    }

    if (type === 'runInTerminal' && msg.prompt) {
      const escaped = escapePromptForShell(msg.prompt)
      const terminal = vscode.window.createTerminal({
        name: `Claude Code: ${msg.repo || 'Quick Win'}`,
        shellPath: getDefaultShell(),
        shellArgs: getShellArgs(),
        env: { PATH: process.env.PATH || '' },
      })
      terminal.show()
      terminal.sendText(getClaudeCommand(escaped))
      return
    }

    if (!requestId) return

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

      this.view?.webview.postMessage({ type, requestId, data })
    } catch (err: any) {
      this.view?.webview.postMessage({ type, requestId, error: err.message || 'Request failed' })
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
    this.cache.writeLastScoredIds(sessionIds)

    // Score CLAUDE.md if present in workspace
    const configBehaviors = await this.scoreWorkspaceClaudeMd(client, force)

    const scored = Object.values(results).filter((r: any) => r.fluency_behaviors)
    const aggregate = scored.length ? computeAggregate(scored, configBehaviors) : {}

    this.updateStatusBar(aggregate)

    return { scores: results, aggregate }
  }

  private async handleGetQuickwins() {
    const apiKey = await this.getApiKey()
    if (!apiKey) {
      throw new Error('Anthropic API key is required for quick wins')
    }

    const client = new Anthropic({ apiKey })
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    return getQuickWins(client, workspacePath)
  }

  private async handleGetCachedScores() {
    const cached = this.cache.read()
    const lastScoredIds = this.cache.readLastScoredIds()

    // Scope to last-scored session IDs if available, otherwise fall back to all
    const scopedScores: Record<string, any> = lastScoredIds.length
      ? Object.fromEntries(lastScoredIds.filter(id => id in cached).map(id => [id, cached[id]]))
      : cached
    const scored = Object.values(scopedScores).filter((r: any) => r.fluency_behaviors)

    // Load cached config score
    const configBehaviors = this.getCachedConfigBehaviors()
    const aggregate = scored.length ? computeAggregate(scored, configBehaviors) : {}

    this.updateStatusBar(aggregate)

    return { scores: scopedScores, aggregate }
  }

  private async scoreWorkspaceClaudeMd(
    client: Anthropic,
    forceRescore: boolean,
  ): Promise<Record<string, boolean> | undefined> {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!workspacePath) {
      console.warn('[CodeFluent] No workspace folder — skipping CLAUDE.md scoring')
      return undefined
    }

    const claudeMdPath = path.join(workspacePath, 'CLAUDE.md')
    let content: string
    try {
      content = fs.readFileSync(claudeMdPath, 'utf8')
    } catch {
      console.warn('[CodeFluent] No CLAUDE.md found at', claudeMdPath)
      return undefined
    }

    const hash = ScoreCache.contentHash(content)
    const configCache = this.cache.readConfig()
    const projectKey = workspacePath

    if (!forceRescore && configCache[projectKey]?.hash === hash) {
      return configCache[projectKey].fluency_behaviors
    }

    try {
      const result = await scoreClaudeMd(content, client)
      configCache[projectKey] = {
        hash,
        fluency_behaviors: result.fluency_behaviors,
        one_line_summary: result.one_line_summary,
      }
      this.cache.writeConfig(configCache)
      return result.fluency_behaviors
    } catch (err: any) {
      console.error('[CodeFluent] CLAUDE.md scoring failed:', err?.message || err)
      return undefined
    }
  }

  private getCachedConfigBehaviors(): Record<string, boolean> | undefined {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!workspacePath) return undefined

    const configCache = this.cache.readConfig()
    return configCache[workspacePath]?.fluency_behaviors
  }

  private updateStatusBar(aggregate: any) {
    if (this.statusBar && aggregate?.average_score) {
      this.statusBar.text = `$(pulse) ${aggregate.average_score}`
      this.statusBar.tooltip = `CodeFluent: Fluency Score ${aggregate.average_score}/100`
    }
  }

  private getHtmlContent(): string {
    if (!this.view) return ''

    const webview = this.view.webview
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
