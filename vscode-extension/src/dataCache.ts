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
  private readonly conversationsPath: string
  private conversationsMemory: CacheEntry<any> | null = null

  constructor(globalStorageUri: vscode.Uri) {
    const dir = globalStorageUri.fsPath
    this.conversationsPath = path.join(dir, 'conversations_cache.json')
  }

  getConversations(): { data: any | null; isStale: boolean } {
    if (this.conversationsMemory) {
      return {
        data: this.conversationsMemory.data,
        isStale: Date.now() - this.conversationsMemory.timestamp > TTL_MS,
      }
    }

    try {
      const raw = fs.readFileSync(this.conversationsPath, 'utf8')
      const entry: CacheEntry<any> = JSON.parse(raw)
      this.conversationsMemory = entry
      return { data: entry.data, isStale: Date.now() - entry.timestamp > TTL_MS }
    } catch {
      return { data: null, isStale: true }
    }
  }

  /** @deprecated Use getConversations() */
  getSessions(): { data: any | null; isStale: boolean } {
    return this.getConversations()
  }

  setConversations(data: any): void {
    const entry: CacheEntry<any> = { data, timestamp: Date.now() }
    this.conversationsMemory = entry

    try {
      const dir = path.dirname(this.conversationsPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.conversationsPath, JSON.stringify(entry))
    } catch {
      // Best-effort disk write
    }
  }

  /** @deprecated Use setConversations() */
  setSessions(data: any): void {
    this.setConversations(data)
  }

  invalidate(): void {
    this.conversationsMemory = null
  }
}
