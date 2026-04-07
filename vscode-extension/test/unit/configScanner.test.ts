import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { scanConfigurationMaturity, parseFrontmatter, ConfigurationMaturity } from '../../src/configScanner'

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codefluent-test-'))
}

function rimraf(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // best effort
  }
}

describe('parseFrontmatter', () => {
  it('returns null when no frontmatter present', () => {
    expect(parseFrontmatter('# Hello world')).toBeNull()
  })

  it('returns null for incomplete frontmatter (no closing ---)', () => {
    expect(parseFrontmatter('---\nkey: value\n')).toBeNull()
  })

  it('parses simple key-value pairs', () => {
    const content = '---\ntitle: My Rule\ndescription: A test rule\n---\n# Content'
    const result = parseFrontmatter(content)
    expect(result).toEqual({ title: 'My Rule', description: 'A test rule' })
  })

  it('handles key with colon in value', () => {
    const content = '---\nurl: https://example.com\n---\n'
    const result = parseFrontmatter(content)
    expect(result).toEqual({ url: 'https://example.com' })
  })

  it('detects array values', () => {
    const content = '---\nglobs: [*.ts, *.js]\n---\nContent'
    const result = parseFrontmatter(content)
    expect(result).not.toBeNull()
    expect(result!.globs).toBe('[*.ts, *.js]')
  })

  it('handles Windows-style line endings', () => {
    const content = '---\r\nkey: value\r\n---\r\nContent'
    const result = parseFrontmatter(content)
    expect(result).toEqual({ key: 'value' })
  })

  it('skips comment lines', () => {
    const content = '---\n# comment\nkey: value\n---\n'
    const result = parseFrontmatter(content)
    expect(result).toEqual({ key: 'value' })
  })

  it('skips empty lines', () => {
    const content = '---\nkey: value\n\nother: thing\n---\n'
    const result = parseFrontmatter(content)
    expect(result).toEqual({ key: 'value', other: 'thing' })
  })

  it('handles frontmatter at end of file (no trailing content)', () => {
    const content = '---\nkey: value\n---'
    const result = parseFrontmatter(content)
    expect(result).toEqual({ key: 'value' })
  })

  it('returns empty object for frontmatter with only whitespace', () => {
    const content = '---\n  \n---\nContent'
    const result = parseFrontmatter(content)
    expect(result).toEqual({})
  })

  it('ignores lines without colons', () => {
    const content = '---\nkey: value\nno-colon-here\n---\n'
    const result = parseFrontmatter(content)
    expect(result).toEqual({ key: 'value' })
  })
})

describe('scanConfigurationMaturity', () => {
  let tempDir: string
  let homeDir: string
  let projectRoot: string

  beforeEach(() => {
    tempDir = createTempDir()
    homeDir = path.join(tempDir, 'home')
    projectRoot = path.join(tempDir, 'project')
    fs.mkdirSync(homeDir, { recursive: true })
    fs.mkdirSync(projectRoot, { recursive: true })
  })

  afterEach(() => {
    rimraf(tempDir)
  })

  // ---- Hooks ----

  describe('hooks', () => {
    it('returns defaults when no settings.json exists', () => {
      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.hooks).toEqual({
        configured: false,
        count: 0,
        events: [],
        handlerTypes: [],
        matchers: [],
        hookCommands: [],
      })
    })

    it('detects hooks from project settings.json', () => {
      const settingsDir = path.join(projectRoot, '.claude')
      fs.mkdirSync(settingsDir, { recursive: true })
      fs.writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify({
        hooks: {
          PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo test' }] }],
        },
      }))

      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.hooks.configured).toBe(true)
      expect(result.hooks.count).toBe(1)
      expect(result.hooks.events).toEqual(['PreToolUse'])
      expect(result.hooks.handlerTypes).toEqual(['command'])
      expect(result.hooks.matchers).toEqual(['Bash'])
    })

    it('detects hooks from user settings.json', () => {
      const settingsDir = path.join(homeDir, '.claude')
      fs.mkdirSync(settingsDir, { recursive: true })
      fs.writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify({
        hooks: {
          PostToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'lint' }] }],
        },
      }))

      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.hooks.configured).toBe(true)
      expect(result.hooks.count).toBe(1)
      expect(result.hooks.events).toEqual(['PostToolUse'])
    })

    it('merges hooks from project and user settings', () => {
      const userSettingsDir = path.join(homeDir, '.claude')
      fs.mkdirSync(userSettingsDir, { recursive: true })
      fs.writeFileSync(path.join(userSettingsDir, 'settings.json'), JSON.stringify({
        hooks: {
          PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo 1' }] }],
        },
      }))

      const projectSettingsDir = path.join(projectRoot, '.claude')
      fs.mkdirSync(projectSettingsDir, { recursive: true })
      fs.writeFileSync(path.join(projectSettingsDir, 'settings.json'), JSON.stringify({
        hooks: {
          PostToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'echo 2' }] }],
        },
      }))

      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.hooks.configured).toBe(true)
      expect(result.hooks.count).toBe(2)
      expect(result.hooks.events).toEqual(['PostToolUse', 'PreToolUse'])
      expect(result.hooks.matchers).toEqual(['Bash', 'Edit'])
    })

    it('handles malformed JSON in settings.json', () => {
      const settingsDir = path.join(projectRoot, '.claude')
      fs.mkdirSync(settingsDir, { recursive: true })
      fs.writeFileSync(path.join(settingsDir, 'settings.json'), 'not json{{{')

      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.hooks.configured).toBe(false)
      expect(result.hooks.count).toBe(0)
    })

    it('handles settings.json without hooks key', () => {
      const settingsDir = path.join(projectRoot, '.claude')
      fs.mkdirSync(settingsDir, { recursive: true })
      fs.writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify({
        someOtherKey: true,
      }))

      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.hooks.configured).toBe(false)
    })

    it('counts multiple hooks within a single event', () => {
      const settingsDir = path.join(projectRoot, '.claude')
      fs.mkdirSync(settingsDir, { recursive: true })
      fs.writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo 1' }, { type: 'command', command: 'echo 2' }] },
            { matcher: 'Edit', hooks: [{ type: 'command', command: 'lint' }] },
          ],
        },
      }))

      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.hooks.count).toBe(3)
      expect(result.hooks.events).toEqual(['PreToolUse'])
    })
  })

  // ---- Rules ----

  describe('rules', () => {
    it('returns defaults when rules directory is missing', () => {
      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.rules).toEqual({ count: 0, hasPathScoping: false })
    })

    it('counts .md files in rules directory', () => {
      const rulesDir = path.join(projectRoot, '.claude', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })
      fs.writeFileSync(path.join(rulesDir, 'rule1.md'), '# Rule 1')
      fs.writeFileSync(path.join(rulesDir, 'rule2.md'), '# Rule 2')
      fs.writeFileSync(path.join(rulesDir, 'ignore.txt'), 'not a rule')

      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.rules.count).toBe(2)
    })

    it('detects path scoping via globs frontmatter', () => {
      const rulesDir = path.join(projectRoot, '.claude', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })
      fs.writeFileSync(path.join(rulesDir, 'scoped.md'), '---\nglobs: [*.ts]\n---\nUse strict mode')

      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.rules.hasPathScoping).toBe(true)
    })

    it('hasPathScoping is false when no globs in frontmatter', () => {
      const rulesDir = path.join(projectRoot, '.claude', 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })
      fs.writeFileSync(path.join(rulesDir, 'global.md'), '---\ntitle: Global Rule\n---\nApply everywhere')

      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.rules.hasPathScoping).toBe(false)
    })
  })

  // ---- Commands ----

  describe('commands', () => {
    it('returns zero when commands directory is missing', () => {
      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.commands).toEqual({ count: 0 })
    })

    it('counts .md files in commands directory', () => {
      const commandsDir = path.join(projectRoot, '.claude', 'commands')
      fs.mkdirSync(commandsDir, { recursive: true })
      fs.writeFileSync(path.join(commandsDir, 'deploy.md'), '# Deploy')
      fs.writeFileSync(path.join(commandsDir, 'test.md'), '# Test')

      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.commands.count).toBe(2)
    })
  })

  // ---- Skills ----

  describe('skills', () => {
    it('returns defaults when skills directory is missing', () => {
      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.skills).toEqual({ count: 0, hasFrontmatter: false })
    })

    it('counts skill subdirectories', () => {
      const skillsDir = path.join(projectRoot, '.claude', 'skills')
      fs.mkdirSync(path.join(skillsDir, 'skill-a'), { recursive: true })
      fs.mkdirSync(path.join(skillsDir, 'skill-b'), { recursive: true })
      // Regular file should not be counted
      fs.writeFileSync(path.join(skillsDir, 'readme.md'), 'not a skill')

      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.skills.count).toBe(2)
    })

    it('detects frontmatter in skill files', () => {
      const skillDir = path.join(projectRoot, '.claude', 'skills', 'my-skill')
      fs.mkdirSync(skillDir, { recursive: true })
      fs.writeFileSync(path.join(skillDir, 'skill.md'), '---\nname: My Skill\n---\nContent')

      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.skills.count).toBe(1)
      expect(result.skills.hasFrontmatter).toBe(true)
    })

    it('hasFrontmatter is false when no skill files have frontmatter', () => {
      const skillDir = path.join(projectRoot, '.claude', 'skills', 'basic')
      fs.mkdirSync(skillDir, { recursive: true })
      fs.writeFileSync(path.join(skillDir, 'readme.md'), '# Just a heading')

      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.skills.count).toBe(1)
      expect(result.skills.hasFrontmatter).toBe(false)
    })
  })

  // ---- MCP ----

  describe('mcp', () => {
    it('returns defaults when no MCP config exists', () => {
      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.mcp).toEqual({ configured: false, serverCount: 0 })
    })

    it('detects MCP servers from project .mcp.json', () => {
      fs.writeFileSync(path.join(projectRoot, '.mcp.json'), JSON.stringify({
        mcpServers: {
          github: { command: 'gh-mcp' },
          slack: { command: 'slack-mcp' },
        },
      }))

      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.mcp.configured).toBe(true)
      expect(result.mcp.serverCount).toBe(2)
    })

    it('detects MCP servers from user ~/.claude.json', () => {
      fs.writeFileSync(path.join(homeDir, '.claude.json'), JSON.stringify({
        mcpServers: {
          global_mcp: { command: 'global-server' },
        },
      }))

      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.mcp.configured).toBe(true)
      expect(result.mcp.serverCount).toBe(1)
    })

    it('merges servers from project and user, deduplicating by name', () => {
      fs.writeFileSync(path.join(projectRoot, '.mcp.json'), JSON.stringify({
        mcpServers: { shared: { command: 'a' }, project_only: { command: 'b' } },
      }))
      fs.writeFileSync(path.join(homeDir, '.claude.json'), JSON.stringify({
        mcpServers: { shared: { command: 'c' }, user_only: { command: 'd' } },
      }))

      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.mcp.configured).toBe(true)
      expect(result.mcp.serverCount).toBe(3) // shared, project_only, user_only
    })

    it('handles malformed .mcp.json', () => {
      fs.writeFileSync(path.join(projectRoot, '.mcp.json'), 'not json')
      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.mcp.configured).toBe(false)
    })
  })

  // ---- CLAUDE.md ----

  describe('claudeMd', () => {
    it('returns defaults when no CLAUDE.md exists', () => {
      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.claudeMd).toEqual({
        present: false,
        locations: [],
        hasImports: false,
      })
    })

    it('detects CLAUDE.md at project root', () => {
      fs.writeFileSync(path.join(projectRoot, 'CLAUDE.md'), '# Project Instructions')

      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.claudeMd.present).toBe(true)
      expect(result.claudeMd.locations).toContain('project root')
    })

    it('detects CLAUDE.md at .claude/CLAUDE.md', () => {
      const claudeDir = path.join(projectRoot, '.claude')
      fs.mkdirSync(claudeDir, { recursive: true })
      fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# Hidden instructions')

      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.claudeMd.present).toBe(true)
      expect(result.claudeMd.locations).toContain('.claude/')
    })

    it('detects CLAUDE.md at ~/.claude/CLAUDE.md', () => {
      const claudeDir = path.join(homeDir, '.claude')
      fs.mkdirSync(claudeDir, { recursive: true })
      fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# User-level instructions')

      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.claudeMd.present).toBe(true)
      expect(result.claudeMd.locations).toContain('~/.claude/')
    })

    it('detects multiple locations', () => {
      fs.writeFileSync(path.join(projectRoot, 'CLAUDE.md'), '# Root')
      const claudeDir = path.join(homeDir, '.claude')
      fs.mkdirSync(claudeDir, { recursive: true })
      fs.writeFileSync(path.join(claudeDir, 'CLAUDE.md'), '# Home')

      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.claudeMd.locations).toEqual(['project root', '~/.claude/'])
    })

    it('detects @import directive', () => {
      fs.writeFileSync(path.join(projectRoot, 'CLAUDE.md'), '@import ./docs/spec.md\n# Content')

      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.claudeMd.hasImports).toBe(true)
    })

    it('hasImports is false when no @import found', () => {
      fs.writeFileSync(path.join(projectRoot, 'CLAUDE.md'), '# No imports here')

      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.claudeMd.hasImports).toBe(false)
    })
  })

  // ---- Permissions ----

  describe('permissions', () => {
    it('returns not configured when settings.local.json is missing', () => {
      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.permissions).toEqual({ configured: false })
    })

    it('detects permissions key in settings.local.json', () => {
      const settingsDir = path.join(projectRoot, '.claude')
      fs.mkdirSync(settingsDir, { recursive: true })
      fs.writeFileSync(path.join(settingsDir, 'settings.local.json'), JSON.stringify({
        permissions: { allow: ['Bash'] },
      }))

      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.permissions.configured).toBe(true)
    })

    it('returns not configured when permissions key is absent', () => {
      const settingsDir = path.join(projectRoot, '.claude')
      fs.mkdirSync(settingsDir, { recursive: true })
      fs.writeFileSync(path.join(settingsDir, 'settings.local.json'), JSON.stringify({
        other: 'stuff',
      }))

      const result = scanConfigurationMaturity(projectRoot, homeDir)
      expect(result.permissions.configured).toBe(false)
    })
  })

  // ---- Error resilience ----

  describe('error resilience', () => {
    it('returns complete defaults when projectRoot is undefined', () => {
      const result = scanConfigurationMaturity(undefined, homeDir)
      expect(result.hooks).toBeDefined()
      expect(result.rules).toEqual({ count: 0, hasPathScoping: false })
      expect(result.commands).toEqual({ count: 0 })
      expect(result.skills).toEqual({ count: 0, hasFrontmatter: false })
      expect(result.mcp).toBeDefined()
      expect(result.claudeMd).toBeDefined()
      expect(result.permissions).toEqual({ configured: false })
    })

    it('never throws even when projectRoot does not exist', () => {
      expect(() => {
        scanConfigurationMaturity('/nonexistent/path/that/does/not/exist', homeDir)
      }).not.toThrow()
    })

    it('returns a complete ConfigurationMaturity object always', () => {
      const result = scanConfigurationMaturity(undefined, homeDir)
      const keys: Array<keyof ConfigurationMaturity> = [
        'hooks', 'rules', 'commands', 'skills', 'mcp', 'claudeMd', 'permissions',
      ]
      for (const key of keys) {
        expect(result[key]).toBeDefined()
      }
    })

    it('handles unreadable files gracefully', () => {
      // Create a file and make it unreadable (if running as non-root)
      const settingsDir = path.join(projectRoot, '.claude')
      fs.mkdirSync(settingsDir, { recursive: true })
      const filePath = path.join(settingsDir, 'settings.json')
      fs.writeFileSync(filePath, '{"hooks": {}}')
      try {
        fs.chmodSync(filePath, 0o000)
        // This should not throw regardless of whether chmod worked
        const result = scanConfigurationMaturity(projectRoot, homeDir)
        expect(result.hooks).toBeDefined()
      } finally {
        // Restore permissions for cleanup
        try { fs.chmodSync(filePath, 0o644) } catch { /* ignore */ }
      }
    })
  })

  // ---- Full scan with everything configured ----

  describe('full scan', () => {
    it('detects all artifacts when fully configured', () => {
      // Hooks
      const projectClaudeDir = path.join(projectRoot, '.claude')
      fs.mkdirSync(projectClaudeDir, { recursive: true })
      fs.writeFileSync(path.join(projectClaudeDir, 'settings.json'), JSON.stringify({
        hooks: {
          PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo' }] }],
        },
      }))

      // Rules
      const rulesDir = path.join(projectClaudeDir, 'rules')
      fs.mkdirSync(rulesDir, { recursive: true })
      fs.writeFileSync(path.join(rulesDir, 'ts-rule.md'), '---\nglobs: [*.ts]\n---\nContent')

      // Commands
      const commandsDir = path.join(projectClaudeDir, 'commands')
      fs.mkdirSync(commandsDir, { recursive: true })
      fs.writeFileSync(path.join(commandsDir, 'deploy.md'), '# Deploy')

      // Skills
      const skillDir = path.join(projectClaudeDir, 'skills', 'my-skill')
      fs.mkdirSync(skillDir, { recursive: true })
      fs.writeFileSync(path.join(skillDir, 'skill.md'), '---\nname: test\n---\nContent')

      // MCP
      fs.writeFileSync(path.join(projectRoot, '.mcp.json'), JSON.stringify({
        mcpServers: { github: { command: 'gh-mcp' } },
      }))

      // CLAUDE.md
      fs.writeFileSync(path.join(projectRoot, 'CLAUDE.md'), '# Project\n@import ./spec.md')

      // Permissions
      fs.writeFileSync(path.join(projectClaudeDir, 'settings.local.json'), JSON.stringify({
        permissions: { allow: ['Bash'] },
      }))

      const result = scanConfigurationMaturity(projectRoot, homeDir)

      expect(result.hooks.configured).toBe(true)
      expect(result.hooks.count).toBe(1)
      expect(result.rules.count).toBe(1)
      expect(result.rules.hasPathScoping).toBe(true)
      expect(result.commands.count).toBe(1)
      expect(result.skills.count).toBe(1)
      expect(result.skills.hasFrontmatter).toBe(true)
      expect(result.mcp.configured).toBe(true)
      expect(result.mcp.serverCount).toBe(1)
      expect(result.claudeMd.present).toBe(true)
      expect(result.claudeMd.hasImports).toBe(true)
      expect(result.permissions.configured).toBe(true)
    })
  })
})
