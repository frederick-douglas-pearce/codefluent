# CLAUDE.md — CodeFluent

## Interaction Preferences
- Always explain trade-offs between approaches
- Push back if my approach seems suboptimal
- Flag assumptions you're making

## Project Overview
CodeFluent provides AI fluency analytics for Claude Code users. It parses local JSONL session files for token/cost analytics, scores prompting behaviors via the Anthropic API, and provides personalized coaching.

The project ships **two production interfaces** for the same core functionality:
- **VS Code extension** (`vscode-extension/`) — sidebar panel for VS Code users
- **Web app** (`webapp/`) — FastAPI + vanilla JS for users on any editor

Both are actively maintained and held to the same production standards.

Originally built at PDX Hacks 2026. Now in **production deployment** phase — emphasis on reliability, test coverage, security, and publishing.

## Tech Stack
- **Runtime:** Node.js v22.18.0 (VS Code extension host)
- **Language:** TypeScript 5.3 (extension), Vanilla JS (webview frontend)
- **Extension API:** VS Code 1.110+ (WebviewViewProvider)
- **Charts:** Chart.js (bundled locally in `media/libs/`)
- **API:** Anthropic TypeScript SDK (`@anthropic-ai/sdk`)
- **Usage data:** aggregated directly from local JSONL sessions (`~/.claude/projects/`); see `shared/pricing.json` for cost rates
- **GitHub:** `gh` CLI tool (already installed and authenticated)
- **Testing:** Jest 30 + ts-jest
- **Data:** Local JSONL files from `~/.claude/projects/`
- **Web app backend:** Python 3.12.3 / FastAPI / `uv`

## Project Structure
```
codefluent/
├── docs/                      # PROJECT_PLAN, TECHNICAL_SPEC, UI_SPEC, SESSION_DATA, RELEASE_ROADMAP, *_RESEARCH
├── vscode-extension/          # VS Code extension (PRIMARY) — src/, media/, test/{unit,integration}/, out/ (gitignored)
├── webapp/                    # FastAPI web app — main.py, conversations.py, static/, tests/, pyproject.toml
├── shared/                    # Cross-interface assets
│   ├── defaults.json          # Single source of truth for config
│   ├── pricing.json           # Token pricing by model
│   ├── prompts/               # Versioned prompt templates (registry.json + scoring/, config/, optimizer/, …)
│   └── eval/                  # Scoring regression framework (run_eval.py, golden_set.json, results/)
├── .claude/specs/             # PM agent output (PRDs, decision logs)
├── .github/workflows/         # ci.yml, eval.yml, claude-review.yml, security-review.yml, release.yml, release-please.yml
├── data/                      # Generated data (gitignored)
└── images/                    # Demo screenshots
```

File roles are self-documenting from filenames. For module-level detail, list the directory directly; for design intent, see `docs/TECHNICAL_SPEC.md`.

## Documentation Map

When adding features or changing architecture, check this list for files that may need updating.

| File | Purpose | Update when... |
|------|---------|----------------|
| `CLAUDE.md` | AI coding instructions, architecture, conventions, commands | Adding files, commands, test suites, or CI workflows |
| `README.md` | Public-facing project overview, features, setup, eval framework | Adding user-visible features, changing test counts, updating setup steps |
| `SECURITY.md` | Vulnerability reporting + full secrets-handling policy (hooks, audit, forward-compat rule) | Changing hook behavior, adding display surfaces that quote session content, or changing the key-rotation guidance |
| `vscode-extension/README.md` | Extension setup, features, screenshots, marketplace listing | Changing extension features, installation steps, or screenshots |
| `webapp/README.md` | Webapp setup, design choices, security, testing | Changing webapp features, test counts, security controls, or API surface |
| `shared/eval/README.md` | Golden set structure, eval runner CLI, checks, CI integration | Changing eval checks, CLI options, test counts, or CI workflow |
| `CONTRIBUTING.md` | Dev setup, code conventions, PR checklist, security rules | Changing dev workflow, conventions, or review requirements |
| `docs/PROJECT_PLAN.md` | Master plan and milestones | Completing milestones or changing project direction |
| `docs/TECHNICAL_SPEC.md` | Implementation spec (scoring, analytics, caching) | Changing scoring logic, API surface, or data flow |
| `docs/UI_SPEC.md` | Frontend design spec (both interfaces) | Changing UI layout, components, or interaction patterns |
| `docs/SESSION_DATA.md` | JSONL data format, availability, scope | Changing parser behavior or supported data formats |
| `docs/REFERENCES.md` | Research papers and external docs links | Adding new research foundations or external references |
| `docs/DEMO_SCRIPT.md` | 3-minute demo walkthrough | Changing demo flow or feature highlights |
| `docs/RELEASE_ROADMAP.md` | Epic definitions, release mapping, issue tracker | Completing epics, changing priorities, adding/closing issues |
| `docs/AGENT_ANALYTICS_RESEARCH.md` | Agent SDK monitoring opportunity, market landscape | Adding agent-related research or competitive analysis |
| `.claude/specs/` | PM agent output (PRDs, decision logs) | PM agent creates specs here; reference from epic issues |
| Memory files (`~/.claude/projects/.../memory/`) | Test counts, lessons learned, project phase | Changing test counts, learning new project conventions |

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
npm test                   # Jest (unit + integration, 1017 tests)

# Package and install
npx @vscode/vsce package --allow-missing-repository
code --install-extension codefluent-1.2.1.vsix    # x-release-please-version

# Debug: press F5 in VS Code with vscode-extension/ open

# --- Web App ---

cd webapp
uv sync
uv run python extract_prompts.py
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000

# --- Eval Runner ---

cd webapp
uv run python ../shared/eval/run_eval.py --dry-run           # Preview (no API calls)
uv run python ../shared/eval/run_eval.py                      # Schema + agreement checks
uv run python ../shared/eval/run_eval.py --check consistency  # Self-consistency check
uv run python ../shared/eval/run_eval.py --verbose            # Verbose output
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
| `getUsage` | webview -> ext | Aggregates daily/monthly token totals from the conversations cache (project-scoped) |
| `getConversations` | webview -> ext | Parses `~/.claude/projects/` JSONL files, assembles conversations via gap-based splitting |
| `getSessions` | webview -> ext | Deprecated alias for `getConversations` (kept for backward compatibility) |
| `runScoring` | webview -> ext | Scores conversation prompts + workspace CLAUDE.md via Anthropic API, caches results |
| `getCachedScores` | webview -> ext | Returns cached scores + aggregate (includes config behaviors) |
| `getQuickwins` | webview -> ext | GitHub repo context + Claude suggestions |
| `optimizePrompt` | webview -> ext | Scores input prompt, generates optimized version, scores output (2 API calls) |
| `getConversationAnalytics` | webview -> ext | Returns per-conversation token metrics (efficiency, cost, cache ratios) |
| `getSessionAnalytics` | webview -> ext | Deprecated alias for `getConversationAnalytics` (kept for backward compatibility) |
| `getConfig` | webview -> ext | Returns display config values from `shared/defaults.json` + VS Code settings |
| `getConfigMaturity` | webview -> ext | Scans `.claude/` directory for configuration maturity assessment |
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
- **Settings bar visibility per tab:** Data path shown only on Fluency Score; project dropdown on Fluency Score, Prompt Optimizer, Quick Wins, Usage, and Conversations; settings bar hidden on Recommendations
- Frontend resolves `project_path_encoded` from session data via `getSelectedProjectEncoded()` (short name → encoded path lookup)

### Webapp API Endpoints (Conversation Redesign)
- `GET /api/conversations` — Primary endpoint, returns conversations assembled via gap-based splitting
- `GET /api/sessions` — Deprecated alias for `/api/conversations`
- `GET /api/conversation-analytics` — Primary endpoint, returns per-conversation token metrics
- `GET /api/session-analytics` — Deprecated alias for `/api/conversation-analytics`
- `GET /api/config-maturity` — Scans `.claude/` directory for configuration maturity assessment

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
- **`main`** — Always releasable. All changes require a PR with passing CI before merge.
- **Feature branches** — `feature/<issue-number>-short-description` (e.g., `feature/44-remaining-recommendations`)
- **Bug fix branches** — `fix/<issue-number>-short-description` (e.g., `fix/46-cache-unbounded`)
- **Commit to feature/fix branches freely** — push often, squash or merge to main via PR.

### Commit Messages (Conventional Commits)
This project uses [Conventional Commits](https://www.conventionalcommits.org/) for automated changelog generation via [Release Please](https://github.com/googleapis/release-please).

**Required prefixes:**
- `feat:` — new feature (triggers minor version bump)
- `fix:` — bug fix (triggers patch version bump)
- `docs:` — documentation only
- `test:` — adding or updating tests
- `chore:` — maintenance, dependencies, CI
- `refactor:` — code change that neither fixes a bug nor adds a feature

**Breaking changes:** Add `!` after the type (e.g., `feat!: remove legacy API`) or include `BREAKING CHANGE:` in the commit body. Triggers a major version bump.

**Examples:**
```
feat: add conversation token analytics to Usage tab (#89)
fix: sparkline score history not scoped to current project
docs: update TECHNICAL_SPEC for v0.3.0 changes
chore: bump @anthropic-ai/sdk to 0.52.0
```

### Release Workflow
1. Merge PRs with conventional commit messages to `main`
2. Release Please auto-creates/updates a release PR with changelog + version bumps
3. When ready to release, merge the release PR
4. Release Please creates the git tag → triggers `release.yml` → builds VSIX → publishes to Marketplace

### CI Workflows
- **`ci.yml`** — Runs on every PR: `npm test` (1017 tests) + `vsce package` (catches `engines.vscode` / `@types/vscode` mismatches and `.vscodeignore` misconfig pre-merge) in `vscode-extension/`, `uv lock --check` + `pytest` (859 tests) in `webapp/` — `uv lock --check` fails the PR if `webapp/uv.lock` has drifted from `pyproject.toml`
- **`eval.yml`** — Runs on PRs touching `shared/prompts/**`, `shared/defaults.json`, or `shared/eval/scorer.py`: scores golden set (79 CI entries / 84 total) via Anthropic API, validates schema + agreement (~$0.30/run). Skipped for Dependabot.
- **`security-review.yml`** — Claude-powered security review via `anthropics/claude-code-security-review`. Triggered by `needs-security-review` label on PR (not on every push, to control API costs). Skipped on docs-only PRs and Dependabot. Scans webview (`media/app.js`), webapp (`webapp/`), and project Claude config (`.claude/hooks/`, `.claude/settings.json`, `.claude/agents/`).
- **`claude-review.yml`** — AI code review via `claude-code-action@v1`. Triggered by `needs-review` label on PR (not on every push, to control API costs). Also responds to `@claude` mentions in PR comments.
- **`release-please.yml`** — Auto-creates release PRs with changelog + version bumps from conventional commits. Auto-syncs `webapp/uv.lock` onto the release PR branch when one exists (Release Please's generic updater bumps `pyproject.toml` but not the lockfile). When a release is created, chains into a `build-release` job that builds VSIX, publishes to Marketplace, uploads to GitHub Release, and marks the release as non-draft.
- **`release.yml`** — Manual fallback (`workflow_dispatch` only) for retrying failed releases or manual tag releases. Not triggered automatically.

## Product Development Workflow

This project uses a PM subagent (`~/.claude/agents/pm.md`) for feature specification and backlog management. The PM agent reads project context, creates GitHub issues (epics and stories), and writes longer-form specs to `.claude/specs/`. It has no access to Bash, Edit, or code — only Read, Write (scoped to `.claude/specs/` via hook), and GitHub MCP tools (issues + labels only).

### When to invoke the PM agent

Delegate to the pm subagent when the human's request involves:
- A new feature or capability that needs scoping before implementation
- A pain point or problem statement that needs translation into stories
- Scope or priority questions ("should we do A or B first?")
- Ambiguous requirements where assumptions would be required to proceed

Do NOT invoke the PM agent for:
- Bug fixes with clear reproduction steps
- Refactoring with no behavior change
- Purely technical decisions (dependency updates, tooling, CI)
- Requests that reference an existing GitHub issue with clear acceptance criteria

### Spec and issue conventions

- **PRDs:** `.claude/specs/prd-<feature-slug>.md`
- **Decision log:** `.claude/specs/decisions.md` (append-only)
- **Epics:** GitHub issues with `epic:` label prefix
- **Stories:** GitHub issues tagged with parent epic label

### When to invoke the Architect agent

Delegate to the architect subagent (`~/.claude/agents/architect.md`) for design review **before implementation begins**. The architect agent is read-only — it reviews plans, not code. It posts its findings as comments on the relevant GitHub issue so they persist across sessions.

Invoke the architect agent when:
- You're about to start a non-trivial feature (new module, schema change, prompt rewrite)
- The implementation plan touches caching, state management, or cross-module interfaces
- The feature needs to work across both interfaces (VS Code extension + webapp)
- The roadmap shows upcoming features that could be affected by design decisions

Do NOT invoke the architect agent for:
- Simple bug fixes with clear solutions
- Documentation-only changes
- Dependency updates or CI changes
- Post-implementation code review (use `/simplify` or `/review` instead)

### Working from specs

When implementing from a PM-produced spec or issue:
- Reference the story's acceptance criteria as your definition of done
- Check for architect review comments on the issue — address any blocking concerns before implementing
- Do not exceed the scope defined in the spec
- If the spec is technically infeasible or incomplete, STOP and report
  back to the human before proceeding — do not silently adapt

## Production Standards
- **All new features must have tests.** No merging without test coverage for the change.
- **Security:** All user-controlled strings rendered in HTML must pass through `escapeHtml()`. All shell commands must use `execFileSync` with argument arrays, never string interpolation. Error messages must pass through `_sanitize_error()` / `sanitizeError()` to redact API keys. XSS and injection tests exist and must stay green.
- **No regressions:** `npm test` must pass (currently 1017 tests) before any commit to main.
- **Feature parity:** Both the VS Code extension and the webapp are production deliverables. New scoring/analytics features should be implemented in both. Security fixes (XSS, injection) apply to both `media/app.js` and `webapp/static/app.js`.
- **E2E testing:** Webapp PRs must keep `webapp/tests/e2e/` green. CI runs the suite automatically on PRs touching `webapp/` or `shared/`. Manual Playwright MCP testing is reserved as a fallback for exploratory verification of new surfaces not yet automated. See the E2E Smoke Test Checklist below.

## Secrets handling

Do not read `.env`, `.envrc`, `credentials.json`, `secrets.ya?ml`, SSH private keys (`id_rsa`, `id_ed25519`, `*.pem`), shell rc files (`.bashrc`, `.bash_profile`, `.profile`, `.zshrc`, `.zshenv`, `.zprofile`), or `webapp/config.json`.

Anything read via Read, Bash (`cat`, `grep`, `source`), or Grep is persisted verbatim in the Claude Code session JSONL at `~/.claude/projects/<slug>/*.jsonl` — plaintext, forever. `.gitignore` does not protect against this.

Two hooks enforce the rule:

- **`.claude/hooks/block_secret_reads.py`** (PreToolUse) — denies Read/Edit/Write/Grep/Glob/NotebookEdit/Bash calls targeting the files above. A block message from this hook means the read was prevented *before* it executed, so nothing leaked.
- **`.claude/hooks/detect_secrets_in_output.py`** (PostToolUse) — scans Read/Grep/Bash output for known secret patterns (`sk-ant-*`, `sk-proj-*`, `ghp_*`, `github_pat_*`, `AKIA*`, `AIza*`). A block message from this hook means the tool already executed and the raw value was persisted to the JSONL transcript. Report to the user that the key is compromised and should be rotated. Do not retry the same command.

The rule generalizes beyond what the hooks catch:

- If a tool result contains credential-looking values, never echo them in replies.
- Do not emit generated code that prints env vars matching `KEY|TOKEN|SECRET|PASSWORD`.
- To verify a credential file exists, use `test -f <path>` rather than reading it.
- Any new feature that renders session content to the user (prompt excerpts, diffs, summaries) must re-apply secret-pattern redaction at the display layer — see the Production Standards security bullet above for the canonical redaction helpers.

See [`SECURITY.md`](SECURITY.md) for the full policy, layered defense model, the audit one-liner for historical leaks, and the bypass surface the hooks do not cover.

## JSONL Data Format

Sessions live at `~/.claude/projects/<encoded-project-path>/<session-uuid>.jsonl`, one JSON object per line. The verified schema, message types to skip, subagent filtering (`isSidechain`), and token deduplication rules (group by `message.id`, keep highest `output_tokens`) are documented in **`docs/SESSION_DATA.md`**. Parser implementation lives in `vscode-extension/src/parser.ts` and `webapp/extract_prompts.py`.

### Operational signals extracted for scoring
- `planContent` on `user` messages → Plan Mode usage
- `type: "thinking"` entries → extended thinking count
- `type: "tool_use"` entries → tool diversity (unique tool names)
- `message.content` (string or content-block array — handle both) → behavioral analysis

## Anthropic API Usage
- Model for scoring: `claude-sonnet-4-6` (fast, cheap, good for classification)
- API key resolution: see "API Key Resolution Order" above
- Keep prompts concise — send only user prompt text (up to 20 per conversation, max 2000 chars each)
- Cache scoring results in `globalStorageUri/scores.json` to avoid re-scoring

## CLAUDE.md Config Scoring
The extension scores the workspace's `CLAUDE.md` file against 3 eligible fluency behaviors (meta-interaction rules). Only these behaviors can genuinely be established as project-wide conventions via configuration:

- `setting_interaction_terms` — "Push back if wrong", "ask before changing"
- `identifying_missing_context` — "Flag assumptions you're making"
- `questioning_reasoning` — "Explain rationale", "compare alternatives"

The remaining 8 behaviors are task-specific and always scored `false` for config, regardless of content. A `CONFIG_ELIGIBLE_BEHAVIORS` constant in both TypeScript and Python enforces this as a code-layer guard (defense-in-depth with the prompt).

### How it works
1. `scoreWorkspaceClaudeMd()` reads `CLAUDE.md` from the workspace root (called by Fluency Score tab and Prompt Optimizer)
2. Content is truncated to 4000 chars and sent to Claude Sonnet with `CONFIG_SCORING_PROMPT` (v1.1)
3. Returns `{ fluency_behaviors: Record<string, boolean>, one_line_summary: string }`
4. Results cached in `globalStorageUri/config_scores.json` keyed by workspace path + content hash
5. `computeAggregate()` merges via `effective_behavior = conversation_behavior OR (config_eligible AND config_behavior)`
6. Frontend shows an amber "CLAUDE.md" tag next to config-boosted behaviors (only for eligible behaviors)
7. Prompt Optimizer also scores CLAUDE.md on demand if not cached, passes only eligible config behavior flags to avoid adding redundant behaviors

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
├── scoring/v2.1.md            # Conversation scoring prompt template (current)
├── config/v1.1.md             # CLAUDE.md scoring prompt (3 eligible behaviors only)
├── optimizer/v1.1.md          # Prompt optimizer template (config-aware)
├── single_scoring/v1.0.md     # Single-prompt verification scorer
└── config_advisor/v1.0.md     # Hook config generation prompt
```

### Registry format (`registry.json`)
```json
{
  "scoring": { "version": "scoring-v2.1", "file": "scoring/v2.1.md" },
  "config": { "version": "config-v1.1", "file": "config/v1.1.md" },
  "optimizer": { "version": "optimizer-v1.1", "file": "optimizer/v1.1.md" },
  "single_scoring": { "version": "single_scoring-v1.0", "file": "single_scoring/v1.0.md" },
  "config_advisor": { "version": "config_advisor-v1.0", "file": "config_advisor/v1.0.md" }
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
Cached scores are stamped with `prompt_version`. On cache read, entries whose `prompt_version` doesn't match the current registry version are treated as stale and re-scored. This applies to conversation scores (`scores.json`), config scores (`config_scores.json`), and optimizer results (`optimizer_cache.json`).

### Build integration
The compile script copies `shared/prompts/` and `shared/defaults.json` into `vscode-extension/shared/` so the extension can load them at runtime via `prompts.ts` and `config.ts`.

## Centralized Configuration

All configurable parameters live in `shared/defaults.json` (single source of truth). Both interfaces read from this file and overlay user overrides.

### Resolution order
- **VS Code extension:** VS Code settings (`codefluent.*`) > `shared/defaults.json`
- **Webapp:** Environment variables (`CODEFLUENT_SCORING_MODEL`) > `webapp/config.json` > `shared/defaults.json`

### Config key structure
Flat dotted keys: `"scoring.model"`, `"display.sparklineMaxWeeks"`, etc. Categories:
- `scoring.*` — Model, tokens, truncation, confidence for scoring
- `optimizer.*` — Model, tokens, thresholds for prompt optimizer
- `quickwins.*` — Model, tokens, truncation for quick wins
- `retry.*` — Retry attempts, backoff delay
- `display.*` — Frontend thresholds (score colors, sparkline weeks, cache TTL)
- `rateLimit.*` — Rate limiting (requests, window)
- `conversation.*` — Conversation boundary detection

### Frontend delivery
- Extension: `getConfig` IPC message returns `display.*` keys
- Webapp: `GET /api/config` endpoint returns `display.*` keys
- Both frontends fall back to hardcoded defaults if config fetch fails

### VS Code Settings UI
Tier 1 settings exposed in VS Code Settings UI under "CodeFluent":
- `codefluent.scoring.model` — Model ID for scoring
- `codefluent.scoring.maxPromptsPerConversation` — Max prompts per conversation
- `codefluent.optimizer.alreadyGoodThreshold` — Score threshold for "already good"
- `codefluent.conversation.inactivityGapMinutes` — Conversation boundary gap

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
7. **`@types/vscode` and `engines.vscode` must move together** — `vsce package` enforces `@types/vscode` ≤ `engines.vscode`. `@types/vscode` is exact-pinned and Dependabot-ignored; bump both fields in the same commit when raising the VS Code floor (see CONTRIBUTING.md)

## When Stuck
- If extension doesn't activate, check `activationEvents` in `package.json` includes `onView:codefluent.dashboard`
- If buttons don't work in webview, check for inline `onclick` handlers (CSP blocks them)
- If VSIX is too small (<500KB), check `.vscodeignore` isn't excluding `node_modules/`
- If API key isn't found, check workspace folder has `.env` or set the env var
- If Quick Wins shows all repos, check that the workspace folder has a git remote
- If terminal launch gets interrupted by shell init, terminal uses `--norc --noprofile`

## Testing
```bash
cd vscode-extension && npm test    # Jest: 1017 tests across unit/ + integration/
cd webapp && uv run pytest tests/  # pytest: 859 tests across unit suites + tests/e2e/
```

Test files mirror their source modules (e.g., `parser.ts` ↔ `test/unit/parser.test.ts`, `conversations.py` ↔ `tests/test_conversations.py`). Coverage spans parsing, conversation assembly, scoring, analytics, caching, security (XSS, path traversal, error redaction), config, prompts, and platform helpers. List the test directories directly for the current inventory — don't maintain a duplicate index here.

### E2E Smoke Test Checklist

The 10 items below are automated under `webapp/tests/e2e/` (one Playwright file per item). CI runs the suite on PRs touching `webapp/` or `shared/`. Run locally with:

```bash
cd webapp
uv run pytest tests/e2e/ -m e2e -v
```

Manual Playwright MCP testing remains as a fallback for exploratory verification of new surfaces not yet covered by automation. The checklist below describes the contract each automated test enforces:

1. **Tab navigation** — all 7 tabs switch correctly, correct panel is visible
2. **Settings bar visibility** — data path input shows only on Fluency Score; project dropdown shows on Fluency Score, Conversations, Config, Optimizer, Quick Wins, Usage; settings bar hidden on Recommendations
3. **Project dropdown** — populates from session data when data path is set
4. **Fluency scoring** — Run Analysis button triggers analysis, results display with score ring and behavior bars
5. **Conversations tab** — summary cards, agent metrics cards (tool diversity, plan mode, cache hit, etc.), task-type pie chart, conversations-per-week chart, length/duration/gap distributions, sortable conversation list
6. **Config tab** — configuration maturity score and breakdown render for the selected project
7. **Prompt Optimizer** — paste prompt, click Optimize, input/output scores and optimized prompt appear
8. **Quick Wins** — Generate button works; project-scoped mode uses selected project
9. **Usage tab** — pace cards and Daily Token Usage chart aggregate from local JSONL (project-scoped via the dropdown); conversation analytics section shows efficiency cards, cost-efficiency scatter charts, and sortable conversation details table
10. **Health endpoint** — `GET /health` returns status, version, and dependency checks
