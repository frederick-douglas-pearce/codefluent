# CLAUDE.md — CodeFluent

## Interaction Preferences
- Always explain trade-offs between approaches
- Push back if my approach seems suboptimal
- Flag assumptions you're making

## Project Overview
CodeFluent is a VS Code extension that provides AI fluency analytics for Claude Code users. It parses local JSONL session files, uses `ccusage` for token/cost data, scores prompting behaviors via the Anthropic API, and provides personalized coaching — all from a sidebar panel in VS Code.

The project also contains the original FastAPI web app (`main.py`, `extract_prompts.py`, `static/`) for reference, but the VS Code extension under `vscode-extension/` is the primary product.

Built at **PDX Hacks 2026**.

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
- **Original backend:** Python 3.12.3 / FastAPI / `uv` (reference only)

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
│   │   └── cache.ts           # Persistent score caching (globalStorageUri)
│   ├── media/
│   │   ├── index.html         # Webview HTML template (nonce-based CSP)
│   │   ├── app.js             # Frontend logic, charts, IPC
│   │   ├── style.css          # VS Code theme-aware CSS
│   │   ├── icon.svg           # Activity bar icon (amber brackets)
│   │   └── libs/chart.min.js  # Chart.js (bundled, no CDN)
│   ├── test/
│   │   ├── unit/scoring.test.ts
│   │   └── integration/{extension,webviewProvider}.test.ts
│   └── out/                   # Compiled JS (gitignored)
├── webapp/                    # Original FastAPI web app (reference)
│   ├── main.py                # FastAPI backend
│   ├── extract_prompts.py     # Python JSONL prompt extractor
│   ├── static/                # Web frontend (HTML/CSS/JS)
│   ├── pyproject.toml         # Python dependencies
│   └── uv.lock
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
npm test                   # Jest (unit + integration, 64 tests)

# Package and install
npx @vscode/vsce package --allow-missing-repository
code --install-extension codefluent-0.1.0.vsix

# Debug: press F5 in VS Code with vscode-extension/ open

# --- Original Web App (reference, in webapp/) ---

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

### Terminal Launch
"Run" buttons create terminals with `shellPath: '/bin/bash'` and `shellArgs: ['--norc', '--noprofile']` to bypass shell init scripts (venv activation, etc.), while preserving `PATH` from the extension host process.

## Code Style & Conventions
- TypeScript: Strict mode, type hints, ES2020 target, CommonJS output
- JavaScript (webview): ES6+, no semicolons, async/await
- CSS: CSS custom properties mapped to VS Code theme tokens (`--vscode-editor-background`, etc.)
- Keep files small: if a file exceeds 300 lines, consider splitting
- Use descriptive variable names over comments
- Error handling: wrap API calls in try/catch, show user-friendly errors in webview

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
1. After session scoring, `handleRunScoring()` reads `CLAUDE.md` from the workspace root
2. Content is truncated to 4000 chars and sent to Claude Sonnet with `CONFIG_SCORING_PROMPT`
3. Returns `{ fluency_behaviors: Record<string, boolean>, one_line_summary: string }`
4. Results cached in `globalStorageUri/config_scores.json` keyed by workspace path + content hash
5. `computeAggregate()` merges via `effective_behavior = session_behavior OR config_behavior`
6. Frontend shows an amber "CLAUDE.md" tag next to config-boosted behaviors

### Cache invalidation
- Content hash = first 100 chars + length (`ScoreCache.contentHash()`)
- Re-scores only when CLAUDE.md content changes or `force_rescore` is set
- Projects without CLAUDE.md work unchanged

### Webapp equivalent
- `score_claude_md()` in `webapp/main.py` — same logic
- Decodes project path from `project_path_encoded` field in session data
- Config cache at `data/config_scores.json`

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
npm test                   # Runs all 64 Jest tests

# Test structure:
# test/unit/scoring.test.ts                    — scoreSessions + computeAggregate
# test/integration/extension.test.ts           — activation, status bar, commands
# test/integration/webviewProvider.test.ts      — message handling, HTML generation
# src/__mocks__/vscode.ts                      — VS Code API mock for Jest
```
