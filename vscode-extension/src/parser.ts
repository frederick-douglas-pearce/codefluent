import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export interface ParsedSession {
  id: string
  project: string
  project_path_encoded: string
  started_at: string | null
  ended_at: string | null
  user_prompts: string[]
  user_message_count: number
  assistant_message_count: number
  tool_use_count: number
  tools_used: string[]
  commands_used: string[]
  thinking_count: number
  used_plan_mode: boolean
  model: string | null
  claude_code_version: string | null
  git_branch: string | null
  total_input_tokens: number
  total_output_tokens: number
  total_cache_creation_tokens: number
  total_cache_read_tokens: number
  total_tokens: number
  tokens_per_prompt: number
  cache_hit_rate: number
}

export interface SessionsResult {
  sessions: ParsedSession[]
  metadata: {
    total_sessions: number
    total_projects: number
    total_prompts: number
    extracted_at: string
  }
}

export interface TimestampedMessage {
  type: string                  // 'user' | 'assistant' | 'tool_use' | 'thinking'
  timestamp: string | null
  session_id: string
  file_position: number         // line index within source file (for stable sort)
  // User message fields
  content?: string              // extracted text (truncated to 2000 chars)
  used_plan_mode?: boolean      // true if planContent present
  is_clear_command?: boolean    // true if /clear command
  command_name?: string         // e.g. '/rebuild' (custom commands/skills only)
  // Assistant message fields
  usage?: { input_tokens: number; output_tokens: number;
            cache_creation_input_tokens: number; cache_read_input_tokens: number }
  tool_names?: string[]         // tool names from assistant content blocks
  tool_use_ids?: string[]       // tool_use block IDs from assistant content blocks
  model?: string
  // Tool result fields
  is_error?: boolean            // true if tool_result had is_error: true
  tool_use_id?: string          // links to originating tool_use block
  error_content?: string        // truncated error text (first 500 chars)
  // Metadata (from first message that has it)
  claude_code_version?: string
  git_branch?: string
}

export interface SessionMessagesResult {
  messages: TimestampedMessage[]
  session_id: string
  project: string
  project_path_encoded: string
}

const SKIP_TYPES = new Set([
  'file-history-snapshot', 'tool_result', 'progress',
  'hook_progress', 'bash_progress', 'system', 'create',
])

export function extractUserText(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim()
  }
  if (Array.isArray(content)) {
    const parts: string[] = []
    for (const block of content) {
      if (block && typeof block === 'object' && (block as any).type === 'text') {
        const text = ((block as any).text || '').trim()
        if (text) parts.push(text)
      }
    }
    return parts.join(' ')
  }
  return ''
}

export function isSlashCommand(text: string): boolean {
  return /<command-name>\//.test(text)
}

export function isClearCommand(text: string): boolean {
  return /<command-name>\/clear<\/command-name>/.test(text)
}

/** Known system commands — meta-operations, not interactions with Claude. */
export const SYSTEM_COMMANDS = new Set([
  '/clear', '/compact', '/exit', '/login', '/logout',
  '/status', '/init', '/help', '/cost', '/doctor',
  '/config', '/memory', '/permissions', '/review',
  '/terminal-setup', '/listen', '/mcp', '/vim',
])

export function extractCommandName(text: string): string | null {
  const match = text.match(/<command-name>(\/[^<]+)<\/command-name>/)
  return match ? match[1] : null
}

export function isCustomCommand(text: string): boolean {
  const name = extractCommandName(text)
  if (!name) return false
  return !SYSTEM_COMMANDS.has(name)
}

/** Detect system-injected messages that arrive as type: "user" but are not human input. */
export function isSystemInjectedMessage(text: string): boolean {
  if (/<task-notification[\s>]/.test(text)) return true
  if (/<system-reminder[\s>]/.test(text)) return true
  if (/<local-command-caveat[\s>]/.test(text)) return true
  if (/<local-command-stdout[\s>]/.test(text)) return true
  if (/<local-command-stderr[\s>]/.test(text)) return true
  if (/<user-prompt-submit-hook[\s>]/.test(text)) return true
  if (text.startsWith('This session is being continued from a previous conversation')) return true
  return false
}

export function parseSessionFile(filepath: string): ParsedSession | null {
  let raw: string
  try {
    raw = fs.readFileSync(filepath, 'utf8')
  } catch {
    return null
  }

  const lines: any[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      lines.push(JSON.parse(trimmed))
    } catch {
      continue
    }
  }

  if (lines.length === 0) return null

  let sessionId: string | null = null
  let projectCwd: string | null = null
  const userPrompts: string[] = []
  const timestamps: string[] = []
  let toolUseCount = 0
  const toolsUsed = new Set<string>()
  const commandsUsed = new Set<string>()
  let thinkingCount = 0
  let userMsgCount = 0
  let assistantMsgCount = 0
  let usedPlanMode = false
  let model: string | null = null
  let version: string | null = null
  let gitBranch: string | null = null
  let isSidechain = false
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCacheCreationTokens = 0
  let totalCacheReadTokens = 0

  // Deduplication: Claude Code emits multiple assistant messages per API turn
  // (streaming chunks). Each carries the same input/cache tokens but incrementing
  // output tokens. We keep only the last message per turn to avoid over-counting.
  let pendingTurnUsage: { input: number; output: number; cacheCreate: number; cacheRead: number } | null = null
  let pendingTurnSig = '' // signature: "input:cacheCreate:cacheRead"

  function flushPendingTurn(): void {
    if (pendingTurnUsage) {
      totalInputTokens += pendingTurnUsage.input
      totalOutputTokens += pendingTurnUsage.output
      totalCacheCreationTokens += pendingTurnUsage.cacheCreate
      totalCacheReadTokens += pendingTurnUsage.cacheRead
      pendingTurnUsage = null
      pendingTurnSig = ''
    }
  }

  for (const msg of lines) {
    const msgType = msg.type || ''

    if (SKIP_TYPES.has(msgType)) continue

    if (!sessionId && msg.sessionId) sessionId = msg.sessionId
    if (!projectCwd && msg.cwd) projectCwd = msg.cwd
    if (!version && msg.version) version = msg.version
    if (!gitBranch && msg.gitBranch) gitBranch = msg.gitBranch
    if (msg.isSidechain === true) isSidechain = true

    if (msg.timestamp) timestamps.push(msg.timestamp)

    if (msgType === 'user') {
      flushPendingTurn()
      const content = msg.message?.content ?? ''
      const text = extractUserText(content)
      if (isSlashCommand(text)) {
        const cmdName = extractCommandName(text)
        if (cmdName && !SYSTEM_COMMANDS.has(cmdName)) {
          commandsUsed.add(cmdName)
        }
        continue  // skip all slash commands (not natural language prompts)
      }
      if (isSystemInjectedMessage(text)) continue  // skip system-injected messages
      userMsgCount++
      if (text && text !== '[Request interrupted by user for tool use]') {
        userPrompts.push(text.slice(0, 2000))
      }
      if (msg.planContent) usedPlanMode = true
    } else if (msgType === 'assistant') {
      const msgModel = msg.message?.model
      if (msgModel && !model) model = msgModel
      const usage = msg.message?.usage
      if (usage) {
        const sig = `${usage.input_tokens || 0}:${usage.cache_creation_input_tokens || 0}:${usage.cache_read_input_tokens || 0}`
        if (sig !== pendingTurnSig) {
          flushPendingTurn()
          assistantMsgCount++
        }
        // Always overwrite — last message in the turn has final output_tokens
        pendingTurnUsage = {
          input: usage.input_tokens || 0,
          output: usage.output_tokens || 0,
          cacheCreate: usage.cache_creation_input_tokens || 0,
          cacheRead: usage.cache_read_input_tokens || 0,
        }
        pendingTurnSig = sig
      } else {
        flushPendingTurn()
        assistantMsgCount++
      }
      const content = msg.message?.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block && typeof block === 'object' && block.type === 'tool_use') {
            toolUseCount++
            if (block.name) toolsUsed.add(block.name)
          }
        }
      }
    } else if (msgType === 'tool_use') {
      flushPendingTurn()
      toolUseCount++
      let name = msg.name || msg.message?.name
      if (!name) {
        const content = msg.message?.content
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block && typeof block === 'object' && block.type === 'tool_use') {
              name = block.name
              break
            }
          }
        }
      }
      if (name) toolsUsed.add(name)
    } else if (msgType === 'thinking') {
      flushPendingTurn()
      thinkingCount++
    }
  }
  flushPendingTurn()

  if (isSidechain) return null
  if (userPrompts.length === 0) return null

  if (!sessionId) sessionId = path.basename(filepath, '.jsonl')

  const projectName = projectCwd
    ? path.basename(projectCwd)
    : path.basename(path.dirname(filepath))

  timestamps.sort()

  // For nested files (<project>/<uuid>/session.jsonl), go up two levels for project dir
  const parentDirName = path.basename(path.dirname(filepath))
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  const projectPathEncoded = uuidPattern.test(parentDirName)
    ? path.basename(path.dirname(path.dirname(filepath)))
    : parentDirName

  const totalTokens = totalInputTokens + totalOutputTokens + totalCacheCreationTokens + totalCacheReadTokens
  const tokensPerPrompt = userMsgCount > 0 ? totalTokens / userMsgCount : 0
  const cacheHitDenom = totalCacheReadTokens + totalInputTokens + totalCacheCreationTokens
  const cacheHitRate = cacheHitDenom > 0 ? totalCacheReadTokens / cacheHitDenom : 0

  return {
    id: sessionId,
    project: projectName,
    project_path_encoded: projectPathEncoded,
    started_at: timestamps[0] || null,
    ended_at: timestamps[timestamps.length - 1] || null,
    user_prompts: userPrompts,
    user_message_count: userMsgCount,
    assistant_message_count: assistantMsgCount,
    tool_use_count: toolUseCount,
    tools_used: Array.from(toolsUsed).sort(),
    commands_used: Array.from(commandsUsed).sort(),
    thinking_count: thinkingCount,
    used_plan_mode: usedPlanMode,
    model,
    claude_code_version: version,
    git_branch: gitBranch,
    total_input_tokens: totalInputTokens,
    total_output_tokens: totalOutputTokens,
    total_cache_creation_tokens: totalCacheCreationTokens,
    total_cache_read_tokens: totalCacheReadTokens,
    total_tokens: totalTokens,
    tokens_per_prompt: tokensPerPrompt,
    cache_hit_rate: cacheHitRate,
  }
}

export function parseSessionMessages(filepath: string): SessionMessagesResult | null {
  let raw: string
  try {
    raw = fs.readFileSync(filepath, 'utf8')
  } catch {
    return null
  }

  const lines: any[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      lines.push(JSON.parse(trimmed))
    } catch {
      continue
    }
  }

  if (lines.length === 0) return null

  let sessionId: string | null = null
  let projectCwd: string | null = null
  let isSidechain = false
  let version: string | null = null
  let gitBranch: string | null = null

  const messages: TimestampedMessage[] = []

  // Deduplication: buffer the last assistant message per turn, emit on turn boundary.
  let pendingAssistant: TimestampedMessage | null = null
  let pendingAssistantSig = ''

  function flushPendingAssistant(): void {
    if (pendingAssistant) {
      messages.push(pendingAssistant)
      pendingAssistant = null
      pendingAssistantSig = ''
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const msg = lines[i]
    const msgType = msg.type || ''

    if (SKIP_TYPES.has(msgType)) continue

    if (!sessionId && msg.sessionId) sessionId = msg.sessionId
    if (!projectCwd && msg.cwd) projectCwd = msg.cwd
    if (!version && msg.version) version = msg.version
    if (!gitBranch && msg.gitBranch) gitBranch = msg.gitBranch
    if (msg.isSidechain === true) isSidechain = true

    if (msgType === 'user') {
      flushPendingAssistant()
      const content = msg.message?.content ?? ''
      const text = extractUserText(content)
      const isInterrupted = text === '[Request interrupted by user for tool use]'
      const isCommand = isSlashCommand(text)
      const isSystem = !isCommand && isSystemInjectedMessage(text)
      const isClear = isCommand && isClearCommand(text)
      const cmdName = isCommand ? extractCommandName(text) : null
      const isCustom = cmdName ? !SYSTEM_COMMANDS.has(cmdName) : false
      const extracted: TimestampedMessage = {
        type: 'user',
        timestamp: msg.timestamp || null,
        session_id: '', // filled after loop
        file_position: i,
        content: (!text || isInterrupted || isCommand || isSystem) ? undefined : text.slice(0, 2000),
        used_plan_mode: !!msg.planContent,
        is_clear_command: isClear || undefined,
        command_name: isCustom ? cmdName! : undefined,
      }
      if (!version && msg.version) extracted.claude_code_version = msg.version
      if (!gitBranch && msg.gitBranch) extracted.git_branch = msg.gitBranch
      messages.push(extracted)
      // Extract tool_result blocks embedded in user message content
      const rawContent = msg.message?.content
      if (Array.isArray(rawContent)) {
        for (const block of rawContent) {
          if (block && typeof block === 'object' && block.type === 'tool_result') {
            const isError = block.is_error === true
            let errorContent: string | undefined
            if (isError) {
              const blockContent = block.content
              if (typeof blockContent === 'string') {
                errorContent = blockContent.slice(0, 500)
              } else if (Array.isArray(blockContent)) {
                for (const sub of blockContent) {
                  if (sub && typeof sub === 'object' && (sub as any).type === 'text') {
                    errorContent = ((sub as any).text || '').slice(0, 500)
                    break
                  }
                }
              }
            }
            messages.push({
              type: 'tool_result',
              timestamp: msg.timestamp || null,
              session_id: '',
              file_position: i,
              is_error: isError || undefined,
              tool_use_id: block.tool_use_id || undefined,
              error_content: errorContent,
            })
          }
        }
      }
    } else if (msgType === 'assistant') {
      const toolNames: string[] = []
      const toolUseIds: string[] = []
      const content = msg.message?.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block && typeof block === 'object' && block.type === 'tool_use') {
            if (block.name) toolNames.push(block.name)
            if (block.id) toolUseIds.push(block.id)
          }
        }
      }
      const usage = msg.message?.usage
      const extracted: TimestampedMessage = {
        type: 'assistant',
        timestamp: msg.timestamp || null,
        session_id: '',
        file_position: i,
        model: msg.message?.model || undefined,
        tool_names: toolNames.length > 0 ? toolNames : undefined,
        tool_use_ids: toolUseIds.length > 0 ? toolUseIds : undefined,
      }
      if (usage) {
        extracted.usage = {
          input_tokens: usage.input_tokens || 0,
          output_tokens: usage.output_tokens || 0,
          cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
          cache_read_input_tokens: usage.cache_read_input_tokens || 0,
        }
        const sig = `${usage.input_tokens || 0}:${usage.cache_creation_input_tokens || 0}:${usage.cache_read_input_tokens || 0}`
        if (sig !== pendingAssistantSig) {
          flushPendingAssistant()
        }
        // Merge tool_names from streaming chunks into the pending message
        if (pendingAssistant && extracted.tool_names) {
          const existing = pendingAssistant.tool_names || []
          pendingAssistant.tool_names = [...existing, ...extracted.tool_names]
        }
        // Overwrite pending — last chunk has final output_tokens
        if (pendingAssistant) {
          pendingAssistant.usage = extracted.usage
          pendingAssistant.timestamp = extracted.timestamp
          pendingAssistant.file_position = extracted.file_position
          if (extracted.model) pendingAssistant.model = extracted.model
        } else {
          pendingAssistant = extracted
        }
        pendingAssistantSig = sig
      } else {
        flushPendingAssistant()
        messages.push(extracted)
      }
    } else if (msgType === 'tool_use') {
      flushPendingAssistant()
      let name = msg.name || msg.message?.name
      if (!name) {
        const content = msg.message?.content
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block && typeof block === 'object' && block.type === 'tool_use') {
              name = block.name
              break
            }
          }
        }
      }
      messages.push({
        type: 'tool_use',
        timestamp: msg.timestamp || null,
        session_id: '',
        file_position: i,
        tool_names: name ? [name] : undefined,
      })
    } else if (msgType === 'thinking') {
      flushPendingAssistant()
      messages.push({
        type: 'thinking',
        timestamp: msg.timestamp || null,
        session_id: '',
        file_position: i,
      })
    }
  }
  flushPendingAssistant()

  if (isSidechain) return null

  if (!sessionId) sessionId = path.basename(filepath, '.jsonl')

  const projectName = projectCwd
    ? path.basename(projectCwd)
    : path.basename(path.dirname(filepath))

  const parentDirName = path.basename(path.dirname(filepath))
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  const projectPathEncoded = uuidPattern.test(parentDirName)
    ? path.basename(path.dirname(path.dirname(filepath)))
    : parentDirName

  // Backfill session_id and metadata on all messages
  for (const m of messages) {
    m.session_id = sessionId
    if (!m.claude_code_version && version) m.claude_code_version = version
    if (!m.git_branch && gitBranch) m.git_branch = gitBranch
  }

  return {
    messages,
    session_id: sessionId,
    project: projectName,
    project_path_encoded: projectPathEncoded,
  }
}

export function getAllSessions(limit?: number, project?: string, sessionDataPath?: string, maxFiles?: number): SessionsResult {
  const claudeDir = sessionDataPath || path.join(os.homedir(), '.claude', 'projects')

  if (!fs.existsSync(claudeDir)) {
    return {
      sessions: [],
      metadata: { total_sessions: 0, total_projects: 0, total_prompts: 0, extracted_at: new Date().toISOString() },
    }
  }

  // Collect all JSONL file paths first
  const filePaths: string[] = []

  for (const entry of fs.readdirSync(claudeDir).sort()) {
    const projectDir = path.join(claudeDir, entry)
    if (!fs.statSync(projectDir).isDirectory()) continue

    const entries = fs.readdirSync(projectDir).sort()
    const flatJsonlFiles = entries.filter(f => f.endsWith('.jsonl'))
    const seenIds = new Set(flatJsonlFiles.map(f => f.replace('.jsonl', '')))

    for (const file of flatJsonlFiles) {
      filePaths.push(path.join(projectDir, file))
    }

    // Also check UUID subdirectories for main session files (future-proofing)
    for (const entry of entries) {
      if (entry.endsWith('.jsonl') || seenIds.has(entry)) continue
      const subdir = path.join(projectDir, entry)
      try {
        if (!fs.statSync(subdir).isDirectory()) continue
        const nestedFiles = fs.readdirSync(subdir).filter(f => f.endsWith('.jsonl'))
        for (const nf of nestedFiles) {
          filePaths.push(path.join(subdir, nf))
        }
      } catch { continue }
    }
  }

  // When maxFiles is set, sort by mtime descending and take only the newest files
  let pathsToParse = filePaths
  if (maxFiles && maxFiles < filePaths.length) {
    const withMtime = filePaths.map(fp => {
      try {
        return { path: fp, mtime: fs.statSync(fp).mtimeMs }
      } catch {
        return { path: fp, mtime: 0 }
      }
    })
    withMtime.sort((a, b) => b.mtime - a.mtime)
    pathsToParse = withMtime.slice(0, maxFiles).map(e => e.path)
  }

  // Parse the selected files
  const sessions: ParsedSession[] = []
  for (const fp of pathsToParse) {
    const session = parseSessionFile(fp)
    if (session) sessions.push(session)
  }

  sessions.sort((a, b) => {
    const ta = a.started_at || ''
    const tb = b.started_at || ''
    return tb.localeCompare(ta)
  })

  let filtered = sessions
  if (project) {
    filtered = filtered.filter(s => s.project === project)
  }
  if (limit) {
    filtered = filtered.slice(0, limit)
  }

  const projects = new Set(filtered.map(s => s.project))
  const totalPrompts = filtered.reduce((sum, s) => sum + s.user_prompts.length, 0)

  return {
    sessions: filtered,
    metadata: {
      total_sessions: filtered.length,
      total_projects: projects.size,
      total_prompts: totalPrompts,
      extracted_at: new Date().toISOString(),
    },
  }
}
