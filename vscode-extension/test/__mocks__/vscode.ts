export class Uri {
  readonly fsPath: string
  constructor(fsPath: string) {
    this.fsPath = fsPath
  }
  static file(path: string): Uri {
    return new Uri(path)
  }
}
