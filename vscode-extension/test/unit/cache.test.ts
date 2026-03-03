jest.mock('fs')

import * as fs from 'fs'
import * as vscode from 'vscode'
import { ScoreCache } from '../../src/cache'

const mockFs = fs as jest.Mocked<typeof fs>

describe('ScoreCache', () => {
  let cache: ScoreCache

  beforeEach(() => {
    jest.clearAllMocks()
    const uri = vscode.Uri.file('/tmp/codefluent-storage')
    cache = new ScoreCache(uri)
  })

  describe('read', () => {
    it('returns parsed JSON from scores.json', () => {
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ 'sess-1': { score: 80 } }))
      const result = cache.read()
      expect(result).toEqual({ 'sess-1': { score: 80 } })
      expect(mockFs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('scores.json'),
        'utf8',
      )
    })

    it('returns empty object on ENOENT', () => {
      mockFs.readFileSync.mockImplementation(() => { throw new Error('ENOENT') })
      expect(cache.read()).toEqual({})
    })

    it('returns empty object on invalid JSON', () => {
      mockFs.readFileSync.mockReturnValue('not json{{{')
      expect(cache.read()).toEqual({})
    })
  })

  describe('write', () => {
    it('writes stringified JSON to scores.json', () => {
      mockFs.existsSync.mockReturnValue(true)
      const data = { 'sess-1': { score: 75 } }
      cache.write(data)
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('scores.json'),
        JSON.stringify(data, null, 2),
      )
    })

    it('creates directory if missing', () => {
      mockFs.existsSync.mockReturnValue(false)
      cache.write({ test: true })
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.any(String),
        { recursive: true },
      )
    })

    it('pretty-prints JSON output', () => {
      mockFs.existsSync.mockReturnValue(true)
      cache.write({ a: 1 })
      const written = (mockFs.writeFileSync as jest.Mock).mock.calls[0][1]
      expect(written).toContain('\n')
      expect(written).toBe(JSON.stringify({ a: 1 }, null, 2))
    })
  })

  describe('readConfig', () => {
    it('returns parsed JSON from config_scores.json', () => {
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ project: { hash: 'abc' } }))
      const result = cache.readConfig()
      expect(result).toEqual({ project: { hash: 'abc' } })
      expect(mockFs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('config_scores.json'),
        'utf8',
      )
    })

    it('returns empty object on failure', () => {
      mockFs.readFileSync.mockImplementation(() => { throw new Error('ENOENT') })
      expect(cache.readConfig()).toEqual({})
    })
  })

  describe('writeConfig', () => {
    it('writes to config_scores.json path', () => {
      mockFs.existsSync.mockReturnValue(true)
      cache.writeConfig({ key: 'value' })
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('config_scores.json'),
        expect.any(String),
      )
    })

    it('creates directory if missing', () => {
      mockFs.existsSync.mockReturnValue(false)
      cache.writeConfig({ key: 'value' })
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.any(String),
        { recursive: true },
      )
    })
  })

  describe('readLastScoredIds', () => {
    it('returns parsed array', () => {
      mockFs.readFileSync.mockReturnValue(JSON.stringify(['id-1', 'id-2']))
      const result = cache.readLastScoredIds()
      expect(result).toEqual(['id-1', 'id-2'])
      expect(mockFs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('last_scored_ids.json'),
        'utf8',
      )
    })

    it('returns empty array on failure', () => {
      mockFs.readFileSync.mockImplementation(() => { throw new Error('ENOENT') })
      expect(cache.readLastScoredIds()).toEqual([])
    })

    it('returns empty array for non-array JSON', () => {
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ not: 'array' }))
      expect(cache.readLastScoredIds()).toEqual([])
    })
  })

  describe('writeLastScoredIds', () => {
    it('writes JSON array', () => {
      mockFs.existsSync.mockReturnValue(true)
      cache.writeLastScoredIds(['id-1', 'id-2'])
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('last_scored_ids.json'),
        JSON.stringify(['id-1', 'id-2']),
      )
    })

    it('creates directory if missing', () => {
      mockFs.existsSync.mockReturnValue(false)
      cache.writeLastScoredIds(['id-1'])
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.any(String),
        { recursive: true },
      )
    })
  })

  describe('contentHash (static)', () => {
    it('returns first 100 chars + colon + length', () => {
      const content = 'A'.repeat(200)
      const hash = ScoreCache.contentHash(content)
      expect(hash).toBe('A'.repeat(100) + ':200')
    })

    it('handles content shorter than 100 chars', () => {
      const hash = ScoreCache.contentHash('short')
      expect(hash).toBe('short:5')
    })

    it('handles empty string', () => {
      expect(ScoreCache.contentHash('')).toBe(':0')
    })

    it('is deterministic', () => {
      const content = 'test content here'
      expect(ScoreCache.contentHash(content)).toBe(ScoreCache.contentHash(content))
    })
  })

  describe('file path construction', () => {
    it('uses correct paths relative to globalStorageUri', () => {
      // Verify scores.json path
      mockFs.readFileSync.mockReturnValue('{}')
      cache.read()
      const scoresPath = (mockFs.readFileSync as jest.Mock).mock.calls[0][0]
      expect(scoresPath).toMatch(/codefluent-storage[/\\]scores\.json$/)

      // Verify config_scores.json path
      jest.clearAllMocks()
      mockFs.readFileSync.mockReturnValue('{}')
      cache.readConfig()
      const configPath = (mockFs.readFileSync as jest.Mock).mock.calls[0][0]
      expect(configPath).toMatch(/codefluent-storage[/\\]config_scores\.json$/)

      // Verify last_scored_ids.json path
      jest.clearAllMocks()
      mockFs.readFileSync.mockReturnValue('[]')
      cache.readLastScoredIds()
      const idsPath = (mockFs.readFileSync as jest.Mock).mock.calls[0][0]
      expect(idsPath).toMatch(/codefluent-storage[/\\]last_scored_ids\.json$/)
    })
  })
})
