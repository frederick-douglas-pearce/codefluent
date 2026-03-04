export class Uri {
  readonly fsPath: string
  private readonly _scheme: string

  constructor(fsPath: string, scheme = 'file') {
    this.fsPath = fsPath
    this._scheme = scheme
  }

  static file(p: string): Uri {
    return new Uri(p)
  }

  static joinPath(base: Uri, ...segments: string[]): Uri {
    const joined = [base.fsPath, ...segments].join('/')
    return new Uri(joined, 'file')
  }

  toString(): string {
    return `${this._scheme}://${this.fsPath}`
  }

  get scheme(): string {
    return this._scheme
  }
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export const window = {
  createStatusBarItem: jest.fn(() => ({
    text: '',
    tooltip: '',
    command: '',
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn(),
  })),
  registerWebviewViewProvider: jest.fn(() => ({ dispose: jest.fn() })),
  showInputBox: jest.fn(),
  showInformationMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  createTerminal: jest.fn(() => ({
    show: jest.fn(),
    sendText: jest.fn(),
    dispose: jest.fn(),
  })),
}

export const commands = {
  registerCommand: jest.fn((_cmd: string, callback: Function) => {
    return { dispose: jest.fn(), callback }
  }),
}

export const workspace = {
  workspaceFolders: undefined as any,
  getConfiguration: jest.fn(() => ({
    get: jest.fn(() => undefined),
  })),
}

export const env = {
  clipboard: {
    writeText: jest.fn().mockResolvedValue(undefined),
    readText: jest.fn().mockResolvedValue(''),
  },
}

export class CancellationTokenSource {
  token = { isCancellationRequested: false, onCancellationRequested: jest.fn() }
  cancel() { this.token.isCancellationRequested = true }
  dispose() {}
}
