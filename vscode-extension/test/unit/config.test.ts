import * as fs from 'fs'
import * as path from 'path'
import { getConfig, getDisplayConfig, resetConfigCache } from '../../src/config'
import { workspace } from 'vscode'

// Load defaults directly for snapshot assertions
const defaultsPath = path.join(__dirname, '..', '..', '..', 'shared', 'defaults.json')
const defaults = JSON.parse(fs.readFileSync(defaultsPath, 'utf8'))

beforeEach(() => {
  resetConfigCache()
  ;(workspace.getConfiguration as jest.Mock).mockReturnValue({
    get: jest.fn(() => undefined),
  })
})

describe('getConfig', () => {
  it('returns default value when no VS Code setting is set', () => {
    expect(getConfig('scoring.model')).toBe('claude-sonnet-4-20250514')
    expect(getConfig('scoring.maxPromptsPerConversation')).toBe(20)
    expect(getConfig('retry.maxAttempts')).toBe(3)
  })

  it('returns VS Code setting when configured', () => {
    ;(workspace.getConfiguration as jest.Mock).mockReturnValue({
      get: jest.fn((key: string) => {
        if (key === 'scoring.model') return 'claude-haiku-4-5-20251001'
        return undefined
      }),
    })
    expect(getConfig('scoring.model')).toBe('claude-haiku-4-5-20251001')
  })

  it('throws on unknown key', () => {
    expect(() => getConfig('nonexistent.key')).toThrow('Unknown config key: nonexistent.key')
  })

  it('prefers VS Code setting over default', () => {
    ;(workspace.getConfiguration as jest.Mock).mockReturnValue({
      get: jest.fn((key: string) => {
        if (key === 'scoring.maxTokens') return 2048
        return undefined
      }),
    })
    expect(getConfig<number>('scoring.maxTokens')).toBe(2048)
  })
})

describe('getDisplayConfig', () => {
  it('returns display.* keys plus conversation gap config', () => {
    const displayConfig = getDisplayConfig()
    const keys = Object.keys(displayConfig)
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) {
      expect(key).toMatch(/^(display\.|conversation\.inactivityGapMinutes)/)
    }
  })

  it('includes all expected display keys', () => {
    const displayConfig = getDisplayConfig()
    expect('display.scoreColorGreen' in displayConfig).toBe(true)
    expect('display.scoreColorAmber' in displayConfig).toBe(true)
    expect('display.sparklineMaxWeeks' in displayConfig).toBe(true)
    expect('display.dataCacheTtlMinutes' in displayConfig).toBe(true)
  })

  it('includes conversation.inactivityGapMinutes for frontend charts', () => {
    const displayConfig = getDisplayConfig()
    expect(displayConfig['conversation.inactivityGapMinutes']).toBe(60)
  })

  it('applies VS Code overrides for display keys', () => {
    ;(workspace.getConfiguration as jest.Mock).mockReturnValue({
      get: jest.fn((key: string) => {
        if (key === 'display.sparklineMaxWeeks') return 24
        return undefined
      }),
    })
    const displayConfig = getDisplayConfig()
    expect(displayConfig['display.sparklineMaxWeeks']).toBe(24)
    expect(displayConfig['display.scoreColorGreen']).toBe(70) // default
  })
})

describe('defaults.json integrity', () => {
  it('has all expected keys', () => {
    const expectedKeys = [
      'scoring.model', 'scoring.maxPromptsPerConversation', 'scoring.configTruncationChars',
      'scoring.maxTokens', 'scoring.lowConfidenceThreshold',
      'optimizer.model', 'optimizer.maxTokens', 'optimizer.alreadyGoodThreshold',
      'quickwins.model', 'quickwins.maxTokens', 'quickwins.claudeMdTruncationChars',
      'retry.maxAttempts', 'retry.baseDelayMs',
      'display.scoreColorGreen', 'display.scoreColorAmber', 'display.sparklineMaxWeeks',
      'display.dataCacheTtlMinutes',
      'rateLimit.maxRequests', 'rateLimit.windowSeconds',
      'conversation.inactivityGapMinutes',
    ]
    for (const key of expectedKeys) {
      expect(key in defaults).toBe(true)
    }
  })

  it('all values have correct types', () => {
    for (const [key, value] of Object.entries(defaults)) {
      expect(['string', 'number', 'boolean']).toContain(typeof value)
    }
  })

  it('default values match previously hardcoded values', () => {
    expect(defaults['scoring.model']).toBe('claude-sonnet-4-20250514')
    expect(defaults['scoring.maxPromptsPerConversation']).toBe(20)
    expect(defaults['scoring.configTruncationChars']).toBe(4000)
    expect(defaults['scoring.maxTokens']).toBe(1024)
    expect(defaults['scoring.lowConfidenceThreshold']).toBe(3)
    expect(defaults['optimizer.model']).toBe('claude-sonnet-4-20250514')
    expect(defaults['optimizer.maxTokens']).toBe(2048)
    expect(defaults['optimizer.alreadyGoodThreshold']).toBe(90)
    expect(defaults['quickwins.model']).toBe('claude-sonnet-4-20250514')
    expect(defaults['quickwins.maxTokens']).toBe(2048)
    expect(defaults['quickwins.claudeMdTruncationChars']).toBe(2000)
    expect(defaults['retry.maxAttempts']).toBe(3)
    expect(defaults['retry.baseDelayMs']).toBe(1000)
    expect(defaults['display.scoreColorGreen']).toBe(70)
    expect(defaults['display.scoreColorAmber']).toBe(50)
    expect(defaults['display.sparklineMaxWeeks']).toBe(12)
    expect(defaults['display.dataCacheTtlMinutes']).toBe(5)
    expect(defaults['rateLimit.maxRequests']).toBe(10)
    expect(defaults['rateLimit.windowSeconds']).toBe(60)
    expect(defaults['conversation.inactivityGapMinutes']).toBe(60)
  })
})

describe('resetConfigCache', () => {
  it('forces reload of defaults on next access', () => {
    // First call loads and caches
    const val1 = getConfig('scoring.model')
    // Reset
    resetConfigCache()
    // Should reload and return the same value
    const val2 = getConfig('scoring.model')
    expect(val1).toBe(val2)
  })
})
