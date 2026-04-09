import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { TimestampedMessage, SessionMessagesResult, parseSessionMessages } from './parser'
import { classifyTask } from './taskClassification'
import { detectStructuredOutputAntiPattern } from './antiPatterns'

export interface ParsedConversation {
  id: string
  content_hash: string
  project: string
  project_path_encoded: string
  session_ids: string[]
  started_at: string | null
  ended_at: string | null
  user_prompts: string[]
  prompt_timestamps: string[]
  prompt_count: number
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
  heuristic_task_type: string | null
  has_structured_output_antipattern: boolean
  structured_output_antipattern_count: number
  total_input_tokens: number
  total_output_tokens: number
  total_cache_creation_tokens: number
  total_cache_read_tokens: number
  total_tokens: number
  tokens_per_prompt: number
  cache_hit_rate: number
}

export interface ConversationsResult {
  conversations: ParsedConversation[]
  metadata: {
    total_conversations: number
    total_projects: number
    total_prompts: number
    extracted_at: string
  }
}

export function computeContentHash(
  projectPathEncoded: string,
  promptTimestamps: string[],
  startedAt: string | null,
  userPrompts: string[],
  promptCount: number,
): string {
  const ts = promptTimestamps[0] || startedAt || 'unknown'
  const prefix = (userPrompts[0] || '').slice(0, 50)
  return `${projectPathEncoded}:${ts}:${promptCount}:${prefix}`
}

export function buildConversations(
  messages: TimestampedMessage[],
  project: string,
  projectPathEncoded: string,
  gapMinutes: number,
): ParsedConversation[] {
  if (messages.length === 0) return []

  // Sort by (timestamp, file_position) — stable ordering
  const sorted = [...messages].sort((a, b) => {
    const tsA = a.timestamp || ''
    const tsB = b.timestamp || ''
    if (tsA !== tsB) return tsA.localeCompare(tsB)
    return a.file_position - b.file_position
  })

  const gapMs = gapMinutes * 60 * 1000

  // Split into conversation buckets
  const buckets: TimestampedMessage[][] = [[]]
  let lastUserTimestamp: number | null = null

  for (const msg of sorted) {
    if (msg.type === 'user') {
      // /clear always forces a new conversation boundary
      if (msg.is_clear_command) {
        buckets.push([])
        buckets[buckets.length - 1].push(msg)
        continue
      }
      if (msg.timestamp) {
        const ts = new Date(msg.timestamp).getTime()
        if (lastUserTimestamp !== null && (ts - lastUserTimestamp) > gapMs) {
          buckets.push([])
        }
        lastUserTimestamp = ts
      }
    }
    buckets[buckets.length - 1].push(msg)
  }

  // Build conversations from buckets
  const conversations: ParsedConversation[] = []

  for (const bucket of buckets) {
    const userPrompts: string[] = []
    const promptTimestamps: string[] = []
    let userMsgCount = 0
    let assistantMsgCount = 0
    let toolUseCount = 0
    const toolsUsed = new Set<string>()
    const commandsUsed = new Set<string>()
    let thinkingCount = 0
    let usedPlanMode = false
    let model: string | null = null
    let version: string | null = null
    let gitBranch: string | null = null
    const sessionIds = new Set<string>()
    const timestamps: string[] = []
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalCacheCreationTokens = 0
    let totalCacheReadTokens = 0

    for (const msg of bucket) {
      if (msg.session_id) sessionIds.add(msg.session_id)
      if (msg.timestamp) timestamps.push(msg.timestamp)

      if (msg.type === 'user') {
        if (msg.is_clear_command) continue
        userMsgCount++
        if (msg.content) userPrompts.push(msg.content)
        if (msg.content && msg.timestamp) promptTimestamps.push(msg.timestamp)
        if (msg.used_plan_mode) usedPlanMode = true
        if (msg.command_name) commandsUsed.add(msg.command_name)
      } else if (msg.type === 'assistant') {
        assistantMsgCount++
        if (msg.model && !model) model = msg.model
        if (msg.usage) {
          totalInputTokens += msg.usage.input_tokens
          totalOutputTokens += msg.usage.output_tokens
          totalCacheCreationTokens += msg.usage.cache_creation_input_tokens
          totalCacheReadTokens += msg.usage.cache_read_input_tokens
        }
        if (msg.tool_names) {
          toolUseCount += msg.tool_names.length
          for (const name of msg.tool_names) toolsUsed.add(name)
        }
      } else if (msg.type === 'tool_use') {
        toolUseCount++
        if (msg.tool_names) {
          for (const name of msg.tool_names) toolsUsed.add(name)
        }
      } else if (msg.type === 'thinking') {
        thinkingCount++
      }

      if (!version && msg.claude_code_version) version = msg.claude_code_version
      if (!gitBranch && msg.git_branch) gitBranch = msg.git_branch
    }

    // Skip conversations with no user prompts
    if (userPrompts.length === 0) continue

    timestamps.sort()
    const totalTokens = totalInputTokens + totalOutputTokens + totalCacheCreationTokens + totalCacheReadTokens
    const promptCount = userPrompts.length
    const tokensPerPrompt = promptCount > 0 ? totalTokens / promptCount : 0
    const cacheHitDenom = totalCacheReadTokens + totalInputTokens + totalCacheCreationTokens
    const cacheHitRate = cacheHitDenom > 0 ? totalCacheReadTokens / cacheHitDenom : 0

    const contentHash = computeContentHash(
      projectPathEncoded, promptTimestamps.sort(), timestamps[0] || null, userPrompts, promptCount,
    )

    const antiPatternResult = detectStructuredOutputAntiPattern(userPrompts)

    conversations.push({
      id: '', // filled below with zero-padded index
      content_hash: contentHash,
      project,
      project_path_encoded: projectPathEncoded,
      session_ids: Array.from(sessionIds).sort(),
      started_at: timestamps[0] || null,
      ended_at: timestamps[timestamps.length - 1] || null,
      user_prompts: userPrompts,
      prompt_timestamps: promptTimestamps.sort(),
      prompt_count: promptCount,
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
      heuristic_task_type: classifyTask(gitBranch, userPrompts),
      has_structured_output_antipattern: antiPatternResult.has_structured_output_antipattern,
      structured_output_antipattern_count: antiPatternResult.structured_output_antipattern_count,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      total_cache_creation_tokens: totalCacheCreationTokens,
      total_cache_read_tokens: totalCacheReadTokens,
      total_tokens: totalTokens,
      tokens_per_prompt: tokensPerPrompt,
      cache_hit_rate: cacheHitRate,
    })
  }

  // Assign deterministic IDs with zero-padded indices
  const padWidth = Math.max(3, String(conversations.length).length)
  for (let i = 0; i < conversations.length; i++) {
    conversations[i].id = `${projectPathEncoded}:conv:${String(i).padStart(padWidth, '0')}`
  }

  return conversations
}

export function getAllConversations(
  limit?: number,
  project?: string,
  sessionDataPath?: string,
  maxFiles?: number,
  gapMinutes?: number,
): ConversationsResult {
  const claudeDir = sessionDataPath || path.join(os.homedir(), '.claude', 'projects')
  const gap = gapMinutes ?? 60

  if (!fs.existsSync(claudeDir)) {
    return {
      conversations: [],
      metadata: { total_conversations: 0, total_projects: 0, total_prompts: 0, extracted_at: new Date().toISOString() },
    }
  }

  // Collect all JSONL file paths
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

  // Parse all files into messages
  const parsed: SessionMessagesResult[] = []
  for (const fp of pathsToParse) {
    const result = parseSessionMessages(fp)
    if (result) parsed.push(result)
  }

  // Group messages by project_path_encoded
  const byProject = new Map<string, { project: string; encoded: string; messages: TimestampedMessage[] }>()
  for (const result of parsed) {
    const key = result.project_path_encoded
    if (!byProject.has(key)) {
      byProject.set(key, { project: result.project, encoded: key, messages: [] })
    }
    byProject.get(key)!.messages.push(...result.messages)
  }

  // Build conversations per project
  let allConversations: ParsedConversation[] = []
  for (const { project: proj, encoded, messages } of byProject.values()) {
    const convs = buildConversations(messages, proj, encoded, gap)
    allConversations.push(...convs)
  }

  // Sort by started_at descending
  allConversations.sort((a, b) => {
    const ta = a.started_at || ''
    const tb = b.started_at || ''
    return tb.localeCompare(ta)
  })

  // Apply filters
  if (project) {
    allConversations = allConversations.filter(c => c.project === project)
  }
  if (limit) {
    allConversations = allConversations.slice(0, limit)
  }

  const projects = new Set(allConversations.map(c => c.project))
  const totalPrompts = allConversations.reduce((sum, c) => sum + c.user_prompts.length, 0)

  return {
    conversations: allConversations,
    metadata: {
      total_conversations: allConversations.length,
      total_projects: projects.size,
      total_prompts: totalPrompts,
      extracted_at: new Date().toISOString(),
    },
  }
}
