/**
 * Configuration scanner for .claude/ directory maturity assessment.
 *
 * Scans the local filesystem for Claude Code configuration artifacts
 * (hooks, rules, commands, skills, MCP servers, CLAUDE.md, permissions)
 * and reports what is configured.
 *
 * No VS Code API dependency — only Node.js stdlib (fs, path, os).
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export interface ConfigurationMaturity {
  hooks: { configured: boolean; count: number; events: string[]; handlerTypes: string[] }
  rules: { count: number; hasPathScoping: boolean }
  commands: { count: number }
  skills: { count: number; hasFrontmatter: boolean }
  mcp: { configured: boolean; serverCount: number }
  claudeMd: { present: boolean; locations: string[]; hasImports: boolean }
  permissions: { configured: boolean }
}

/**
 * Parse simple YAML-like frontmatter from a markdown file.
 *
 * Checks if content starts with `---\n`, finds the closing `---\n`,
 * and extracts simple `key: value` pairs. Returns null if no
 * frontmatter is found.
 */
export function parseFrontmatter(content: string): Record<string, string> | null {
  const normalized = content.replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) return null

  const closingIndex = normalized.indexOf('\n---\n', 4)
  if (closingIndex === -1) {
    // Check if the entire content is just frontmatter ending with ---\n at EOF
    if (normalized.endsWith('\n---') || normalized.endsWith('\n---\n')) {
      const endIdx = normalized.lastIndexOf('\n---')
      if (endIdx <= 3) return null
      const block = normalized.slice(4, endIdx)
      return parseFrontmatterBlock(block)
    }
    return null
  }

  const block = normalized.slice(4, closingIndex)
  return parseFrontmatterBlock(block)
}

function parseFrontmatterBlock(block: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of block.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const colonIdx = trimmed.indexOf(':')
    if (colonIdx === -1) continue
    const key = trimmed.slice(0, colonIdx).trim()
    const value = trimmed.slice(colonIdx + 1).trim()
    if (key) result[key] = value
  }
  return result
}

function readJsonSafe(filePath: string): any {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

function readdirSafe(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath)
  } catch {
    return []
  }
}

function readFileSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}

function scanHooks(projectRoot: string | undefined, homeDir: string): ConfigurationMaturity['hooks'] {
  const result: ConfigurationMaturity['hooks'] = {
    configured: false,
    count: 0,
    events: [],
    handlerTypes: [],
  }

  const settingsPaths: string[] = [
    path.join(homeDir, '.claude', 'settings.json'),
  ]
  if (projectRoot) {
    settingsPaths.push(path.join(projectRoot, '.claude', 'settings.json'))
  }

  const allEvents = new Set<string>()
  const allHandlerTypes = new Set<string>()
  let totalCount = 0

  for (const settingsPath of settingsPaths) {
    const data = readJsonSafe(settingsPath)
    if (!data?.hooks) continue

    for (const [event, entries] of Object.entries(data.hooks)) {
      if (!Array.isArray(entries)) continue
      allEvents.add(event)
      for (const entry of entries) {
        const entryObj = entry as any
        const hooks = entryObj?.hooks
        if (Array.isArray(hooks)) {
          for (const hook of hooks) {
            totalCount++
            if (hook?.type) allHandlerTypes.add(hook.type)
          }
        }
      }
    }
  }

  result.configured = totalCount > 0
  result.count = totalCount
  result.events = Array.from(allEvents).sort()
  result.handlerTypes = Array.from(allHandlerTypes).sort()
  return result
}

function scanRules(projectRoot: string | undefined): ConfigurationMaturity['rules'] {
  const result: ConfigurationMaturity['rules'] = { count: 0, hasPathScoping: false }
  if (!projectRoot) return result

  const rulesDir = path.join(projectRoot, '.claude', 'rules')
  const files = readdirSafe(rulesDir).filter(f => f.endsWith('.md'))
  result.count = files.length

  for (const file of files) {
    const content = readFileSafe(path.join(rulesDir, file))
    if (!content) continue
    const fm = parseFrontmatter(content)
    if (fm && 'globs' in fm) {
      result.hasPathScoping = true
      break
    }
  }

  return result
}

function scanCommands(projectRoot: string | undefined): ConfigurationMaturity['commands'] {
  if (!projectRoot) return { count: 0 }
  const commandsDir = path.join(projectRoot, '.claude', 'commands')
  const files = readdirSafe(commandsDir).filter(f => f.endsWith('.md'))
  return { count: files.length }
}

function scanSkills(projectRoot: string | undefined): ConfigurationMaturity['skills'] {
  const result: ConfigurationMaturity['skills'] = { count: 0, hasFrontmatter: false }
  if (!projectRoot) return result

  const skillsDir = path.join(projectRoot, '.claude', 'skills')
  const entries = readdirSafe(skillsDir)

  let skillCount = 0
  for (const entry of entries) {
    const entryPath = path.join(skillsDir, entry)
    try {
      const stat = fs.statSync(entryPath)
      if (!stat.isDirectory()) continue
    } catch {
      continue
    }
    skillCount++

    // Check files within the skill subdirectory for frontmatter
    if (!result.hasFrontmatter) {
      const subFiles = readdirSafe(entryPath)
      for (const subFile of subFiles) {
        const content = readFileSafe(path.join(entryPath, subFile))
        if (content && parseFrontmatter(content)) {
          result.hasFrontmatter = true
          break
        }
      }
    }
  }

  result.count = skillCount
  return result
}

function scanMcp(projectRoot: string | undefined, homeDir: string): ConfigurationMaturity['mcp'] {
  const result: ConfigurationMaturity['mcp'] = { configured: false, serverCount: 0 }
  const serverNames = new Set<string>()

  // Project-level .mcp.json
  if (projectRoot) {
    const projectMcp = readJsonSafe(path.join(projectRoot, '.mcp.json'))
    if (projectMcp?.mcpServers) {
      for (const name of Object.keys(projectMcp.mcpServers)) {
        serverNames.add(name)
      }
    }
  }

  // User-level ~/.claude.json
  const userMcp = readJsonSafe(path.join(homeDir, '.claude.json'))
  if (userMcp?.mcpServers) {
    for (const name of Object.keys(userMcp.mcpServers)) {
      serverNames.add(name)
    }
  }

  result.serverCount = serverNames.size
  result.configured = serverNames.size > 0
  return result
}

function scanClaudeMd(projectRoot: string | undefined, homeDir: string): ConfigurationMaturity['claudeMd'] {
  const result: ConfigurationMaturity['claudeMd'] = {
    present: false,
    locations: [],
    hasImports: false,
  }

  const candidates: Array<{ label: string; filePath: string }> = []
  if (projectRoot) {
    candidates.push(
      { label: 'project root', filePath: path.join(projectRoot, 'CLAUDE.md') },
      { label: '.claude/', filePath: path.join(projectRoot, '.claude', 'CLAUDE.md') },
    )
  }
  candidates.push(
    { label: '~/.claude/', filePath: path.join(homeDir, '.claude', 'CLAUDE.md') },
  )

  for (const { label, filePath } of candidates) {
    const content = readFileSafe(filePath)
    if (content !== null) {
      result.locations.push(label)
      if (/^@import\b/m.test(content)) {
        result.hasImports = true
      }
    }
  }

  result.present = result.locations.length > 0
  return result
}

function scanPermissions(projectRoot: string | undefined): ConfigurationMaturity['permissions'] {
  if (!projectRoot) return { configured: false }
  const data = readJsonSafe(path.join(projectRoot, '.claude', 'settings.local.json'))
  return { configured: !!(data && 'permissions' in data) }
}

/**
 * Scan the .claude/ directory hierarchy for configuration maturity signals.
 *
 * @param projectRoot - Workspace root path, or undefined for home-dir-only scan
 * @param homeDir - Home directory path (defaults to os.homedir(), injectable for testing)
 */
export function scanConfigurationMaturity(
  projectRoot: string | undefined,
  homeDir?: string,
): ConfigurationMaturity {
  const home = homeDir ?? os.homedir()

  return {
    hooks: scanHooks(projectRoot, home),
    rules: scanRules(projectRoot),
    commands: scanCommands(projectRoot),
    skills: scanSkills(projectRoot),
    mcp: scanMcp(projectRoot, home),
    claudeMd: scanClaudeMd(projectRoot, home),
    permissions: scanPermissions(projectRoot),
  }
}
