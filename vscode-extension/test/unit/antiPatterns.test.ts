import {
  detectStructuredOutputAntiPattern,
  detectAntiPatterns,
  STRUCTURED_OUTPUT_PATTERNS,
  AntiPatternResult,
} from '../../src/antiPatterns'

// ─── detectStructuredOutputAntiPattern ──────────────────────────────

describe('detectStructuredOutputAntiPattern', () => {
  // ─── Positive cases (each pattern variant matches) ───────────────

  it.each([
    ['Please output as JSON', 'output as JSON'],
    ['Please output in JSON', 'output in JSON'],
    ['Respond in JSON format', 'respond in JSON format'],
    ['Respond with JSON', 'respond with JSON'],
    ['Return a JSON object', 'return a JSON object'],
    ['Return JSON response', 'return JSON response'],
    ['Return a JSON output', 'return a JSON output'],
    ['Format your response as JSON', 'format your response as JSON'],
    ['Format response as JSON', 'format response as JSON'],
    ['Give me the result as JSON', 'give me the result as JSON'],
    ['Give me the response in JSON', 'give me the response in JSON'],
    ['Give me result as JSON', 'give me result as JSON'],
    ['Reply in JSON', 'reply in JSON'],
    ['Reply with JSON', 'reply with JSON'],
    ['Provide the output using JSON', 'provide the output using JSON'],
    ['Provide the result as JSON', 'provide the result as JSON'],
    ['Provide response in JSON', 'provide response in JSON'],
    ['JSON format only', 'JSON format only'],
    ['JSON format please', 'JSON format please'],
    ['Must return JSON', 'must return JSON'],
    ['Must be in JSON', 'must be in JSON'],
    ['Should output JSON', 'should output JSON'],
    ['Needs to return JSON', 'needs to return JSON'],
    ['The response should be in json', 'case insensitive'],
  ])('detects: "%s" (%s)', (prompt) => {
    const result = detectStructuredOutputAntiPattern([prompt])
    expect(result.has_structured_output_antipattern).toBe(true)
    expect(result.structured_output_antipattern_count).toBe(1)
    expect(result.structured_output_antipattern_indices).toEqual([0])
  })

  // ─── Negative cases (must NOT trigger) ───────────────────────────

  it.each([
    ['Parse the JSON file', 'descriptive usage'],
    ['The API returns JSON', 'descriptive statement'],
    ['Read the JSON config', 'file reference'],
    ['JSON is a data format', 'definition'],
    ['I saved it as a .json file', 'file extension'],
    ['Explain JSON schema to me', 'learning request'],
    ['', 'empty string'],
    ['Fix the bug in the handler', 'unrelated prompt'],
    ['Convert the CSV to a different format', 'no JSON mention'],
  ])('does NOT detect: "%s" (%s)', (prompt) => {
    const result = detectStructuredOutputAntiPattern([prompt])
    expect(result.has_structured_output_antipattern).toBe(false)
    expect(result.structured_output_antipattern_count).toBe(0)
    expect(result.structured_output_antipattern_indices).toEqual([])
  })

  // ─── Multiple prompts ────────────────────────────────────────────

  it('detects only matching prompts in a mixed list', () => {
    const prompts = [
      'Fix the login bug',
      'Output as JSON',
      'Add unit tests',
      'Reply in JSON',
      'Refactor the parser',
    ]
    const result = detectStructuredOutputAntiPattern(prompts)
    expect(result.has_structured_output_antipattern).toBe(true)
    expect(result.structured_output_antipattern_count).toBe(2)
    expect(result.structured_output_antipattern_indices).toEqual([1, 3])
  })

  // ─── Empty array ─────────────────────────────────────────────────

  it('returns no anti-patterns for empty array', () => {
    const result = detectStructuredOutputAntiPattern([])
    expect(result.has_structured_output_antipattern).toBe(false)
    expect(result.structured_output_antipattern_count).toBe(0)
    expect(result.structured_output_antipattern_indices).toEqual([])
  })

  // ─── Count accuracy ──────────────────────────────────────────────

  it('counts multiple matching prompts correctly', () => {
    const prompts = [
      'Respond in JSON format',
      'Return a JSON object',
      'Format your response as JSON',
    ]
    const result = detectStructuredOutputAntiPattern(prompts)
    expect(result.has_structured_output_antipattern).toBe(true)
    expect(result.structured_output_antipattern_count).toBe(3)
    expect(result.structured_output_antipattern_indices).toEqual([0, 1, 2])
  })

  it('counts each prompt only once even if multiple patterns match', () => {
    // "Return a JSON object" could match "return a JSON object" pattern
    // It should still only count as 1
    const result = detectStructuredOutputAntiPattern(['Return a JSON object and respond in JSON'])
    expect(result.structured_output_antipattern_count).toBe(1)
    expect(result.structured_output_antipattern_indices).toEqual([0])
  })
})

// ─── detectAntiPatterns ────────────────────────────────────────────

describe('detectAntiPatterns', () => {
  it('delegates to detectStructuredOutputAntiPattern', () => {
    const prompts = ['Output as JSON', 'Fix the bug']
    const result = detectAntiPatterns(prompts)
    expect(result.has_structured_output_antipattern).toBe(true)
    expect(result.structured_output_antipattern_count).toBe(1)
    expect(result.structured_output_antipattern_indices).toEqual([0])
  })

  it('returns clean result for no matches', () => {
    const result = detectAntiPatterns(['Add tests', 'Fix the bug'])
    expect(result.has_structured_output_antipattern).toBe(false)
    expect(result.structured_output_antipattern_count).toBe(0)
    expect(result.structured_output_antipattern_indices).toEqual([])
  })
})

// ─── STRUCTURED_OUTPUT_PATTERNS ────────────────────────────────────

describe('STRUCTURED_OUTPUT_PATTERNS', () => {
  it('exports an array of RegExp patterns', () => {
    expect(Array.isArray(STRUCTURED_OUTPUT_PATTERNS)).toBe(true)
    expect(STRUCTURED_OUTPUT_PATTERNS.length).toBe(9)
    for (const pattern of STRUCTURED_OUTPUT_PATTERNS) {
      expect(pattern).toBeInstanceOf(RegExp)
      expect(pattern.flags).toContain('i')
    }
  })
})
