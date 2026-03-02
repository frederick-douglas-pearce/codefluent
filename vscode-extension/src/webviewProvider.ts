import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'

export class CodeFluentPanel {
  public static currentPanel: CodeFluentPanel | undefined
  private static readonly viewType = 'codefluent'

  private readonly panel: vscode.WebviewPanel
  private readonly extensionUri: vscode.Uri
  private disposed = false

  public static createOrShow(extensionUri: vscode.Uri) {
    if (CodeFluentPanel.currentPanel) {
      CodeFluentPanel.currentPanel.panel.reveal(vscode.ViewColumn.One)
      return
    }

    const panel = vscode.window.createWebviewPanel(
      CodeFluentPanel.viewType,
      'CodeFluent',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
        retainContextWhenHidden: true,
      }
    )

    CodeFluentPanel.currentPanel = new CodeFluentPanel(panel, extensionUri)
  }

  private static readonly API_BASE = 'http://localhost:8001'

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel
    this.extensionUri = extensionUri

    this.panel.webview.html = this.getHtmlContent()

    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
    )

    this.panel.onDidDispose(() => {
      this.disposed = true
      CodeFluentPanel.currentPanel = undefined
    })
  }

  private async handleMessage(msg: { type: string; requestId: string; payload?: any }) {
    const { type, requestId, payload } = msg

    const routes: Record<string, { path: string; method?: string; body?: any }> = {
      getUsage: { path: '/api/usage' },
      getSessions: { path: '/api/sessions' },
      runScoring: { path: '/api/score', method: 'POST', body: payload },
      getQuickwins: { path: '/api/quickwins' },
      getCachedScores: { path: '/api/scores' },
    }

    const route = routes[type]
    if (!route) { return }

    try {
      const url = `${CodeFluentPanel.API_BASE}${route.path}`
      const options: RequestInit = {}
      if (route.method === 'POST') {
        options.method = 'POST'
        options.headers = { 'Content-Type': 'application/json' }
        options.body = JSON.stringify(route.body)
      }
      const res = await fetch(url, options)
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }
      const data = await res.json()
      this.panel.webview.postMessage({ type, requestId, data })
    } catch (err: any) {
      this.panel.webview.postMessage({ type, requestId, error: err.message || 'Request failed' })
    }
  }

  private getHtmlContent(): string {
    const webview = this.panel.webview
    const mediaUri = vscode.Uri.joinPath(this.extensionUri, 'media')

    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'style.css'))
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'app.js'))
    const chartUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'libs', 'chart.min.js'))

    const nonce = getNonce()

    const htmlPath = path.join(this.extensionUri.fsPath, 'media', 'index.html')
    let html = fs.readFileSync(htmlPath, 'utf8')

    // Replace placeholders with actual URIs and nonce
    html = html.replace(/{{styleUri}}/g, styleUri.toString())
    html = html.replace(/{{scriptUri}}/g, scriptUri.toString())
    html = html.replace(/{{chartUri}}/g, chartUri.toString())
    html = html.replace(/{{nonce}}/g, nonce)
    html = html.replace(/{{cspSource}}/g, webview.cspSource)

    return html
  }
}

function getNonce(): string {
  let text = ''
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return text
}
