export type AntiPatternType = 'structured_output'

export interface AntiPatternResult {
  has_structured_output_antipattern: boolean
  structured_output_antipattern_count: number
  structured_output_antipattern_indices: number[]
}

export const STRUCTURED_OUTPUT_PATTERNS: RegExp[] = [
  /\boutput\s+(as|in)\s+json\b/i,
  /\brespond\s+(in|with)\s+json(\s+format)?\b/i,
  /\breturn\s+a?\s*json\s+(object|response|output)\b/i,
  /\bformat\s+(your\s+)?response\s+as\s+json\b/i,
  /\bgive\s+me\s+(the\s+)?(result|response|output|answer)\s+(as|in)\s+json\b/i,
  /\breply\s+(in|with)\s+json\b/i,
  /\bprovide\s+(the\s+)?(result|response|output|answer)\s+(as|in|using)\s+json\b/i,
  /\bjson\s+format\s+(only|please)\b/i,
  /\b(must|should|needs?\s+to)\s+(be|return|output)\s+(in\s+)?json\b/i,
]

export function detectStructuredOutputAntiPattern(prompts: string[]): AntiPatternResult {
  const indices: number[] = []

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i]
    for (const pattern of STRUCTURED_OUTPUT_PATTERNS) {
      if (pattern.test(prompt)) {
        indices.push(i)
        break
      }
    }
  }

  return {
    has_structured_output_antipattern: indices.length > 0,
    structured_output_antipattern_count: indices.length,
    structured_output_antipattern_indices: indices,
  }
}

export function detectAntiPatterns(userPrompts: string[]): AntiPatternResult {
  return detectStructuredOutputAntiPattern(userPrompts)
}
