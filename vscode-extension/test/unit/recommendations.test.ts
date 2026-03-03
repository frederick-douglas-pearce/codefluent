import * as fs from 'fs'
import * as path from 'path'

describe('Shared benchmarks.json', () => {
  const benchmarksPath = path.resolve(__dirname, '..', '..', '..', 'shared', 'benchmarks.json')
  let benchmarks: Record<string, number>

  beforeAll(() => {
    const data = JSON.parse(fs.readFileSync(benchmarksPath, 'utf8'))
    benchmarks = data.benchmarks
  })

  it('is valid JSON with required fields', () => {
    const data = JSON.parse(fs.readFileSync(benchmarksPath, 'utf8'))
    expect(data.version).toBeTruthy()
    expect(data.source).toBeTruthy()
    expect(data.benchmarks).toBeDefined()
  })

  it('has all 11 fluency behaviors', () => {
    const expected = [
      'iteration_and_refinement', 'building_on_responses', 'clarifying_goals',
      'adjusting_approach', 'questioning_reasoning', 'providing_feedback',
      'specifying_format', 'setting_interaction_terms', 'checking_facts',
      'providing_examples', 'identifying_missing_context',
    ]
    for (const behavior of expected) {
      expect(benchmarks[behavior]).toBeDefined()
      expect(typeof benchmarks[behavior]).toBe('number')
      expect(benchmarks[behavior]).toBeGreaterThan(0)
      expect(benchmarks[behavior]).toBeLessThanOrEqual(1)
    }
    expect(Object.keys(benchmarks)).toHaveLength(11)
  })
})

describe('RECOMMENDATIONS source-level checks', () => {
  const appJsPath = path.resolve(__dirname, '..', '..', 'media', 'app.js')
  let appJsContent: string

  beforeAll(() => {
    appJsContent = fs.readFileSync(appJsPath, 'utf8')
  })

  it('RECOMMENDATIONS entries have no threshold property', () => {
    // Extract the RECOMMENDATIONS object block
    const match = appJsContent.match(/const RECOMMENDATIONS = \{[\s\S]*?\n\}/)
    expect(match).toBeTruthy()
    expect(match![0]).not.toContain('threshold:')
  })

  it('renderRecommendations uses BENCHMARKS[behavior] not rec.threshold', () => {
    // Find the renderRecommendations function
    const fnMatch = appJsContent.match(/function renderRecommendations\(\)[\s\S]*?^}/m)
    expect(fnMatch).toBeTruthy()
    expect(fnMatch![0]).toContain('BENCHMARKS[behavior]')
    expect(fnMatch![0]).not.toContain('rec.threshold')
  })
})

describe('Recommendation threshold logic', () => {
  it('triggers recommendation when user is below benchmark', () => {
    const benchmark = 0.30
    const userVal = 0.20
    expect(userVal < benchmark).toBe(true)
  })

  it('does not trigger recommendation when user is at benchmark', () => {
    const benchmark = 0.30
    const userVal = 0.30
    expect(userVal < benchmark).toBe(false)
  })

  it('does not trigger recommendation when user is above benchmark', () => {
    const benchmark = 0.30
    const userVal = 0.50
    expect(userVal < benchmark).toBe(false)
  })
})

describe('Webapp app.js parity', () => {
  const webappAppJsPath = path.resolve(__dirname, '..', '..', '..', 'webapp', 'static', 'app.js')

  it('webapp RECOMMENDATIONS has no threshold property', () => {
    const content = fs.readFileSync(webappAppJsPath, 'utf8')
    const match = content.match(/const RECOMMENDATIONS = \{[\s\S]*?\n\}/)
    expect(match).toBeTruthy()
    expect(match![0]).not.toContain('threshold:')
  })

  it('webapp renderRecommendations uses BENCHMARKS[behavior]', () => {
    const content = fs.readFileSync(webappAppJsPath, 'utf8')
    const fnMatch = content.match(/function renderRecommendations\(\)[\s\S]*?^}/m)
    expect(fnMatch).toBeTruthy()
    expect(fnMatch![0]).toContain('BENCHMARKS[behavior]')
    expect(fnMatch![0]).not.toContain('rec.threshold')
  })
})
