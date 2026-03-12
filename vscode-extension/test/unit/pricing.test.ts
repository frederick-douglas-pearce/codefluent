import { resolveModelKey, getPricingForDate, estimateSessionCost, loadPricing, resetPricingCache, PricingData } from '../../src/pricing'
import * as path from 'path'

const TEST_PRICING: PricingData = {
  models: {
    'claude-opus-4-6': [
      { effective_date: '2025-11-01', input: 15.0, output: 75.0, cache_creation: 18.75, cache_read: 1.875 },
    ],
    'claude-sonnet-4-6': [
      { effective_date: '2025-05-14', input: 3.0, output: 15.0, cache_creation: 3.75, cache_read: 0.30 },
    ],
    'claude-haiku-4-5-20251001': [
      { effective_date: '2025-10-01', input: 0.80, output: 4.0, cache_creation: 1.0, cache_read: 0.08 },
    ],
    'claude-sonnet-4-5-20250929': [
      { effective_date: '2025-09-29', input: 3.0, output: 15.0, cache_creation: 3.75, cache_read: 0.30 },
    ],
  },
  aliases: {
    opus: 'claude-opus-4-6',
    sonnet: 'claude-sonnet-4-6',
    haiku: 'claude-haiku-4-5-20251001',
  },
  default_model: 'claude-sonnet-4-6',
}

describe('resolveModelKey', () => {
  it('returns exact match', () => {
    expect(resolveModelKey('claude-opus-4-6', TEST_PRICING)).toBe('claude-opus-4-6')
  })

  it('resolves alias', () => {
    expect(resolveModelKey('opus', TEST_PRICING)).toBe('claude-opus-4-6')
    expect(resolveModelKey('sonnet', TEST_PRICING)).toBe('claude-sonnet-4-6')
    expect(resolveModelKey('haiku', TEST_PRICING)).toBe('claude-haiku-4-5-20251001')
  })

  it('resolves prefix match', () => {
    // claude-sonnet-4-5-20250929 is a prefix of a hypothetical longer ID
    expect(resolveModelKey('claude-sonnet-4-5-20250929-extended', TEST_PRICING)).toBe('claude-sonnet-4-5-20250929')
  })

  it('returns default for unknown model', () => {
    expect(resolveModelKey('unknown-model', TEST_PRICING)).toBe('claude-sonnet-4-6')
  })

  it('returns default for null model', () => {
    expect(resolveModelKey(null, TEST_PRICING)).toBe('claude-sonnet-4-6')
  })

  it('returns default for <synthetic> model', () => {
    expect(resolveModelKey('<synthetic>', TEST_PRICING)).toBe('claude-sonnet-4-6')
  })
})

describe('getPricingForDate', () => {
  it('returns single entry regardless of date', () => {
    const entries = [{ effective_date: '2025-11-01', input: 15.0, output: 75.0, cache_creation: 18.75, cache_read: 1.875 }]
    expect(getPricingForDate(entries, '2024-01-01')).toEqual(entries[0])
  })

  it('picks latest entry before session date with multiple entries', () => {
    const entries = [
      { effective_date: '2025-01-01', input: 5.0, output: 25.0, cache_creation: 6.25, cache_read: 0.625 },
      { effective_date: '2025-06-01', input: 3.0, output: 15.0, cache_creation: 3.75, cache_read: 0.30 },
    ]
    // Session before first entry — gets first entry
    expect(getPricingForDate(entries, '2024-12-01').input).toBe(5.0)
    // Session between entries — gets first entry
    expect(getPricingForDate(entries, '2025-03-15').input).toBe(5.0)
    // Session after second entry — gets second entry
    expect(getPricingForDate(entries, '2025-07-01').input).toBe(3.0)
  })

  it('returns latest entry when session date is null', () => {
    const entries = [
      { effective_date: '2025-01-01', input: 5.0, output: 25.0, cache_creation: 6.25, cache_read: 0.625 },
      { effective_date: '2025-06-01', input: 3.0, output: 15.0, cache_creation: 3.75, cache_read: 0.30 },
    ]
    expect(getPricingForDate(entries, null).input).toBe(3.0)
  })
})

describe('estimateSessionCost', () => {
  it('computes correct cost for Sonnet session', () => {
    const cost = estimateSessionCost(
      10000,  // input
      5000,   // output
      2000,   // cache creation
      50000,  // cache read
      'claude-sonnet-4-6',
      '2026-01-01',
      TEST_PRICING,
    )

    // input: 10000 * 3.0 / 1M = 0.03
    // output: 5000 * 15.0 / 1M = 0.075
    // cache_creation: 2000 * 3.75 / 1M = 0.0075
    // cache_read: 50000 * 0.30 / 1M = 0.015
    expect(cost.input_cost).toBeCloseTo(0.03, 6)
    expect(cost.output_cost).toBeCloseTo(0.075, 6)
    expect(cost.cache_creation_cost).toBeCloseTo(0.0075, 6)
    expect(cost.cache_read_cost).toBeCloseTo(0.015, 6)
    expect(cost.total_cost).toBeCloseTo(0.1275, 6)
  })

  it('computes correct cost for Opus session (5x more expensive)', () => {
    const cost = estimateSessionCost(
      10000, 5000, 2000, 50000,
      'claude-opus-4-6',
      '2026-01-01',
      TEST_PRICING,
    )

    // input: 10000 * 15.0 / 1M = 0.15
    // output: 5000 * 75.0 / 1M = 0.375
    expect(cost.input_cost).toBeCloseTo(0.15, 6)
    expect(cost.output_cost).toBeCloseTo(0.375, 6)
    expect(cost.total_cost).toBeGreaterThan(0.5)
  })

  it('computes correct cost for Haiku session (cheapest)', () => {
    const cost = estimateSessionCost(
      10000, 5000, 2000, 50000,
      'claude-haiku-4-5-20251001',
      '2026-01-01',
      TEST_PRICING,
    )

    // input: 10000 * 0.80 / 1M = 0.008
    // output: 5000 * 4.0 / 1M = 0.02
    expect(cost.input_cost).toBeCloseTo(0.008, 6)
    expect(cost.output_cost).toBeCloseTo(0.02, 6)
    expect(cost.total_cost).toBeLessThan(0.05)
  })

  it('falls back to Sonnet pricing for unknown model', () => {
    const costUnknown = estimateSessionCost(10000, 5000, 0, 0, 'unknown-model', '2026-01-01', TEST_PRICING)
    const costSonnet = estimateSessionCost(10000, 5000, 0, 0, 'claude-sonnet-4-6', '2026-01-01', TEST_PRICING)

    expect(costUnknown.total_cost).toBe(costSonnet.total_cost)
  })

  it('resolves alias models', () => {
    const costAlias = estimateSessionCost(10000, 5000, 0, 0, 'opus', '2026-01-01', TEST_PRICING)
    const costExact = estimateSessionCost(10000, 5000, 0, 0, 'claude-opus-4-6', '2026-01-01', TEST_PRICING)

    expect(costAlias.total_cost).toBe(costExact.total_cost)
  })

  it('returns zero cost for zero tokens', () => {
    const cost = estimateSessionCost(0, 0, 0, 0, 'claude-sonnet-4-6', '2026-01-01', TEST_PRICING)

    expect(cost.total_cost).toBe(0)
  })

  it('handles null model and date', () => {
    const cost = estimateSessionCost(1000, 500, 0, 0, null, null, TEST_PRICING)

    expect(cost.total_cost).toBeGreaterThan(0)
  })
})

describe('loadPricing', () => {
  beforeEach(() => resetPricingCache())
  afterEach(() => resetPricingCache())

  it('loads pricing from shared/pricing.json', () => {
    const basePath = path.join(__dirname, '..', '..', '..')
    const pricing = loadPricing(basePath)

    expect(pricing.models).toBeDefined()
    expect(pricing.aliases).toBeDefined()
    expect(pricing.default_model).toBe('claude-sonnet-4-6')
    expect(Object.keys(pricing.models).length).toBeGreaterThanOrEqual(4)
  })

  it('contains expected models', () => {
    const basePath = path.join(__dirname, '..', '..', '..')
    const pricing = loadPricing(basePath)

    expect(pricing.models['claude-opus-4-6']).toBeDefined()
    expect(pricing.models['claude-sonnet-4-6']).toBeDefined()
    expect(pricing.models['claude-haiku-4-5-20251001']).toBeDefined()
  })

  it('each model entry has required pricing fields', () => {
    const basePath = path.join(__dirname, '..', '..', '..')
    const pricing = loadPricing(basePath)

    for (const [model, entries] of Object.entries(pricing.models)) {
      expect(entries.length).toBeGreaterThanOrEqual(1)
      for (const entry of entries) {
        expect(entry).toHaveProperty('effective_date')
        expect(entry).toHaveProperty('input')
        expect(entry).toHaveProperty('output')
        expect(entry).toHaveProperty('cache_creation')
        expect(entry).toHaveProperty('cache_read')
        expect(typeof entry.input).toBe('number')
        expect(typeof entry.output).toBe('number')
      }
    }
  })

  it('throws when pricing.json not found', () => {
    expect(() => loadPricing('/nonexistent/path')).toThrow('pricing.json not found')
  })
})
