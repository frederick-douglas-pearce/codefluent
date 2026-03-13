# Contributing to CodeFluent

Thanks for your interest in contributing to CodeFluent! This guide covers everything you need to get started.

## Prerequisites

- **Node.js 22+** — extension runtime and `npx ccusage`
- **VS Code 1.85+** — for extension development and debugging
- **Python 3.12+ / [uv](https://docs.astral.sh/uv/)** — for the web app
- **[`gh` CLI](https://cli.github.com/)** — authenticated (`gh auth login`) for Quick Wins features
- **Git** — version control
- **[Anthropic API key](https://console.anthropic.com/settings/keys)** — required for fluency scoring

## Dev Setup

```bash
# Clone the repo
git clone https://github.com/frederick-douglas-pearce/codefluent.git
cd codefluent/vscode-extension

# Install dependencies
npm install

# Start continuous compilation
npm run watch
```

To debug the VS Code extension, open `vscode-extension/` in VS Code and press **F5** to launch the Extension Development Host.

For the web app, see [`webapp/README.md`](webapp/README.md).

## Running Tests

```bash
cd vscode-extension
npm test                        # Run all 528 tests across 14 suites
npx jest --coverage             # Run with coverage report
npx jest test/unit/scoring      # Run a specific test file
```

All tests must pass before submitting a PR. The test suites cover:

| Suite | What it tests |
|-------|--------------|
| `scoring.test.ts` | `scoreSessions`, `computeAggregate`, config scoring |
| `quickwins.test.ts` | GitHub name validation, repo detection, argument safety |
| `xss.test.ts` | `escapeHtml` payloads + source-level XSS vector coverage |
| `platform.test.ts` | Cross-platform shell, escaping, npx helpers |
| `parser.test.ts` | JSONL session file parsing |
| `cache.test.ts` | Score cache read/write, invalidation |
| `usage.test.ts` | ccusage CLI bridge |
| `extension.test.ts` | Activation, status bar, commands |
| `webviewProvider.test.ts` | Message handling, HTML generation, injection tests |

## Code Conventions

### TypeScript (extension — `vscode-extension/src/`)

- **Strict mode** enabled — all types must be explicit
- **ES2020 target**, CommonJS output
- Keep files under ~300 lines; split when they grow beyond that

### JavaScript (webview — `media/app.js`, `webapp/static/app.js`)

- ES6+, no semicolons, async/await
- **No inline `onclick` handlers** — the webview uses nonce-based CSP that blocks them. Use event delegation on `document` instead.

### CSS

- Map to VS Code theme tokens via CSS custom properties (`--vscode-editor-background`, etc.)
- Brand colors: amber `#D97706`, emerald `#059669`, red `#DC2626`

## Security Rules

These are **hard requirements** — PRs that violate them will not be merged.

### XSS Prevention

All user-controlled strings rendered in HTML **must** pass through `escapeHtml()`:

```typescript
// Good
html += `<span>${escapeHtml(userInput)}</span>`

// Bad — never do this
html += `<span>${userInput}</span>`
```

### Command Injection Prevention

All shell commands **must** use `execFileSync` (or `execFile`) with argument arrays. Never use string interpolation or `exec` with shell strings:

```typescript
// Good
execFileSync('gh', ['issue', 'list', '--repo', repoName])

// Bad — never do this
execSync(`gh issue list --repo ${repoName}`)
```

### Test Coverage

XSS and injection tests exist in `test/unit/xss.test.ts` and `test/unit/quickwins.test.ts`. These must stay green.

## Feature Parity

CodeFluent ships **two production interfaces**: the VS Code extension and the web app. When adding a new feature:

- **Scoring/analytics features** should be implemented in both interfaces
- **Security fixes** (XSS, injection) must be applied to both `media/app.js` and `webapp/static/app.js`
- **UI-specific features** (e.g., VS Code status bar) only need the relevant interface

## PR Checklist

Before submitting a pull request, verify:

- [ ] `npm test` passes (all 528+ tests green)
- [ ] No regressions in existing functionality
- [ ] New features include test coverage
- [ ] Both interfaces updated if the change affects shared functionality
- [ ] No inline `onclick` handlers in webview HTML
- [ ] User-controlled strings use `escapeHtml()` in HTML contexts
- [ ] Shell commands use `execFileSync` with argument arrays
- [ ] Code follows existing conventions (TypeScript strict, no semicolons in JS)

## Project Structure

See the [README](README.md#project-structure) for a full directory layout.

## Questions?

Open an issue on [GitHub](https://github.com/frederick-douglas-pearce/codefluent/issues) if you have questions or run into problems.
