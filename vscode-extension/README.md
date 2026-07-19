# CodeFluent

**Comprehensive analytics for Claude Code users** — measure your AI collaboration skills, assess your project configuration, and get coached to improve.

CodeFluent parses your local Claude Code session files, scores your prompting behaviors against 11 research-backed fluency behaviors, analyzes conversation patterns and cost efficiency, assesses your project configuration maturity, and provides personalized coaching to make you a more effective AI collaborator.

## Getting Started

### Requirements

- **VS Code** 1.85 or later
- **Claude Code** installed and used (session data in `~/.claude/projects/`)
- **Anthropic API key** — for fluency scoring (set `ANTHROPIC_API_KEY` env var, add to workspace `.env`, or enter when prompted)
- **GitHub CLI (`gh`)** — optional, for Quick Wins repo context and issue suggestions

### Installation

1. Install the `.vsix` package:
   ```
   code --install-extension codefluent-1.3.0.vsix    # x-release-please-version
   ```
2. Open the CodeFluent sidebar by clicking the activity bar icon
3. When prompted, enter your Anthropic API key (stored securely in VS Code SecretStorage)

## Features

### Fluency Scoring

Your prompts are scored (0–100) against 11 behaviors that distinguish effective AI collaborators:

- Specificity, decomposition, context-setting, constraint use
- Iterative refinement, error recovery, verification requests
- And more — each scored individually with actionable feedback

A weekly trend sparkline tracks your score trajectory over time (improving, stable, or declining).

![Fluency Score Dashboard](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-scoring.png)

![Coding Interaction Patterns and Session Breakdown](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-scoring-2.png)

### Conversations Tab

Claude Code stores session data as JSONL files, but these files don't correspond to meaningful work units — a single file can span 8+ days of intermittent use. CodeFluent assembles **conversations** by pooling all messages per project, sorting by timestamp, and splitting into conversations whenever a gap between user prompts exceeds a configurable inactivity threshold (default: 60 minutes, configurable via `codefluent.conversation.inactivityGapMinutes`). `/clear` commands force a conversation boundary. Each conversation represents one focused interaction — the same unit of analysis used by Anthropic's AI Fluency Index.

Overview cards track metrics such as total conversations and average prompts per conversation. Agent metric cards with weekly sparklines provide insight into tool diversity, plan mode adoption, cache hit rate, and thinking utilization. A task type doughnut chart classifies conversations across 8 categories.

Five interactive charts visualize conversation patterns: conversations/week, length distribution, duration distribution, average prompts/week trend, and inter-prompt gap distribution.

A sortable table lists all conversations with date, project, prompts, duration, tokens, cost, cache%, tools, and score. Click any row to expand a detail view showing metadata, tools used, custom commands/skills invoked, and full user prompts.

![Conversations Tab](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-conversations.png)

![Conversations Charts](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-conversations-charts.png)

![Conversations Detail View](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-conversations-detail.png)

### Personalized Recommendations

Tailored coaching based on your weakest fluency behaviors, with high/medium impact categories, concrete prompt examples, and research citations.

![Recommendations](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-recommendations.png)

### Configuration Maturity

**The first tool to assess your Claude Code project configuration maturity.** Scans your `.claude/` directory and scores your setup (0–100) across 8 weighted categories: CLAUDE.md (20 pts), Hooks (20 pts), Rules (15 pts), Commands (10 pts), MCP (10 pts), Skills (10 pts), Permissions (5 pts), and Enforcement Coverage (10 pts). A tier badge (Beginner / Intermediate / Advanced / Expert) summarizes your maturity level.

Enforcement gap detection identifies rules in your CLAUDE.md that lack programmatic enforcement via hooks. The Configuration Advisor generates ready-to-use hook configurations from enforcement gaps using Claude, with one-click copy to clipboard.

Covers the same configuration competencies tested in the [Claude Certified Architect (CCA)](https://www.anthropic.com/news/claude-certified-architect) exam. This is the foundation for the CCA readiness radar and interaction quality metrics planned for future releases.

![Configuration Maturity](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-config.png)

![Configuration Gaps & Advisor](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-config-gaps.png)

### Prompt Optimizer

Paste any prompt and get an optimized version back. The optimizer considers your workspace CLAUDE.md config (scoring it on demand if not cached) so it won't add behaviors already covered by project conventions. Shows a side-by-side comparison with before/after effective scores so you can copy or run the improved prompt directly.

![Prompt Optimizer](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-optimizer.png)

### CLAUDE.md Config Scoring

Get credit for 3 meta-interaction behaviors that can be established as project conventions: *setting interaction terms*, *identifying missing context*, and *questioning reasoning*. If your `CLAUDE.md` defines these (e.g., "push back if wrong"), they boost your effective score via `conversation OR config` logic, with a "CLAUDE.md" attribution tag in the UI.

### Quick Wins

GitHub-repo-scoped task suggestions — CodeFluent detects your current workspace repo, fetches open issues, and suggests high-impact tasks you can launch directly in Claude Code with one click.

![Quick Wins Landing](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-quickwins-landing.png)

![Quick Wins Suggestions](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-quickwins.png)

### Usage Dashboard

Track daily and monthly token usage, costs, and conversation history — all aggregated from your local JSONL sessions and scoped to the current workspace. Conversation analytics shows per-conversation efficiency metrics, cost-efficiency scatter charts with fluency score color gradients, and a sortable details table with cost/prompt, cache hit rates, and output/input ratios.

![Usage Dashboard](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-usage.png)

![Conversation Analytics](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-usage-analytics.png)

![Cost Efficiency Charts](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-usage-charts.png)

## How It Works

1. **Parse** — JSONL session files from `~/.claude/projects/` are parsed to extract user prompts, assistant responses, and token usage metadata. System commands (`/clear`, `/compact`, etc.) are filtered out; custom commands and skills are tracked separately.
2. **Assemble conversations** — All messages per project are pooled, sorted by timestamp, and split into conversations at inactivity gaps between user prompts (`codefluent.conversation.inactivityGapMinutes`, default: 60 minutes). `/clear` commands force a conversation boundary. Each conversation is classified by task type (feature, bug fix, refactor, etc.) via heuristic analysis of branch names and prompt keywords.
3. **Score** — User prompts (up to 20 per conversation, max 2000 chars each) are sent to the scoring model (`codefluent.scoring.model`, default: `claude-sonnet-4-6`) with `temperature: 0` for deterministic fluency scoring against Anthropic's 11 behaviors and 6 coding interaction patterns
4. **Config scoring** — If a `CLAUDE.md` exists, it's scored against 3 config-eligible meta-interaction behaviors. Results are merged via `effective = conversation OR config`
5. **Config maturity** — The `.claude/` directory is scanned for hooks, rules, commands, skills, MCP servers, custom subagents, CLAUDE.md, and permissions. Enforcement gaps are detected by cross-referencing CLAUDE.md enforcement language against hook configuration.
6. **Agent metrics** — Tool diversity, plan mode adoption, cache hit rate, and thinking utilization are computed from parsed session metadata and aggregated weekly for trend analysis.
7. **Cache** — Scores are cached locally (by conversation ID, content hash, and prompt version) to avoid re-scoring unchanged conversations
8. **Usage analytics** — daily/monthly token totals are aggregated from parsed JSONL conversations and scoped to the current workspace; per-conversation efficiency metrics (cost/prompt, cache hit rates, output/input ratios) come from the same data source. Costs are computed via `shared/pricing.json` model rates.

Everything runs locally. No data leaves your machine except the API calls to Anthropic for scoring.

## Session Data

Claude Code stores session transcripts as JSONL files at `~/.claude/projects/` by default. If your session data is in a non-default location, set `codefluent.sessionDataPath` in VS Code settings. **Session transcripts are only available from late January 2026 onward** — earlier Claude Code usage was not persisted as full transcripts. Subagent sessions (spawned by Claude's Agent tool) are excluded from scoring because they contain AI-generated prompts, not human input.

CodeFluent assembles these raw session files into conversations (see [Conversations](#conversations) above) before scoring.

See [`docs/SESSION_DATA.md`](../docs/SESSION_DATA.md) for details on data availability, storage format, and scoring scope.

## Extension Settings

Search "CodeFluent" in VS Code Settings (`Ctrl+,`) to configure:

| Setting | Default | Description |
|---------|---------|-------------|
| `codefluent.sessionDataPath` | `~/.claude/projects/` | Custom path to Claude Code session data directory |
| `codefluent.scoring.model` | `claude-sonnet-4-6` | Model ID for fluency scoring API calls |
| `codefluent.scoring.maxPromptsPerConversation` | `20` | Maximum prompts per conversation sent for scoring |
| `codefluent.optimizer.alreadyGoodThreshold` | `90` | Score (0–100) at or above which prompts are considered already effective |
| `codefluent.conversation.inactivityGapMinutes` | `60` | Minutes of inactivity that defines a conversation boundary |

> **Warning:** Changing `inactivityGapMinutes` redefines how conversations are assembled, which affects all downstream metrics — fluency scores, analytics, agent metrics, and task classification. Cached scores will become stale and should be re-scored with "Force Rescore" enabled.

### API Key

CodeFluent uses the following resolution order:

1. `ANTHROPIC_API_KEY` environment variable
2. `.env` file in your workspace root
3. VS Code SecretStorage (persisted after first prompt)

**Prefer SecretStorage — this is the recommended path for most users.** It's stored once and reused across every workspace, and it's backed by your OS keychain so it never persists to a readable file. See the [Secrets handling](#secrets-handling) note below for why this matters.

**How to set or rotate the key in SecretStorage:**

1. Open the Command Palette (`Ctrl+Shift+P` on Linux/Windows, `Cmd+Shift+P` on macOS)
2. Type and select **`CodeFluent: Set API Key`**
3. Paste your key from the [Anthropic console](https://console.anthropic.com/settings/keys) — it's stored securely in your OS keychain

The same command works for both first-time setup and rotation. When you rotate at Anthropic, run this command once and every window picks up the new key on next scoring run — no per-workspace edits needed.

Alternatively, if you have no key configured yet, scoring will trigger a one-time interactive prompt that stores the key in SecretStorage automatically.

**Gotchas for the other slots:**

- **`.env` is per-workspace.** Only the currently-open workspace's `.env` is read. If you use `.env` across multiple repos, you'll need to copy the key into each one, and rotate every copy when the key changes.
- **Environment variables are captured at VS Code launch.** Reloading a window does not refresh `process.env` — a stale `export ANTHROPIC_API_KEY` in your shell rc (`~/.bashrc`, `~/.zshrc`, etc.) will silently override `.env` and SecretStorage in every window until you fully quit VS Code and relaunch from a shell where the variable is unset or updated.

## Privacy

All data stays on your machine. CodeFluent reads local session files and makes direct Anthropic API calls for scoring — no telemetry, no external servers, no data collection.

### Secrets handling

Claude Code persists every tool call and its output to JSONL transcripts at `~/.claude/projects/`. If Claude ever reads a `.env` file during a session (yours or one in your workspace), the contents of that file end up in those transcripts in plaintext — the same transcripts CodeFluent parses. `.gitignore` does not protect against this.

To reduce the risk, prefer VS Code SecretStorage for your Anthropic API key (see above), scope the key to CodeFluent alone with a monthly spend cap in the [Anthropic console](https://console.anthropic.com/settings/keys), and never paste raw `sk-ant-*` values into Claude prompts.

The CodeFluent repository itself ships Claude Code hooks that block reads of `.env`, SSH keys, and other credential files during development — see [`SECURITY.md`](https://github.com/frederick-douglas-pearce/codefluent/blob/main/SECURITY.md) for the full policy, an audit one-liner for historical leaks in your existing `~/.claude/projects/`, and instructions for deploying the same hooks at user scope to protect all your Claude Code sessions.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **No sessions found** | Check that `~/.claude/projects/` contains `.jsonl` session files. Claude Code creates these automatically during use. |
| **API key not found** | The extension checks: env var → workspace `.env` → VS Code secrets → interactive prompt. Make sure `ANTHROPIC_API_KEY` is set in at least one location. |
| **Scoring returns 401 in some workspaces but not others** | You're using `.env` in one workspace and it isn't present (or is stale) in another. Copy the current key into each workspace's `.env`, or clear it from every workspace to let SecretStorage take over. |
| **Scoring returns 401 in every workspace after rotating the key** | A stale `ANTHROPIC_API_KEY` is exported in your shell rc and was inherited when VS Code launched. Env vars are captured at launch, not per-window — fully quit VS Code and relaunch from a shell where the variable is unset or updated. |
| **Quick Wins shows no results** | Run `gh auth login` to authenticate the GitHub CLI. |
| **Usage tab is empty** | Make sure you've used Claude Code in the current workspace so `~/.claude/projects/<workspace>/*.jsonl` files exist. The Usage tab is scoped to the current workspace project. |
| **Extension doesn't activate** | Look for the CodeFluent icon in the activity bar. If missing, try reloading the window (`Ctrl+Shift+P` → "Reload Window"). |

## Roadmap

**Recently shipped (v1.2):**
- **Scoring prompt v2.1** — tightened behavior definitions with few-shot examples for borderline cases (iter, QR, providing_feedback, IMC), reaching 92.4%+ overall agreement on the eval golden set
- **Sonnet 4.6 migration** — scoring/optimizer/quickwins now default to `claude-sonnet-4-6`
- **LLM task classification** — task_type field on every conversation with Cohen's Kappa ≥0.9 vs human labels
- **Interaction quality metrics** — error recovery pattern detection in conversation flow

**Planned (v1.3+):**
- **CCA readiness radar** — 5-axis radar chart mapping your usage to Claude Certified Architect competency domains
- **Scoring quality infrastructure** — confidence calibration, temperature-zero variance baseline, user feedback signals, cross-model agreement testing
- **Outcome metrics** — commit quality analysis, MCP integration assessment

See the [Release Roadmap](https://github.com/frederick-douglas-pearce/codefluent/blob/main/docs/RELEASE_ROADMAP.md) for details, or browse [open milestones](https://github.com/frederick-douglas-pearce/codefluent/milestones) on GitHub.

## Research Foundations

CodeFluent's scoring framework is grounded in published Anthropic research:

- [AI Fluency Index](https://www.anthropic.com/research/AI-fluency-index) (Feb 2026) — 11 behavioral indicators and population benchmarks
- [Coding Skills Formation with AI](https://www.anthropic.com/research/coding-skill-formation) (Jan 2026) — 6 coding interaction patterns and quality analysis
- [Claude Code Best Practices](https://www.anthropic.com/research/claude-code-best-practices) — Practical guidelines for effective AI collaboration

## Contributing

CodeFluent is open source and actively looking for contributors! Whether it's bug fixes, new features, or improving the scoring framework — all contributions are welcome. Check out the [open issues](https://github.com/frederick-douglas-pearce/codefluent/issues) for ideas, or see [`CONTRIBUTING.md`](https://github.com/frederick-douglas-pearce/codefluent/blob/main/CONTRIBUTING.md) for dev setup and guidelines.

## License

[MIT](../LICENSE)
