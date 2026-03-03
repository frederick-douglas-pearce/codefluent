import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'

export class ScoreCache {
  private readonly filePath: string
  private readonly configFilePath: string

  constructor(globalStorageUri: vscode.Uri) {
    this.filePath = path.join(globalStorageUri.fsPath, 'scores.json')
    this.configFilePath = path.join(globalStorageUri.fsPath, 'config_scores.json')
  }

  read(): Record<string, any> {
    try {
      const data = fs.readFileSync(this.filePath, 'utf8')
      return JSON.parse(data)
    } catch {
      return {}
    }
  }

  write(data: Record<string, any>): void {
    const dir = path.dirname(this.filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2))
  }

  readConfig(): Record<string, any> {
    try {
      const data = fs.readFileSync(this.configFilePath, 'utf8')
      return JSON.parse(data)
    } catch {
      return {}
    }
  }

  writeConfig(data: Record<string, any>): void {
    const dir = path.dirname(this.configFilePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(this.configFilePath, JSON.stringify(data, null, 2))
  }

  private get lastScoredPath(): string {
    return path.join(path.dirname(this.filePath), 'last_scored_ids.json')
  }

  readLastScoredIds(): string[] {
    try {
      const data = fs.readFileSync(this.lastScoredPath, 'utf8')
      const parsed = JSON.parse(data)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  writeLastScoredIds(ids: string[]): void {
    const dir = path.dirname(this.lastScoredPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(this.lastScoredPath, JSON.stringify(ids))
  }

  static contentHash(content: string): string {
    return content.slice(0, 100) + ':' + content.length
  }
}
