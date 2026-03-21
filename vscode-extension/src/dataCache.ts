import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { getConfig } from './config'

interface CacheEntry<T> {
  data: T
  timestamp: number
}

const TTL_MS = getConfig<number>('display.dataCacheTtlMinutes') * 60 * 1000

export class DataCache {
  private readonly usagePath: string
  private readonly conversationsPath: string
  private usageMemory: CacheEntry<any> | null = null
  private conversationsMemory: CacheEntry<any> | null = null

  constructor(globalStorageUri: vscode.Uri) {
    const dir = globalStorageUri.fsPath
    this.usagePath = path.join(dir, 'usage_cache.json')
    this.conversationsPath = path.join(dir, 'conversations_cache.json')
  }

  getUsage(): { data: any | null; isStale: boolean } {
    return this.get('usage')
  }

  getConversations(): { data: any | null; isStale: boolean } {
    return this.get('conversations')
  }

  /** @deprecated Use getConversations() */
  getSessions(): { data: any | null; isStale: boolean } {
    return this.getConversations()
  }

  setUsage(data: any): void {
    this.set('usage', data)
  }

  setConversations(data: any): void {
    this.set('conversations', data)
  }

  /** @deprecated Use setConversations() */
  setSessions(data: any): void {
    this.setConversations(data)
  }

  invalidate(): void {
    this.usageMemory = null
    this.conversationsMemory = null
  }

  private get(kind: 'usage' | 'conversations'): { data: any | null; isStale: boolean } {
    const memory = kind === 'usage' ? this.usageMemory : this.conversationsMemory
    if (memory) {
      return { data: memory.data, isStale: Date.now() - memory.timestamp > TTL_MS }
    }

    const diskPath = kind === 'usage' ? this.usagePath : this.conversationsPath
    try {
      const raw = fs.readFileSync(diskPath, 'utf8')
      const entry: CacheEntry<any> = JSON.parse(raw)
      // Restore to memory
      if (kind === 'usage') this.usageMemory = entry
      else this.conversationsMemory = entry
      return { data: entry.data, isStale: Date.now() - entry.timestamp > TTL_MS }
    } catch {
      return { data: null, isStale: true }
    }
  }

  private set(kind: 'usage' | 'conversations', data: any): void {
    const entry: CacheEntry<any> = { data, timestamp: Date.now() }
    if (kind === 'usage') this.usageMemory = entry
    else this.conversationsMemory = entry

    const diskPath = kind === 'usage' ? this.usagePath : this.conversationsPath
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
