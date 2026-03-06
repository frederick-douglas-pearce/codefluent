import { loadScoringPrompt, loadConfigPrompt, loadOptimizerPrompt, loadSingleScoringPrompt, fillTemplate } from '../../src/prompts'

describe('loadScoringPrompt', () => {
  it('returns version and template with non-empty values', () => {
    const { version, template } = loadScoringPrompt()
    expect(version).toBeTruthy()
    expect(typeof version).toBe('string')
    expect(template).toBeTruthy()
    expect(typeof template).toBe('string')
  })

  it('template contains expected placeholders', () => {
    const { template } = loadScoringPrompt()
    expect(template).toContain('{{USED_PLAN_MODE}}')
    expect(template).toContain('{{THINKING_COUNT}}')
    expect(template).toContain('{{TOOLS_USED}}')
    expect(template).toContain('{{PROMPTS}}')
  })

  it('version matches registry format', () => {
    const { version } = loadScoringPrompt()
    expect(version).toMatch(/^scoring-v\d+\.\d+$/)
  })
})

describe('loadConfigPrompt', () => {
  it('returns version and template with non-empty values', () => {
    const { version, template } = loadConfigPrompt()
    expect(version).toBeTruthy()
    expect(typeof version).toBe('string')
    expect(template).toBeTruthy()
    expect(typeof template).toBe('string')
  })

  it('template contains expected placeholder', () => {
    const { template } = loadConfigPrompt()
    expect(template).toContain('{{CONTENT}}')
  })

  it('version matches registry format', () => {
    const { version } = loadConfigPrompt()
    expect(version).toMatch(/^config-v\d+\.\d+$/)
  })
})

describe('loadOptimizerPrompt', () => {
  it('returns version and template with non-empty values', () => {
    const { version, template } = loadOptimizerPrompt()
    expect(version).toBeTruthy()
    expect(typeof version).toBe('string')
    expect(template).toBeTruthy()
    expect(typeof template).toBe('string')
  })

  it('template contains expected placeholders', () => {
    const { template } = loadOptimizerPrompt()
    expect(template).toContain('{{PROMPT}}')
    expect(template).toContain('{{MAX_LENGTH}}')
  })

  it('version matches registry format', () => {
    const { version } = loadOptimizerPrompt()
    expect(version).toMatch(/^optimizer-v\d+\.\d+$/)
  })
})

describe('loadSingleScoringPrompt', () => {
  it('returns version and template with non-empty values', () => {
    const { version, template } = loadSingleScoringPrompt()
    expect(version).toBeTruthy()
    expect(typeof version).toBe('string')
    expect(template).toBeTruthy()
    expect(typeof template).toBe('string')
  })

  it('template contains expected placeholder', () => {
    const { template } = loadSingleScoringPrompt()
    expect(template).toContain('{{PROMPT}}')
  })

  it('version matches registry format', () => {
    const { version } = loadSingleScoringPrompt()
    expect(version).toMatch(/^single_scoring-v\d+\.\d+$/)
  })
})

describe('fillTemplate', () => {
  it('replaces all {{PLACEHOLDER}} occurrences', () => {
    const template = 'Hello {{NAME}}, welcome to {{PLACE}}!'
    const result = fillTemplate(template, { NAME: 'Alice', PLACE: 'Wonderland' })
    expect(result).toBe('Hello Alice, welcome to Wonderland!')
  })

  it('replaces multiple occurrences of the same placeholder', () => {
    const template = '{{X}} and {{X}} again'
    const result = fillTemplate(template, { X: 'test' })
    expect(result).toBe('test and test again')
  })

  it('leaves unknown placeholders untouched', () => {
    const template = 'Hello {{NAME}}, your {{UNKNOWN}} is here'
    const result = fillTemplate(template, { NAME: 'Bob' })
    expect(result).toBe('Hello Bob, your {{UNKNOWN}} is here')
  })

  it('handles empty vars map', () => {
    const template = 'No {{REPLACEMENTS}} here'
    const result = fillTemplate(template, {})
    expect(result).toBe('No {{REPLACEMENTS}} here')
  })

  it('handles empty template', () => {
    const result = fillTemplate('', { KEY: 'value' })
    expect(result).toBe('')
  })

  it('does not affect literal JSON braces', () => {
    const template = '{ "key": "{{VALUE}}" }'
    const result = fillTemplate(template, { VALUE: 'hello' })
    expect(result).toBe('{ "key": "hello" }')
  })
})
