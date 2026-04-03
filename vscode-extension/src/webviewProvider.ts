import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { getAllConversations } from './conversation'
import { getUsageData } from './usage'
import { scoreConversations, computeAggregate, scoreClaudeMd, computeScoreHistory, CONFIG_SCORING_PROMPT_VERSION, optimizePrompt, scoreSinglePrompt, OPTIMIZER_PROMPT_VERSION, OptimizeResponse } from './scoring'
import { getQuickWins } from './quickwins'
import { ScoreCache } from './cache'
import { DataCache } from './dataCache'
import { getDefaultShell, getShellArgs, escapePromptForShell, getClaudeCommand } from './platform'
import { buildConversationAnalytics } from './analytics'
import { computeAgentMetrics, computeWeeklyAgentMetrics, AgentMetrics, WeeklyAgentMetrics } from './agentMetrics'
import { getConfig, getDisplayConfig } from './config'

export class CodeFluentViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'codefluent.dashboard'

  private view?: vscode.WebviewView
  private readonly cache: ScoreCache
  private readonly dataCache: DataCache
  private statusBar?: vscode.StatusBarItem

  constructor(
    private readonly context: vscode.ExtensionContext,
    statusBar?: vscode.StatusBarItem,
  ) {
    this.cache = new ScoreCache(context.globalStorageUri)
    this.dataCache = new DataCache(context.globalStorageUri)
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

  private getSessionDataPath(): string | undefined {
    const customPath = vscode.workspace.getConfiguration('codefluent').get<string>('sessionDataPath')
    return customPath || undefined
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

    if (type === 'refreshData') {
      this.dataCache.invalidate()
      this.refreshInBackground()
      return
    }

    if (!requestId) return

    try {
      let data: any

      switch (type) {
        case 'getUsage':
          data = await this.handleGetUsage()
          break
        case 'getConversations':
        case 'getSessions': // deprecated alias
          data = await this.handleGetConversations(payload)
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
        case 'getBenchmarks':
          data = this.handleGetBenchmarks()
          break
        case 'optimizePrompt':
          data = await this.handleOptimizePrompt(payload)
          break
        case 'getConversationAnalytics':
        case 'getSessionAnalytics': // deprecated alias
          data = await this.handleGetConversationAnalytics(payload)
          break
        case 'getAgentMetrics':
          data = await this.handleGetAgentMetrics(payload)
          break
        case 'getConfig':
          data = this.handleGetConfig()
          break
        default:
          return
      }

      this.view?.webview.postMessage({ type, requestId, data })
    } catch (err: any) {
      const errMsg = (err.message || 'Request failed').replace(/sk-ant-[a-zA-Z0-9_-]+/g, '[REDACTED]')
      this.view?.webview.postMessage({ type, requestId, error: errMsg })
    }
  }

  private async handleGetUsage() {
    const { data, isStale } = this.dataCache.getUsage()
    if (data && !isStale) return data
    if (data && isStale) {
      this.refreshUsageInBackground()
      return data
    }
    const fresh = await getUsageData()
    this.dataCache.setUsage(fresh)
    return fresh
  }

  private getWorkspaceProjectName(): string | undefined {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    return workspacePath ? path.basename(workspacePath) : undefined
  }

  private async handleGetConversations(payload?: { limit?: number; project?: string }) {
    const limit = payload?.limit ?? 1000
    const project = payload?.project ?? this.getWorkspaceProjectName()
    const { data, isStale } = this.dataCache.getConversations()
    if (data && !isStale) return this.filterConversations(data, limit, project)
    if (data && isStale) {
      this.refreshConversationsInBackground()
      return this.filterConversations(data, limit, project)
    }
    const fresh = getAllConversations(undefined, undefined, this.getSessionDataPath(), 200)
    this.dataCache.setConversations(fresh)
    return this.filterConversations(fresh, limit, project)
  }

  private filterConversations(result: any, limit?: number, project?: string): any {
    let conversations = result.conversations || []
    if (project) {
      conversations = conversations.filter((c: any) => c.project === project)
    }
    const total = conversations.length
    if (limit) {
      conversations = conversations.slice(0, limit)
    }
    return {
      conversations,
      // Deprecated alias for backward compat
      sessions: conversations,
      metadata: {
        ...result.metadata,
        total_conversations: total,
        total_sessions: total, // deprecated alias
        total_projects: new Set(conversations.map((c: any) => c.project)).size,
        total_prompts: conversations.reduce((sum: number, c: any) => sum + (c.user_prompts?.length || 0), 0),
      },
    }
  }

  private async handleRunScoring(payload?: { conversation_ids?: string[]; session_ids?: string[]; force_rescore?: boolean }) {
    // Accept both conversation_ids (new) and session_ids (deprecated)
    const conversationIds = payload?.conversation_ids || payload?.session_ids || []
    const force = payload?.force_rescore || false

    const apiKey = await this.getApiKey()
    if (!apiKey) {
      throw new Error('Anthropic API key is required for scoring')
    }

    const client = new Anthropic({ apiKey })
    const cached = this.cache.read()
    // Always fetch fresh conversations when user explicitly runs scoring
    const convData = getAllConversations(undefined, undefined, this.getSessionDataPath(), 200)
    this.dataCache.setConversations(convData)
    const conversations = convData.conversations || []
    const allConversations = Object.fromEntries(conversations.map((c: any) => [c.id, c]))

    const { results, stats } = await scoreConversations(conversationIds, allConversations, cached, client, force)

    this.cache.write(cached)
    this.cache.writeLastScoredIds(conversationIds)

    // Score CLAUDE.md if present in workspace
    const configBehaviors = await this.scoreWorkspaceClaudeMd(client, force)

    const scored = Object.values(results).filter((r: any) => r.fluency_behaviors)
    const aggregate = scored.length ? computeAggregate(scored, configBehaviors) : {} as any
    aggregate.conversations_requested = conversationIds.length
    aggregate.conversations_scored = scored.length
    aggregate.conversations_skipped = stats.skipped_no_prompts
    aggregate.conversations_errored = stats.errored
    aggregate.conversations_cached = stats.cached
    // Deprecated aliases
    aggregate.sessions_requested = conversationIds.length
    aggregate.sessions_scored = scored.length
    aggregate.sessions_skipped = stats.skipped_no_prompts
    aggregate.sessions_errored = stats.errored
    aggregate.sessions_cached = stats.cached
    const projectName = this.getWorkspaceProjectName()
    const projectConvs = projectName
      ? conversations.filter((c: any) => c.project === projectName)
      : conversations
    aggregate.score_history = computeScoreHistory(cached, projectConvs, configBehaviors)

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

    let claudeMdContent: string | undefined
    if (workspacePath) {
      const claudeMdPath = path.join(workspacePath, 'CLAUDE.md')
      try {
        claudeMdContent = fs.readFileSync(claudeMdPath, 'utf8')
      } catch {
        // No CLAUDE.md found — that's fine
      }
    }

    return getQuickWins(client, workspacePath, claudeMdContent)
  }

  private handleGetBenchmarks() {
    const benchmarksPath = path.join(this.context.extensionUri.fsPath, 'shared', 'benchmarks.json')
    const data = JSON.parse(fs.readFileSync(benchmarksPath, 'utf8'))
    return data.benchmarks
  }

  private handleGetConfig() {
    return getDisplayConfig()
  }

  private async handleOptimizePrompt(payload?: { prompt?: string }): Promise<OptimizeResponse> {
    const inputPrompt = payload?.prompt?.trim()
    if (!inputPrompt) {
      throw new Error('Prompt is required')
    }
    if (inputPrompt.length > 10000) {
      throw new Error('Prompt must be 10,000 characters or less')
    }

    // Check cache (include workspace path so different projects get separate entries)
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || ''
    const cacheKey = ScoreCache.contentHash(inputPrompt + workspacePath)
    const optimizerCache = this.cache.readOptimizer()
    if (optimizerCache[cacheKey]?.prompt_version === OPTIMIZER_PROMPT_VERSION) {
      return optimizerCache[cacheKey]
    }

    const apiKey = await this.getApiKey()
    if (!apiKey) {
      throw new Error('Anthropic API key is required for prompt optimization')
    }
    const client = new Anthropic({ apiKey })

    // Score CLAUDE.md if not cached (result benefits Fluency Score tab, Quick Wins, etc.)
    const configBehaviors = await this.scoreWorkspaceClaudeMd(client, false)

    // Call 1: Optimize (pass config behavior flags so it avoids redundant behaviors)
    const optimizerResult = await optimizePrompt(inputPrompt, client, configBehaviors)

    // Merge input behaviors with config: effective = prompt OR config
    const effectiveInputBehaviors = this.mergeWithConfig(optimizerResult.input_behaviors, configBehaviors)
    const effectiveInputScore = Math.round(
      (Object.values(effectiveInputBehaviors).filter(Boolean).length / 11) * 100
    )

    // No-op: already good (check effective score including config)
    if (effectiveInputScore >= getConfig<number>('optimizer.alreadyGoodThreshold') || !optimizerResult.optimized_prompt) {
      const response: OptimizeResponse = {
        already_good: true,
        input_score: effectiveInputScore,
        input_behaviors: effectiveInputBehaviors,
        one_line_summary: optimizerResult.one_line_summary,
        prompt_version: OPTIMIZER_PROMPT_VERSION,
      }
      optimizerCache[cacheKey] = response
      this.cache.writeOptimizer(optimizerCache)
      return response
    }

    // Call 2: Score the optimized prompt standalone (no config context needed)
    const singleScore = await scoreSinglePrompt(optimizerResult.optimized_prompt, client)

    // Merge output behaviors with config: effective = prompt OR config
    const effectiveOutputBehaviors = this.mergeWithConfig(singleScore.fluency_behaviors, configBehaviors)
    const effectiveOutputScore = Math.round(
      (Object.values(effectiveOutputBehaviors).filter(Boolean).length / 11) * 100
    )

    // Compute behaviors_added from actual score difference (not optimizer self-report)
    const behaviorsAdded = Object.keys(effectiveOutputBehaviors)
      .filter(k => effectiveOutputBehaviors[k] && !effectiveInputBehaviors[k])

    const response: OptimizeResponse = {
      input_score: effectiveInputScore,
      input_behaviors: effectiveInputBehaviors,
      optimized_prompt: optimizerResult.optimized_prompt,
      output_score: effectiveOutputScore,
      output_behaviors: effectiveOutputBehaviors,
      behaviors_added: behaviorsAdded,
      explanation: optimizerResult.explanation,
      one_line_summary: optimizerResult.one_line_summary,
      prompt_version: OPTIMIZER_PROMPT_VERSION,
    }

    optimizerCache[cacheKey] = response
    this.cache.writeOptimizer(optimizerCache)
    return response
  }

  private async handleGetAgentMetrics(payload?: { project?: string }): Promise<AgentMetrics & { weekly: WeeklyAgentMetrics[] }> {
    const project = payload?.project ?? this.getWorkspaceProjectName()
    const convData = getAllConversations(undefined, undefined, this.getSessionDataPath(), 200)
    this.dataCache.setConversations(convData)
    let conversations = convData.conversations || []
    if (project) {
      conversations = conversations.filter((c: any) => c.project === project)
    }
    const metrics = computeAgentMetrics(conversations)
    const weekly = computeWeeklyAgentMetrics(conversations)
    return { ...metrics, weekly }
  }

  private async handleGetConversationAnalytics(payload?: { project?: string }) {
    const project = payload?.project ?? this.getWorkspaceProjectName()
    // Always fetch fresh conversations for analytics
    const convData = getAllConversations(undefined, undefined, this.getSessionDataPath(), 200)
    this.dataCache.setConversations(convData)
    let conversations = convData.conversations || []
    if (project) {
      conversations = conversations.filter((c: any) => c.project === project)
    }

    const cached = this.cache.read()
    const scores = Object.values(cached).filter((r: any) => r.fluency_behaviors)

    // Read config behaviors from config score cache for effective score computation
    const configCache = this.cache.readConfig()
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    const configEntry = workspacePath ? configCache[workspacePath] : undefined
    const configBehaviors = configEntry?.fluency_behaviors as Record<string, boolean> | undefined

    return buildConversationAnalytics(conversations, scores as any[], configBehaviors)
  }

  private mergeWithConfig(
    promptBehaviors: Record<string, boolean>,
    configBehaviors?: Record<string, boolean>,
  ): Record<string, boolean> {
    if (!configBehaviors) return { ...promptBehaviors }
    const merged: Record<string, boolean> = { ...promptBehaviors }
    for (const [key, value] of Object.entries(configBehaviors)) {
      if (value) merged[key] = true
    }
    return merged
  }

  private async handleGetCachedScores() {
    const cached = this.cache.read()
    const lastScoredIds = this.cache.readLastScoredIds()

    // Scope to last-scored conversation IDs if available, otherwise fall back to all
    const scopedScores: Record<string, any> = lastScoredIds.length
      ? Object.fromEntries(lastScoredIds.filter(id => id in cached).map(id => [id, cached[id]]))
      : cached

    // Filter to workspace project conversations only
    const projectName = this.getWorkspaceProjectName()
    const convData = this.dataCache.getConversations().data || getAllConversations(undefined, undefined, this.getSessionDataPath(), 200)
    const conversations = convData.conversations || convData.sessions || []
    const workspaceConvIds = projectName
      ? new Set(conversations.filter((c: any) => c.project === projectName).map((c: any) => c.id))
      : null
    const projectScores: Record<string, any> = workspaceConvIds
      ? Object.fromEntries(Object.entries(scopedScores).filter(([id]) => workspaceConvIds.has(id)))
      : scopedScores
    const scored = Object.values(projectScores).filter((r: any) => r.fluency_behaviors)

    // Load cached config score
    const configBehaviors = this.getCachedConfigBehaviors()
    const aggregate = scored.length ? computeAggregate(scored, configBehaviors) : {} as any
    if (lastScoredIds.length) {
      const workspaceLastScoredIds = workspaceConvIds
        ? lastScoredIds.filter(id => workspaceConvIds.has(id))
        : lastScoredIds
      aggregate.conversations_requested = workspaceLastScoredIds.length
      aggregate.conversations_scored = scored.length
      const gap = workspaceLastScoredIds.length - scored.length
      aggregate.conversations_skipped = gap > 0 ? gap : 0
      aggregate.conversations_errored = 0
      // Deprecated aliases
      aggregate.sessions_requested = aggregate.conversations_requested
      aggregate.sessions_scored = aggregate.conversations_scored
      aggregate.sessions_skipped = aggregate.conversations_skipped
      aggregate.sessions_errored = 0
    }
    aggregate.score_history = computeScoreHistory(cached, conversations.filter((c: any) => !projectName || c.project === projectName), configBehaviors)

    this.updateStatusBar(aggregate)

    return { scores: projectScores, aggregate }
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

    if (!forceRescore && configCache[projectKey]?.hash === hash && configCache[projectKey]?.prompt_version === CONFIG_SCORING_PROMPT_VERSION) {
      return configCache[projectKey].fluency_behaviors
    }

    try {
      const result = await scoreClaudeMd(content, client)
      configCache[projectKey] = {
        hash,
        prompt_version: CONFIG_SCORING_PROMPT_VERSION,
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

  private refreshUsageInBackground(): void {
    setImmediate(async () => {
      try {
        const fresh = await getUsageData()
        this.dataCache.setUsage(fresh)
        this.view?.webview.postMessage({ type: 'usageUpdated', data: fresh })
      } catch (err: any) {
        console.error('[CodeFluent] Background usage refresh failed:', err?.message || err)
      }
    })
  }

  private refreshConversationsInBackground(): void {
    setImmediate(() => {
      try {
        const fresh = getAllConversations(undefined, undefined, this.getSessionDataPath(), 200)
        this.dataCache.setConversations(fresh)
        const filtered = this.filterConversations(fresh, undefined, this.getWorkspaceProjectName())
        this.view?.webview.postMessage({ type: 'conversationsUpdated', data: filtered })
      } catch (err: any) {
        console.error('[CodeFluent] Background conversations refresh failed:', err?.message || err)
      }
    })
  }

  private refreshInBackground(): void {
    this.refreshUsageInBackground()
    this.refreshConversationsInBackground()
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
