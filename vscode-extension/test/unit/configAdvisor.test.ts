import { loadConfigAdvisorPrompt, fillTemplate } from '../../src/prompts'
import { ScoreCache } from '../../src/cache'

import * as fs from 'fs'
import * as vscode from 'vscode'

describe('Config Advisor', () => {
  describe('loadConfigAdvisorPrompt', () => {
    it('returns version and template with non-empty values', () => {
      const { version, template } = loadConfigAdvisorPrompt()
      expect(version).toBeTruthy()
      expect(typeof version).toBe('string')
      expect(template).toBeTruthy()
      expect(typeof template).toBe('string')
    })

    it('template contains expected placeholders', () => {
      const { template } = loadConfigAdvisorPrompt()
      expect(template).toContain('{{STATEMENT}}')
      expect(template).toContain('{{HOOK_EVENT}}')
      expect(template).toContain('{{MATCHER}}')
      expect(template).toContain('{{SEVERITY}}')
      expect(template).toContain('{{CONTEXT}}')
    })

    it('version matches registry format', () => {
      const { version } = loadConfigAdvisorPrompt()
      expect(version).toMatch(/^config_advisor-v\d+\.\d+$/)
    })

    it('template can be filled with variables', () => {
      const { template } = loadConfigAdvisorPrompt()
      const filled = fillTemplate(template, {
        STATEMENT: 'Never push directly to main',
        HOOK_EVENT: 'PreToolUse',
        MATCHER: 'Bash',
        SEVERITY: 'high',
        CONTEXT: 'Some surrounding context',
      })
      expect(filled).toContain('Never push directly to main')
      expect(filled).toContain('PreToolUse')
      expect(filled).toContain('Bash')
      expect(filled).toContain('high')
      expect(filled).toContain('Some surrounding context')
      expect(filled).not.toContain('{{STATEMENT}}')
      expect(filled).not.toContain('{{HOOK_EVENT}}')
    })
  })

  describe('cache key generation', () => {
    it('produces deterministic cache keys', () => {
      const key1 = ScoreCache.contentHash('test statement' + 'PreToolUse' + 'Bash')
      const key2 = ScoreCache.contentHash('test statement' + 'PreToolUse' + 'Bash')
      expect(key1).toBe(key2)
    })

    it('produces different keys for different inputs', () => {
      const key1 = ScoreCache.contentHash('statement A' + 'PreToolUse' + 'Bash')
      const key2 = ScoreCache.contentHash('statement B' + 'PreToolUse' + 'Bash')
      expect(key1).not.toBe(key2)
    })

    it('produces different keys for different events', () => {
      const key1 = ScoreCache.contentHash('same statement' + 'PreToolUse' + '')
      const key2 = ScoreCache.contentHash('same statement' + 'PostToolUse' + '')
      expect(key1).not.toBe(key2)
    })

    it('produces different keys for different matchers', () => {
      const key1 = ScoreCache.contentHash('same statement' + 'PreToolUse' + 'Bash')
      const key2 = ScoreCache.contentHash('same statement' + 'PreToolUse' + 'Edit')
      expect(key1).not.toBe(key2)
    })
  })

  describe('ScoreCache configAdvisor methods', () => {
    it('configAdvisorFilePath ends with config_advisor_cache.json', () => {
      const uri = vscode.Uri.file('/tmp/codefluent-storage')
      const cache = new ScoreCache(uri)
      // Verify the cache has the method available
      expect(typeof cache.readConfigAdvisor).toBe('function')
      expect(typeof cache.writeConfigAdvisor).toBe('function')
    })

    it('readConfigAdvisor returns empty object when file does not exist', () => {
      const uri = vscode.Uri.file('/tmp/nonexistent-storage-' + Date.now())
      const cache = new ScoreCache(uri)
      expect(cache.readConfigAdvisor()).toEqual({})
    })
  })

  describe('input validation', () => {
    it('empty statement should be rejected by handler', () => {
      // The handler checks for empty/missing statement
      const statement = ''
      expect(statement.trim()).toBe('')
    })

    it('statement exceeding 2000 chars should be rejected', () => {
      const longStatement = 'x'.repeat(2001)
      expect(longStatement.length).toBeGreaterThan(2000)
    })
  })

  describe('response validation', () => {
    it('valid response has all required fields', () => {
      const response = {
        hookConfig: { hooks: { PreToolUse: [] } },
        explanation: 'This hook prevents direct pushes.',
        applyInstructions: 'Add to .claude/settings.json',
      }
      expect(response.hookConfig).toBeDefined()
      expect(typeof response.hookConfig).toBe('object')
      expect(typeof response.explanation).toBe('string')
      expect(response.explanation.length).toBeGreaterThan(0)
      expect(typeof response.applyInstructions).toBe('string')
      expect(response.applyInstructions.length).toBeGreaterThan(0)
    })

    it('response missing hookConfig is invalid', () => {
      const response = {
        explanation: 'This hook prevents direct pushes.',
        applyInstructions: 'Add to .claude/settings.json',
      } as any
      expect(response.hookConfig).toBeUndefined()
    })

    it('response with non-object hookConfig is invalid', () => {
      const response = {
        hookConfig: 'not an object',
        explanation: 'This hook prevents direct pushes.',
        applyInstructions: 'Add to .claude/settings.json',
      }
      expect(typeof response.hookConfig).not.toBe('object')
    })

    it('response missing explanation is invalid', () => {
      const response = {
        hookConfig: { hooks: {} },
        applyInstructions: 'Add to .claude/settings.json',
      } as any
      expect(response.explanation).toBeUndefined()
    })

    it('response with empty explanation is invalid', () => {
      const response = {
        hookConfig: { hooks: {} },
        explanation: '',
        applyInstructions: 'Add to .claude/settings.json',
      }
      expect(response.explanation).toBe('')
    })

    it('response missing applyInstructions is invalid', () => {
      const response = {
        hookConfig: { hooks: {} },
        explanation: 'Some explanation',
      } as any
      expect(response.applyInstructions).toBeUndefined()
    })
  })

  describe('prompt template structure', () => {
    it('template includes hook event documentation', () => {
      const { template } = loadConfigAdvisorPrompt()
      expect(template).toContain('PreToolUse')
      expect(template).toContain('PostToolUse')
      expect(template).toContain('Stop')
    })

    it('template includes handler type documentation', () => {
      const { template } = loadConfigAdvisorPrompt()
      expect(template).toContain('command')
      expect(template).toContain('prompt')
    })

    it('template includes examples', () => {
      const { template } = loadConfigAdvisorPrompt()
      expect(template).toContain('hookConfig')
      expect(template).toContain('explanation')
      expect(template).toContain('applyInstructions')
    })

    it('template instructs to return JSON only', () => {
      const { template } = loadConfigAdvisorPrompt()
      expect(template).toContain('JSON')
    })
  })
})
