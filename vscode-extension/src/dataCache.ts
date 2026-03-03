import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'

interface CacheEntry<T> {
  data: T
  timestamp: number
}

const TTL_MS = 5 * 60 * 1000 // 5 minutes

export class DataCache {
  private readonly usagePath: string
  private readonly sessionsPath: string
  private usageMemory: CacheEntry<any> | null = null
  private sessionsMemory: CacheEntry<any> | null = null

  constructor(globalStorageUri: vscode.Uri) {
    const dir = globalStorageUri.fsPath
    this.usagePath = path.join(dir, 'usage_cache.json')
    this.sessionsPath = path.join(dir, 'sessions_cache.json')
  }

  getUsage(): { data: any | null; isStale: boolean } {
    return this.get('usage')
  }

  getSessions(): { data: any | null; isStale: boolean } {
    return this.get('sessions')
  }

  setUsage(data: any): void {
    this.set('usage', data)
  }

  setSessions(data: any): void {
    this.set('sessions', data)
  }

  invalidate(): void {
    this.usageMemory = null
    this.sessionsMemory = null
  }

  private get(kind: 'usage' | 'sessions'): { data: any | null; isStale: boolean } {
    const memory = kind === 'usage' ? this.usageMemory : this.sessionsMemory
    if (memory) {
      return { data: memory.data, isStale: Date.now() - memory.timestamp > TTL_MS }
    }

    const diskPath = kind === 'usage' ? this.usagePath : this.sessionsPath
    try {
      const raw = fs.readFileSync(diskPath, 'utf8')
      const entry: CacheEntry<any> = JSON.parse(raw)
      // Restore to memory
      if (kind === 'usage') this.usageMemory = entry
      else this.sessionsMemory = entry
      return { data: entry.data, isStale: Date.now() - entry.timestamp > TTL_MS }
    } catch {
      return { data: null, isStale: true }
    }
  }

  private set(kind: 'usage' | 'sessions', data: any): void {
    const entry: CacheEntry<any> = { data, timestamp: Date.now() }
    if (kind === 'usage') this.usageMemory = entry
    else this.sessionsMemory = entry

    const diskPath = kind === 'usage' ? this.usagePath : this.sessionsPath
    try {
      const dir = path.dirname(diskPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(diskPath, JSON.stringify(entry))
    } catch {
      // Best-effort disk write
    }
  }
}
