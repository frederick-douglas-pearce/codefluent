# Contributing to CodeFluent

Thanks for your interest in contributing to CodeFluent! This guide covers everything you need to get started.

CodeFluent ships **two production interfaces** — a VS Code extension and a FastAPI web app — both actively maintained and held to the same standards. See the [README](README.md) for a full project overview and [project structure](README.md#project-structure).

## Prerequisites

- **Node.js 22+** — extension runtime and `npx ccusage`
- **VS Code 1.85+** — for extension development and debugging
- **Python 3.12+ / [uv](https://docs.astral.sh/uv/)** — for the web app
- **[`gh` CLI](https://cli.github.com/)** — authenticated (`gh auth login`) for Quick Wins features
- **Git** — version control
- **[Anthropic API key](https://console.anthropic.com/settings/keys)** — required for fluency scoring

## Dev Setup

### VS Code Extension

```bash
git clone https://github.com/frederick-douglas-pearce/codefluent.git
cd codefluent/vscode-extension
npm install
npm run watch          # Continuous TypeScript compilation
```

To debug, open `vscode-extension/` in VS Code and press **F5** to launch the Extension Development Host. See [`vscode-extension/README.md`](vscode-extension/README.md) for packaging and installation.

### Web App

```bash
cd codefluent/webapp
uv sync
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Then open `http://localhost:8000`. See [`webapp/README.md`](webapp/README.md) for configuration and Windows notes.

## Running Tests

The project has **769 automated tests** across both interfaces. All must pass before merging.

### VS Code Extension (528 tests, 14 suites)

```bash
cd vscode-extension
npm test                        # Run all tests
npx jest --coverage             # Run with coverage report
npx jest test/unit/scoring      # Run a specific test file
```

| Suite | What it tests |
|-------|--------------|
| `scoring.test.ts` | `scoreSessions`, `computeAggregate`, config scoring |
| `quickwins.test.ts` | GitHub name validation, repo detection, argument safety |
| `xss.test.ts` | `escapeHtml` payloads + source-level XSS vector coverage |
| `platform.test.ts` | Cross-platform shell, escaping, npx helpers |
| `parser.test.ts` | JSONL session file parsing |
| `cache.test.ts` | Score cache read/write, invalidation |
| `dataCache.test.ts` | Session/usage data caching, stale-while-revalidate |
| `analytics.test.ts` | Session analytics, efficiency metrics, cost calculations |
| `pricing.test.ts` | Token pricing lookup, model matching, fallback rates |
| `usage.test.ts` | ccusage CLI bridge |
| `prompts.test.ts` | Prompt loader + template filler |
| `recommendations.test.ts` | Recommendation generation, behavior categorization |
| `extension.test.ts` | Activation, status bar, commands |
| `webviewProvider.test.ts` | Message handling, HTML generation, injection tests |

### Web App (241 tests, 5 suites)

```bash
cd webapp
uv run pytest tests/ -v         # Run all tests
uv run pytest tests/test_api.py # Run a specific test file
```

| Suite | What it tests |
|-------|--------------|
| `test_api.py` | Health endpoint, sessions, scores, scoring, optimizer, quickwins, usage |
| `test_helpers.py` | Path decoding, repo detection, validators, compute_aggregate |
| `test_security.py` | Rate limiting, CORS, error leakage, path traversal, security headers |
| `test_extract_prompts.py` | JSONL parsing, content extraction, session filtering |
| `test_prompts.py` | Prompt loading, template filling, registry consistency |

## Branching Strategy

- **`main`** — Always releasable. Protected by CI, requires a PR to merge.
- **`feature/<issue>-desc`** — New features (e.g., `feature/44-remaining-recommendations`)
- **`fix/<issue>-desc`** — Bug fixes (e.g., `fix/46-cache-unbounded`)

Commit to feature/fix branches freely — push often, squash or merge to main via PR. See the [CI/CD section](README.md#cicd) in the README for details on automated workflows.

## Code Conventions

### TypeScript (extension — `vscode-extension/src/`)

- **Strict mode** enabled — all types must be explicit
- **ES2020 target**, CommonJS output
- Keep files under ~300 lines; split when they grow beyond that

### JavaScript (webview — `media/app.js`, `webapp/static/app.js`)

- ES6+, no semicolons, async/await
- **No inline `onclick` handlers** — the webview uses nonce-based CSP that blocks them. Use event delegation on `document` instead.

### Python (webapp — `webapp/`)

- Python 3.12+, type hints encouraged
- Pydantic models for request/response validation
- `subprocess.run` with argument arrays (never shell strings)

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

All shell commands **must** use `execFileSync` / `subprocess.run` with argument arrays. Never use string interpolation or `exec` with shell strings:

```typescript
// Good
execFileSync('gh', ['issue', 'list', '--repo', repoName])

// Bad — never do this
execSync(`gh issue list --repo ${repoName}`)
```

### API Key Redaction

All error paths must sanitize via `sanitizeError()` (extension) or `_sanitize_error()` (webapp) to strip `sk-ant-*` tokens before exposing to users.

### Test Coverage

Security-focused test suites exist in both interfaces (`xss.test.ts`, `quickwins.test.ts`, `test_security.py`). These must stay green.

## Feature Parity

CodeFluent ships **two production interfaces**: the VS Code extension and the web app. When adding a new feature:

- **Scoring/analytics features** should be implemented in both interfaces
- **Security fixes** (XSS, injection) must be applied to both `media/app.js` and `webapp/static/app.js`
- **UI-specific features** (e.g., VS Code status bar) only need the relevant interface

## PR Checklist

Before submitting a pull request, verify:

- [ ] `npm test` passes (528+ extension tests green)
- [ ] `uv run pytest` passes (241+ webapp tests green)
- [ ] No regressions in existing functionality
- [ ] New features include test coverage
- [ ] Both interfaces updated if the change affects shared functionality
- [ ] No inline `onclick` handlers in webview HTML
- [ ] User-controlled strings use `escapeHtml()` in HTML contexts
- [ ] Shell commands use `execFileSync` / `subprocess.run` with argument arrays
- [ ] Error messages sanitized (no API keys in user-facing errors)
- [ ] Code follows existing conventions (TypeScript strict, no semicolons in JS)

## Questions?

Open an issue on [GitHub](https://github.com/frederick-douglas-pearce/codefluent/issues) if you have questions or run into problems.
