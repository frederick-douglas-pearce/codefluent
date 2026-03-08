# CLAUDE.md — CodeFluent

## Interaction Preferences
- Always explain trade-offs between approaches
- Push back if my approach seems suboptimal
- Flag assumptions you're making

## Project Overview
CodeFluent provides AI fluency analytics for Claude Code users. It parses local JSONL session files, uses `ccusage` for token/cost data, scores prompting behaviors via the Anthropic API, and provides personalized coaching.

The project ships **two production interfaces** for the same core functionality:
- **VS Code extension** (`vscode-extension/`) — sidebar panel for VS Code users
- **Web app** (`webapp/`) — FastAPI + vanilla JS for users on any editor

Both are actively maintained and held to the same production standards.

Originally built at PDX Hacks 2026. Now in **production deployment** phase — emphasis on reliability, test coverage, security, and publishing.

## Tech Stack
- **Runtime:** Node.js v22.18.0 (VS Code extension host)
- **Language:** TypeScript 5.3 (extension), Vanilla JS (webview frontend)
- **Extension API:** VS Code 1.85+ (WebviewViewProvider)
- **Charts:** Chart.js (bundled locally in `media/libs/`)
- **API:** Anthropic TypeScript SDK (`@anthropic-ai/sdk`)
- **Usage data:** `ccusage` (called via `npx`, reads Claude Code sessions)
- **GitHub:** `gh` CLI tool (already installed and authenticated)
- **Testing:** Jest 30 + ts-jest
- **Data:** Local JSONL files from `~/.claude/projects/`
- **Web app backend:** Python 3.12.3 / FastAPI / `uv`

## Project Structure
```
codefluent/
├── CLAUDE.md                  # This file
├── README.md                  # Project readme
├── docs/
│   ├── PROJECT_PLAN.md        # Master plan (read for context)
│   ├── TECHNICAL_SPEC.md      # Detailed implementation spec
│   ├── UI_SPEC.md             # Frontend design spec
│   ├── REFERENCES.md          # Research papers and docs links
│   ├── SESSION_DATA.md        # Session data format, availability, scope
│   └── DEMO_SCRIPT.md         # 3-minute demo script
├── vscode-extension/          # VS Code extension (PRIMARY)
│   ├── package.json           # Extension manifest + dependencies
│   ├── tsconfig.json          # TypeScript config
│   ├── jest.config.js         # Test config
│   ├── .vscodeignore          # VSIX packaging exclusions
│   ├── src/
│   │   ├── extension.ts       # Activation, status bar, commands
│   │   ├── webviewProvider.ts # WebviewViewProvider, IPC, terminal launch
│   │   ├── parser.ts          # JSONL session parsing (~/.claude/projects/)
│   │   ├── scoring.ts         # Fluency scoring via Anthropic API
│   │   ├── usage.ts           # ccusage CLI bridge
│   │   ├── quickwins.ts       # GitHub repo scoping + task suggestions
│   │   ├── prompts.ts         # Prompt loader + template filler (shared/prompts/)
│   │   ├── cache.ts           # Persistent score caching (globalStorageUri)
│   │   ├── dataCache.ts       # Session/usage data caching (stale-while-revalidate)
│   │   └── platform.ts        # Cross-platform shell, terminal, subprocess helpers
│   ├── media/
│   │   ├── index.html         # Webview HTML template (nonce-based CSP)
│   │   ├── app.js             # Frontend logic, charts, IPC
│   │   ├── style.css          # VS Code theme-aware CSS
│   │   ├── icon.svg           # Activity bar icon (amber brackets)
│   │   └── libs/chart.min.js  # Chart.js (bundled, no CDN)
│   ├── test/
│   │   ├── unit/{scoring,quickwins,xss,platform,prompts,cache,dataCache,parser,recommendations,usage}.test.ts
│   │   └── integration/{extension,webviewProvider}.test.ts
│   └── out/                   # Compiled JS (gitignored)
├── webapp/                    # FastAPI web app
│   ├── main.py                # FastAPI backend (scoring, optimizer, quickwins, usage)
│   ├── extract_prompts.py     # Python JSONL prompt extractor
│   ├── static/
│   │   ├── index.html         # Web frontend HTML
│   │   ├── app.js             # Frontend logic, charts, project scoping
│   │   └── style.css          # Styles (Inter font, amber accent)
│   ├── pyproject.toml         # Python dependencies
│   └── uv.lock
├── shared/
│   ├── benchmarks.json        # Benchmark data
│   └── prompts/               # Versioned prompt templates
│       ├── registry.json          # Active version pointers
│       ├── scoring/v1.0.md        # Session scoring prompt
│       ├── config/v1.0.md         # CLAUDE.md scoring prompt
│       ├── optimizer/v1.1.md      # Prompt optimizer prompt (config-aware)
│       └── single_scoring/v1.0.md # Single-prompt verification scorer
├── .github/workflows/         # CI/CD
│   ├── ci.yml                 # Tests + lint on PR
│   ├── claude-review.yml      # AI code review (needs-review label)
│   ├── security-review.yml    # Security-focused review
│   └── release.yml            # Release workflow
├── data/                      # Generated data (gitignored)
└── images/                    # Demo screenshots
```

## Key Commands
```bash
# --- VS Code Extension (primary) ---

# Setup
cd vscode-extension
npm install

# Compile
npm run compile            # One-shot TypeScript compilation
npm run watch              # Continuous compilation

# Test
npm test                   # Jest (unit + integration, 466 tests)

# Package and install
npx @vscode/vsce package --allow-missing-repository
code --install-extension codefluent-0.2.0.vsix

# Debug: press F5 in VS Code with vscode-extension/ open

# --- Web App ---

cd webapp
uv sync
npx ccusage@latest daily --json > ../data/ccusage/daily.json
uv run python extract_prompts.py
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Extension Architecture

### Activation
- **Trigger:** `onView:codefluent.dashboard` (when sidebar is opened)
- **Activity bar:** Custom view container with `media/icon.svg`
- **View:** `codefluent.dashboard` (webview type)
- **Command:** `codefluent.openPanel` focuses the sidebar
- **Status bar:** Right-aligned item showing `$(pulse) <score>`, updates after scoring

### Webview Communication (IPC)
The webview (browser context) communicates with the extension host (Node context) via `postMessage`:
- **Request pattern:** Webview sends `{ type, requestId, payload }`, extension replies `{ type, requestId, data }` or `{ type, requestId, error }`
- **Fire-and-forget:** `copyToClipboard` and `runInTerminal` have no requestId

### Message Types
| Type | Direction | Handler |
|------|-----------|---------|
| `getUsage` | webview -> ext | Calls `ccusage` CLI, returns daily/monthly/session data |
| `getSessions` | webview -> ext | Parses `~/.claude/projects/` JSONL files |
| `runScoring` | webview -> ext | Scores session prompts + workspace CLAUDE.md via Anthropic API, caches results |
| `getCachedScores` | webview -> ext | Returns cached scores + aggregate (includes config behaviors) |
| `getQuickwins` | webview -> ext | GitHub repo context + Claude suggestions |
| `optimizePrompt` | webview -> ext | Scores input prompt, generates optimized version, scores output (2 API calls) |
| `copyToClipboard` | webview -> ext | Copies text via `vscode.env.clipboard` |
| `runInTerminal` | webview -> ext | Opens terminal, runs `claude "<prompt>"` |

### API Key Resolution Order
1. `ANTHROPIC_API_KEY` environment variable
2. `.env` file in workspace folder(s)
3. VS Code SecretStorage (`codefluent.anthropicApiKey`)
4. Interactive input box (result stored in SecretStorage)

### CSP Constraints
The webview uses nonce-based CSP (`script-src 'nonce-{{nonce}}'`). This means:
- **No inline `onclick` handlers** — use event delegation on `document` instead
- All scripts must have the `nonce` attribute
- Styles allow `'unsafe-inline'` (VS Code convention)

### Quick Wins Repo Scoping
`quickwins.ts` detects the current workspace's GitHub repo via `git remote get-url origin` and scopes both repo context and issue fetching to that repo. Falls back to listing all user repos if no workspace or git remote is found.

### Webapp Project Scoping
The webapp uses a project dropdown (populated from session data) to scope features to a specific project:
- **Quick Wins:** Sends `project_path_encoded` to `/api/quickwins?project=...`, backend detects GitHub repo via `git remote get-url origin` in the decoded project directory
- **Prompt Optimizer:** Sends `project_path_encoded` so the backend can find and score the project's `CLAUDE.md`
- **Settings bar visibility per tab:** Data path shown only on Fluency Score; project dropdown on Fluency Score, Prompt Optimizer, and Quick Wins; neither on Recommendations or Usage
- Frontend resolves `project_path_encoded` from session data via `getSelectedProjectEncoded()` (short name → encoded path lookup)

### Terminal Launch
"Run" buttons create terminals with `shellPath: '/bin/bash'` and `shellArgs: ['--norc', '--noprofile']` to bypass shell init scripts (venv activation, etc.), while preserving `PATH` from the extension host process.

## Code Style & Conventions
- TypeScript: Strict mode, type hints, ES2020 target, CommonJS output
- JavaScript (webview): ES6+, no semicolons, async/await
- CSS: CSS custom properties mapped to VS Code theme tokens (`--vscode-editor-background`, etc.)
- Keep files small: if a file exceeds 300 lines, consider splitting
- Use descriptive variable names over comments
- Error handling: wrap API calls in try/catch, show user-friendly errors in webview

## Branching & PR Workflow
- **`main`** — Always releasable. Protected by CI (tests must pass) and requires a PR to merge.
- **Feature branches** — `feature/<issue-number>-short-description` (e.g., `feature/44-remaining-recommendations`)
- **Bug fix branches** — `fix/<issue-number>-short-description` (e.g., `fix/46-cache-unbounded`)
- **PR required to merge to main** — CI runs automatically on the PR. All tests must pass before merge.
- **Commit to feature/fix branches freely** — push often, squash or merge to main via PR.

### CI Workflows
- **`ci.yml`** — Runs on every PR: `npm test` (466 tests) in `vscode-extension/`, `pytest` (193 tests) in `webapp/`
- **`security-review.yml`** — Runs on every PR: grep-based checks for security anti-patterns (inline onclick, string interpolation in shell commands, missing escapeHtml)
- **`claude-review.yml`** — AI code review via `claude-code-action@v1`. Triggered by `needs-review` label on PR (not on every push, to control API costs). Also responds to `@claude` mentions in PR comments.
- **`release.yml`** — Release workflow for publishing

## Production Standards
- **All new features must have tests.** No merging without test coverage for the change.
- **Security:** All user-controlled strings rendered in HTML must pass through `escapeHtml()`. All shell commands must use `execFileSync` with argument arrays, never string interpolation. Error messages must pass through `_sanitize_error()` / `sanitizeError()` to redact API keys. XSS and injection tests exist and must stay green.
- **No regressions:** `npm test` must pass (currently 466 tests) before any commit to main.
- **Feature parity:** Both the VS Code extension and the webapp are production deliverables. New scoring/analytics features should be implemented in both. Security fixes (XSS, injection) apply to both `media/app.js` and `webapp/static/app.js`.
- **E2E testing:** Every PR test plan must include manual Playwright MCP smoke testing of the webapp before merging. See the E2E Smoke Test Checklist below.

## JSONL Data Format (VERIFIED against real data)

Claude Code stores sessions at: `~/.claude/projects/`

Directory structure:
```
~/.claude/projects/
├── -home-fdpearce-Documents-project-name/
│   ├── session-uuid-1.jsonl
│   ├── session-uuid-2.jsonl
│   └── ...
└── -home-fdpearce-Documents-other-project/
    └── ...
```

### Verified Message Types (from real data)
Each JSONL file has one JSON object per line. These are the types we care about:

**`type: "user"` — User prompts (EXTRACT THESE)**
```json
{
  "type": "user",
  "sessionId": "uuid",
  "version": "2.1.44",
  "gitBranch": "main",
  "cwd": "/path/to/project",
  "message": {
    "role": "user",
    "content": "plain string"
  },
  "uuid": "msg-uuid",
  "timestamp": "2026-02-27T01:10:20.969Z",
  "planContent": "optional — present when Plan Mode was used"
}
```
**NOTE:** `message.content` can be either:
- A plain string: `"content": "Implement the following plan..."`
- An array of blocks: `"content": [{"type": "text", "text": "..."}]`
The parser MUST handle both.

**`type: "assistant"` — Claude responses (token usage here)**
```json
{
  "type": "assistant",
  "message": {
    "model": "claude-opus-4-6",
    "role": "assistant",
    "content": [{"type": "text", "text": "..."}, {"type": "tool_use", ...}],
    "usage": {
      "input_tokens": 3,
      "output_tokens": 2,
      "cache_creation_input_tokens": 14450,
      "cache_read_input_tokens": 19155
    }
  },
  "timestamp": "2026-02-27T01:10:24.420Z"
}
```

**Types to SKIP:**
- `file-history-snapshot` — metadata
- `tool_use` — top-level tool invocations (count for stats but don't extract content)
- `tool_result` — tool output
- `progress`, `hook_progress`, `bash_progress` — streaming events
- `thinking` — extended thinking (count as a signal but skip content)
- `system` — system messages
- `create` — file creation events

### Signals to Detect for Fluency Scoring
- `planContent` field on user messages -> Plan Mode usage (positive fluency signal)
- `type: "thinking"` lines -> Extended thinking usage
- `type: "tool_use"` -> Tool diversity (count unique tool names)
- Content of user prompts -> Behavioral analysis

## Anthropic API Usage
- Model for scoring: `claude-sonnet-4-20250514` (fast, cheap, good for classification)
- API key via: env var > `.env` > VS Code secrets > prompt
- Keep prompts concise — send only user prompt text (up to 20 per session, max 2000 chars each)
- Cache scoring results in `globalStorageUri/scores.json` to avoid re-scoring

## CLAUDE.md Config Scoring
The extension scores the workspace's `CLAUDE.md` file separately against the same 11 fluency behaviors. This gives users credit for behaviors defined as project conventions.

### How it works
1. `scoreWorkspaceClaudeMd()` reads `CLAUDE.md` from the workspace root (called by Fluency Score tab and Prompt Optimizer)
2. Content is truncated to 4000 chars and sent to Claude Sonnet with `CONFIG_SCORING_PROMPT`
3. Returns `{ fluency_behaviors: Record<string, boolean>, one_line_summary: string }`
4. Results cached in `globalStorageUri/config_scores.json` keyed by workspace path + content hash
5. `computeAggregate()` merges via `effective_behavior = session_behavior OR config_behavior`
6. Frontend shows an amber "CLAUDE.md" tag next to config-boosted behaviors
7. Prompt Optimizer also scores CLAUDE.md on demand if not cached, passes config behavior flags (~50 tokens) to avoid adding redundant behaviors

### Cache invalidation
- Content hash = first 100 chars + length (`ScoreCache.contentHash()`)
- Re-scores only when CLAUDE.md content changes or `force_rescore` is set
- Projects without CLAUDE.md work unchanged

### Webapp equivalent
- `score_claude_md()` in `webapp/main.py` — same logic
- Decodes project path from `project_path_encoded` field in session data
- Config cache at `data/config_scores.json`

## Prompt Versioning

Scoring prompts are extracted into standalone files under `shared/prompts/` with a version registry. Both the VS Code extension and webapp load prompts from these shared files.

### File structure
```
shared/prompts/
├── registry.json              # Points to active prompt file for each type
├── scoring/v1.0.md            # Session scoring prompt template
├── config/v1.0.md             # CLAUDE.md scoring prompt template
├── optimizer/v1.1.md          # Prompt optimizer template (config-aware)
└── single_scoring/v1.0.md     # Single-prompt verification scorer
```

### Registry format (`registry.json`)
```json
{
  "scoring": { "version": "scoring-v1.0", "file": "scoring/v1.0.md" },
  "config": { "version": "config-v1.0", "file": "config/v1.0.md" },
  "optimizer": { "version": "optimizer-v1.1", "file": "optimizer/v1.1.md" },
  "single_scoring": { "version": "single_scoring-v1.0", "file": "single_scoring/v1.0.md" }
}
```

### How to bump a version
1. Create a new file (e.g., `scoring/v1.1.md`) with the updated prompt
2. Update `registry.json` to point to the new file and version string
3. Keep the old file — it serves as history and allows rollback

### Template syntax
Prompts use `{{PLACEHOLDER}}` for template variables (simple string replacement, not `.format()`). This avoids conflicts with literal JSON braces in the prompt text.

- **Scoring prompt placeholders:** `{{USED_PLAN_MODE}}`, `{{THINKING_COUNT}}`, `{{TOOLS_USED}}`, `{{PROMPTS}}`
- **Config prompt placeholder:** `{{CONTENT}}`
- **Optimizer prompt placeholders:** `{{PROMPT}}`, `{{MAX_LENGTH}}`, `{{CONFIG_BEHAVIORS}}`
- **Single scoring prompt placeholder:** `{{PROMPT}}`

### Cache invalidation
Cached scores are stamped with `prompt_version`. On cache read, entries whose `prompt_version` doesn't match the current registry version are treated as stale and re-scored. This applies to session scores (`scores.json`), config scores (`config_scores.json`), and optimizer results (`optimizer_cache.json`).

### Build integration
The compile script copies `shared/prompts/` into `vscode-extension/shared/prompts/` so the extension can load them at runtime via `prompts.ts`.

## Design System
CSS custom properties map to VS Code theme tokens for automatic light/dark support:
- `--bg-primary` -> `--vscode-editor-background`
- `--bg-card` -> `--vscode-editorWidget-background`
- `--text-primary` -> `--vscode-editor-foreground`
- `--text-secondary` -> `--vscode-descriptionForeground`
- `--border` -> `--vscode-widget-border`

Fixed brand colors (semantic meaning, don't change with theme):
- **Accent:** `#D97706` (warm amber)
- **Success:** `#059669` (emerald green)
- **Warning:** `#D97706` (amber)
- **Danger:** `#DC2626` (red)
- **Font:** VS Code's font (`--vscode-font-family`) with Inter fallback
- **Border radius:** 12px cards, 8px buttons
- **Spacing:** 8px base unit

## Critical Constraints
1. **No inline onclick in webview HTML** — CSP blocks them. Use event delegation.
2. **No npm for webview frontend** — Chart.js is bundled locally in `media/libs/`
3. **No database** — All data is JSON files or VS Code storage
4. **No authentication** — Runs locally, no login
5. **node_modules must be in VSIX** — `.vscodeignore` must NOT exclude `node_modules/` (the Anthropic SDK is a runtime dependency)
6. **`onView:` activation event required** — Without it in `package.json`, the extension won't activate when the sidebar opens

## When Stuck
- If extension doesn't activate, check `activationEvents` in `package.json` includes `onView:codefluent.dashboard`
- If buttons don't work in webview, check for inline `onclick` handlers (CSP blocks them)
- If VSIX is too small (<500KB), check `.vscodeignore` isn't excluding `node_modules/`
- If API key isn't found, check workspace folder has `.env` or set the env var
- If ccusage output is unexpected, use `--debug` flag
- If Quick Wins shows all repos, check that the workspace folder has a git remote
- If terminal launch gets interrupted by shell init, terminal uses `--norc --noprofile`

## Testing
```bash
cd vscode-extension
npm test                   # Runs all 466 Jest tests (12 suites)

# Test structure:
# test/unit/prompts.test.ts                    — prompt loader + template filler (all prompt types)
# test/unit/scoring.test.ts                    — scoreSessions, computeAggregate, optimizePrompt, scoreSinglePrompt, prompt versioning
# test/unit/quickwins.test.ts                  — GitHub name validation, repo detection, arg safety
# test/unit/xss.test.ts                        — escapeHtml payloads + source-level XSS vector coverage
# test/unit/platform.test.ts                   — cross-platform shell, escaping, npx helpers
# test/unit/cache.test.ts                      — score cache persistence, content hashing, invalidation
# test/unit/dataCache.test.ts                  — session/usage data caching, stale-while-revalidate
# test/unit/parser.test.ts                     — JSONL parsing, content extraction, subagent filtering
# test/unit/recommendations.test.ts            — recommendation generation, behavior categorization
# test/unit/usage.test.ts                      — ccusage CLI bridge, data formatting
# test/integration/extension.test.ts           — activation, status bar, commands
# test/integration/webviewProvider.test.ts      — message handling, HTML generation, injection tests, optimizer IPC
# test/__mocks__/vscode.ts                     — VS Code API mock for Jest

cd ../webapp
uv run pytest tests/ -v    # Runs all webapp tests (193 tests, 5 suites)

# Test structure:
# tests/test_api.py              — health endpoint, sessions, scores, scoring, optimizer, quickwins, usage
# tests/test_helpers.py          — _decode_project_path, _detect_project_repo, validators, compute_aggregate, classify_error
# tests/test_security.py         — rate limiting, CORS, error leakage, path traversal, security headers, XSS source-level verification
# tests/test_extract_prompts.py  — JSONL parsing, content extraction, session filtering, metadata
# tests/test_prompts.py          — prompt loading, template filling, registry consistency
# tests/conftest.py              — shared fixtures (TestClient, mock Anthropic, mock sessions)
```

### E2E Smoke Test Checklist (Playwright MCP)

Run before merging PRs that touch webapp UI or API. Start the server with `uv run uvicorn main:app --port 8001`, then verify:

1. **Tab navigation** — all 5 tabs switch correctly, correct panel is visible
2. **Settings bar visibility** — data path input shows only on Fluency Score; project dropdown shows on Fluency Score, Optimizer, Quick Wins; settings bar hidden on Recommendations, Usage
3. **Project dropdown** — populates from session data when data path is set
4. **Fluency scoring** — Run Scoring button triggers analysis, results display with score ring and behavior bars
5. **Prompt Optimizer** — paste prompt, click Optimize, input/output scores and optimized prompt appear
6. **Quick Wins** — Generate button works; project-scoped mode uses selected project
7. **Usage tab** — data renders with pace cards and chart (if ccusage data exists)
8. **Health endpoint** — `GET /health` returns status, version, and dependency checks
