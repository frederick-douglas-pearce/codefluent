import * as fs from 'fs'
import * as path from 'path'

export interface PricingEntry {
  effective_date: string
  input: number
  output: number
  cache_creation: number
  cache_read: number
}

export interface PricingData {
  models: Record<string, PricingEntry[]>
  aliases: Record<string, string>
  default_model: string
}

export interface SessionCost {
  input_cost: number
  output_cost: number
  cache_creation_cost: number
  cache_read_cost: number
  total_cost: number
}

let cachedPricing: PricingData | null = null

export function loadPricing(basePath?: string): PricingData {
  if (cachedPricing) return cachedPricing

  const searchPaths = basePath
    ? [path.join(basePath, 'shared', 'pricing.json')]
    : [
        path.join(__dirname, '..', 'shared', 'pricing.json'),
        path.join(__dirname, '..', '..', 'shared', 'pricing.json'),
      ]

  for (const p of searchPaths) {
    try {
      const raw = fs.readFileSync(p, 'utf8')
      cachedPricing = JSON.parse(raw)
      return cachedPricing!
    } catch {
      continue
    }
  }

  throw new Error('pricing.json not found')
}

/** Reset cached pricing (for testing) */
export function resetPricingCache(): void {
  cachedPricing = null
}

/**
 * Resolve a model ID to a canonical key in the pricing data.
 * Matching order: exact → alias → prefix match → default.
 */
export function resolveModelKey(modelId: string | null, pricing: PricingData): string {
  if (!modelId) return pricing.default_model

  // Exact match
  if (pricing.models[modelId]) return modelId

  // Alias match
  const aliasKey = modelId.toLowerCase()
  if (pricing.aliases[aliasKey]) {
    const resolved = pricing.aliases[aliasKey]
    if (pricing.models[resolved]) return resolved
  }

  // Prefix match: find the longest model key that is a prefix of the given ID
  let bestMatch = ''
  for (const key of Object.keys(pricing.models)) {
    if (modelId.startsWith(key) && key.length > bestMatch.length) {
      bestMatch = key
    }
  }
  if (bestMatch) return bestMatch

  return pricing.default_model
}

/**
 * Get the pricing entry active on a given date for a model.
 * Picks the latest entry whose effective_date <= sessionDate.
 */
export function getPricingForDate(entries: PricingEntry[], sessionDate: string | null): PricingEntry {
  if (entries.length === 1) return entries[0]

  // Sort ascending by effective_date
  const sorted = [...entries].sort((a, b) => a.effective_date.localeCompare(b.effective_date))

  if (!sessionDate) return sorted[sorted.length - 1]

  const dateStr = sessionDate.slice(0, 10) // YYYY-MM-DD

  let active = sorted[0]
  for (const entry of sorted) {
    if (entry.effective_date <= dateStr) {
      active = entry
    } else {
      break
    }
  }
  return active
}

/**
 * Estimate the cost of a session based on its token usage and model.
 */
export function estimateSessionCost(
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number,
  cacheReadTokens: number,
  model: string | null,
  sessionDate: string | null,
  pricing?: PricingData,
): SessionCost {
  const p = pricing || loadPricing()
  const modelKey = resolveModelKey(model, p)
  const entries = p.models[modelKey]
  const rate = getPricingForDate(entries, sessionDate)

  const M = 1_000_000
  const input_cost = (inputTokens * rate.input) / M
  const output_cost = (outputTokens * rate.output) / M
  const cache_creation_cost = (cacheCreationTokens * rate.cache_creation) / M
  const cache_read_cost = (cacheReadTokens * rate.cache_read) / M

  return {
    input_cost,
    output_cost,
    cache_creation_cost,
    cache_read_cost,
    total_cost: input_cost + output_cost + cache_creation_cost + cache_read_cost,
  }
}
