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
  thinking_count: number
  used_plan_mode: boolean
  model: string | null
  claude_code_version: string | null
  git_branch: string | null
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
  let thinkingCount = 0
  let userMsgCount = 0
  let assistantMsgCount = 0
  let usedPlanMode = false
  let model: string | null = null
  let version: string | null = null
  let gitBranch: string | null = null
  let isSidechain = false

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
      userMsgCount++
      const content = msg.message?.content ?? ''
      const text = extractUserText(content)
      if (text && text !== '[Request interrupted by user for tool use]') {
        userPrompts.push(text.slice(0, 2000))
      }
      if (msg.planContent) usedPlanMode = true
    } else if (msgType === 'assistant') {
      assistantMsgCount++
      const msgModel = msg.message?.model
      if (msgModel && !model) model = msgModel
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
      thinkingCount++
    }
  }

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
    thinking_count: thinkingCount,
    used_plan_mode: usedPlanMode,
    model,
    claude_code_version: version,
    git_branch: gitBranch,
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
