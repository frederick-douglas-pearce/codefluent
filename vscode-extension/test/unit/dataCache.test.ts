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

  describe('getConversations / setConversations', () => {
    it('returns null when empty', () => {
      const cache = makeCache()
      const { data, isStale } = cache.getConversations()
      expect(data).toBeNull()
      expect(isStale).toBe(true)
    })

    it('returns fresh data after set', () => {
      const cache = makeCache()
      const mockData = { conversations: [{ id: 'c1' }], metadata: {} }
      cache.setConversations(mockData)

      const { data, isStale } = cache.getConversations()
      expect(data).toEqual(mockData)
      expect(isStale).toBe(false)
    })

    it('returns stale after TTL expires', () => {
      const cache = makeCache()
      cache.setConversations({ conversations: [] })

      const entry = (cache as any).conversationsMemory
      entry.timestamp = Date.now() - 6 * 60 * 1000 // 6 minutes ago

      const { data, isStale } = cache.getConversations()
      expect(data).toEqual({ conversations: [] })
      expect(isStale).toBe(true)
    })
  })

  describe('deprecated getSessions / setSessions aliases', () => {
    it('getSessions delegates to getConversations', () => {
      const cache = makeCache()
      const mockData = { conversations: [{ id: 'c1' }], metadata: {} }
      cache.setSessions(mockData)

      const { data } = cache.getSessions()
      expect(data).toEqual(mockData)
    })
  })

  describe('invalidate', () => {
    it('clears memory cache but disk persists', () => {
      const cache = makeCache()
      cache.setConversations({ conversations: [] })

      cache.invalidate()

      // After invalidate, get should fall back to disk
      const { data } = cache.getConversations()
      expect(data).toEqual({ conversations: [] })
    })

    it('forces disk fallback which may be stale', () => {
      const cache = makeCache()
      cache.setConversations({ conversations: [] })

      const diskPath = path.join(TEST_DIR, 'conversations_cache.json')
      const raw = JSON.parse(fs.readFileSync(diskPath, 'utf8'))
      raw.timestamp = Date.now() - 10 * 60 * 1000
      fs.writeFileSync(diskPath, JSON.stringify(raw))

      cache.invalidate()

      const { data, isStale } = cache.getConversations()
      expect(data).toEqual({ conversations: [] })
      expect(isStale).toBe(true)
    })
  })

  describe('disk persistence', () => {
    it('persists across instances', () => {
      const cache1 = makeCache()
      cache1.setConversations({ conversations: [{ id: 'abc' }] })

      const cache2 = makeCache()
      const { data } = cache2.getConversations()
      expect(data).toEqual({ conversations: [{ id: 'abc' }] })
    })

    it('handles missing disk files gracefully', () => {
      const cache = makeCache()
      const { data } = cache.getConversations()
      expect(data).toBeNull()
    })
  })
})
