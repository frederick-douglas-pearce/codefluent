import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { DataCache } from '../../src/dataCache'

const TEST_DIR = '/tmp/codefluent-datacache-test'

function makeCache(): DataCache {
  return new DataCache(vscode.Uri.file(TEST_DIR))
}

describe('DataCache', () => {
  beforeEach(() => {
    // Clean up test directory
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  afterAll(() => {
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  describe('getUsage / setUsage', () => {
    it('returns null when empty', () => {
      const cache = makeCache()
      const { data, isStale } = cache.getUsage()
      expect(data).toBeNull()
      expect(isStale).toBe(true)
    })

    it('returns fresh data after set', () => {
      const cache = makeCache()
      const mockData = { daily: [{ date: '2026-01-01', totalCost: 1.5 }] }
      cache.setUsage(mockData)

      const { data, isStale } = cache.getUsage()
      expect(data).toEqual(mockData)
      expect(isStale).toBe(false)
    })

    it('returns stale after TTL expires', () => {
      const cache = makeCache()
      cache.setUsage({ daily: [] })

      // Manually expire the memory entry by patching the timestamp
      const entry = (cache as any).usageMemory
      entry.timestamp = Date.now() - 6 * 60 * 1000 // 6 minutes ago

      const { data, isStale } = cache.getUsage()
      expect(data).toEqual({ daily: [] })
      expect(isStale).toBe(true)
    })
  })

  describe('getSessions / setSessions', () => {
    it('returns null when empty', () => {
      const cache = makeCache()
      const { data, isStale } = cache.getSessions()
      expect(data).toBeNull()
      expect(isStale).toBe(true)
    })

    it('returns fresh data after set', () => {
      const cache = makeCache()
      const mockData = { sessions: [{ id: 's1' }], metadata: {} }
      cache.setSessions(mockData)

      const { data, isStale } = cache.getSessions()
      expect(data).toEqual(mockData)
      expect(isStale).toBe(false)
    })
  })

  describe('invalidate', () => {
    it('clears memory cache', () => {
      const cache = makeCache()
      cache.setUsage({ daily: [] })
      cache.setSessions({ sessions: [] })

      cache.invalidate()

      // Memory is cleared, but disk still has data
      // After invalidate, get should fall back to disk
      const usage = cache.getUsage()
      expect(usage.data).toEqual({ daily: [] })

      const sessions = cache.getSessions()
      expect(sessions.data).toEqual({ sessions: [] })
    })

    it('forces disk fallback which may be stale', () => {
      const cache = makeCache()
      cache.setUsage({ daily: [] })

      // Manually make disk entry stale
      const diskPath = path.join(TEST_DIR, 'usage_cache.json')
      const raw = JSON.parse(fs.readFileSync(diskPath, 'utf8'))
      raw.timestamp = Date.now() - 10 * 60 * 1000
      fs.writeFileSync(diskPath, JSON.stringify(raw))

      cache.invalidate()

      const { data, isStale } = cache.getUsage()
      expect(data).toEqual({ daily: [] })
      expect(isStale).toBe(true)
    })
  })

  describe('disk persistence', () => {
    it('persists across instances', () => {
      const cache1 = makeCache()
      cache1.setUsage({ daily: [{ date: '2026-03-01' }] })
      cache1.setSessions({ sessions: [{ id: 'abc' }] })

      // New instance reads from disk
      const cache2 = makeCache()
      const { data: usageData } = cache2.getUsage()
      expect(usageData).toEqual({ daily: [{ date: '2026-03-01' }] })

      const { data: sessionsData } = cache2.getSessions()
      expect(sessionsData).toEqual({ sessions: [{ id: 'abc' }] })
    })

    it('handles missing disk files gracefully', () => {
      const cache = makeCache()
      // No files exist
      const { data } = cache.getUsage()
      expect(data).toBeNull()
    })
  })
})
