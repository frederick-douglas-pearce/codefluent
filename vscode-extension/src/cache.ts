import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'

export class ScoreCache {
  private readonly filePath: string

  constructor(globalStorageUri: vscode.Uri) {
    this.filePath = path.join(globalStorageUri.fsPath, 'scores.json')
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
}
